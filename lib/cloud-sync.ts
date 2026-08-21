import { db, ensureSeedData, SCHEMA_VERSION } from './db';
import type {
  BoardItem,
  Collection,
  DeletedEntity,
  DeletedEntityType,
  Workspace,
} from './types';
import type { CloudSyncStatus } from './cloud-sync-messages';

const STORAGE_KEY = 'chihiroCloudSync';
const SNAPSHOT_PATH = '/v1/snapshot';
const VERSION_HEADER = 'x-chihiro-version';
const MAX_SYNC_ATTEMPTS = 3;
const PBKDF2_ITERATIONS = 210_000;

interface StoredCloudSyncSettings {
  enabled: boolean;
  endpoint: string;
  accessToken: string;
  encryptionPassphrase: string;
  deviceId: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface ChihiroSyncSnapshot {
  format: 'chihiro-sync';
  formatVersion: 1;
  schemaVersion: number;
  generatedAt: string;
  deviceId: string;
  workspaces: Workspace[];
  collections: Collection[];
  items: BoardItem[];
  deletedEntities: DeletedEntity[];
}

interface EncryptedSyncEnvelope {
  format: 'chihiro-sync-encrypted';
  formatVersion: 1;
  algorithm: 'AES-GCM';
  keyDerivation: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  contentHash: string;
  ciphertext: string;
}

function createDeviceId() {
  return globalThis.crypto.randomUUID();
}

function normalizeEndpoint(value: string) {
  const url = new URL(value.trim());
  const localDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) {
    throw new Error('同步地址必须使用 HTTPS');
  }
  if (url.search || url.hash) throw new Error('同步地址不能包含查询参数或锚点');
  return url.toString().replace(/\/$/, '');
}

async function getStoredSettings(): Promise<StoredCloudSyncSettings | undefined> {
  const result = await browser.storage.local.get(STORAGE_KEY) as Record<string, unknown>;
  const value = result[STORAGE_KEY];
  if (!value || typeof value !== 'object') return undefined;
  return value as StoredCloudSyncSettings;
}

async function saveStoredSettings(value: StoredCloudSyncSettings) {
  await browser.storage.local.set({ [STORAGE_KEY]: value });
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  const settings = await getStoredSettings();
  return {
    enabled: settings?.enabled ?? false,
    configured: Boolean(settings?.endpoint && settings.accessToken && settings.encryptionPassphrase),
    endpoint: settings?.endpoint ?? '',
    lastSyncedAt: settings?.lastSyncedAt,
    lastError: settings?.lastError,
  };
}

export async function configureCloudSync(input: {
  endpoint: string;
  accessToken?: string;
  encryptionPassphrase?: string;
}) {
  const current = await getStoredSettings();
  const accessToken = input.accessToken?.trim() || current?.accessToken || '';
  const encryptionPassphrase = input.encryptionPassphrase || current?.encryptionPassphrase || '';
  if (accessToken.length < 24) throw new Error('同步 Token 至少需要 24 个字符');
  if (encryptionPassphrase.length < 16) throw new Error('加密口令至少需要 16 个字符');
  await saveStoredSettings({
    enabled: true,
    endpoint: normalizeEndpoint(input.endpoint),
    accessToken,
    encryptionPassphrase,
    deviceId: current?.deviceId || createDeviceId(),
    lastSyncedAt: current?.lastSyncedAt,
  });
  return getCloudSyncStatus();
}

export async function disableCloudSync() {
  const current = await getStoredSettings();
  if (current) await saveStoredSettings({ ...current, enabled: false, lastError: undefined });
  return getCloudSyncStatus();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(hash));
}

async function deriveEncryptionKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(salt).buffer, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function snapshotContent(snapshot: ChihiroSyncSnapshot) {
  return {
    workspaces: [...snapshot.workspaces].sort((left, right) => left.id.localeCompare(right.id)),
    collections: [...snapshot.collections].sort((left, right) => left.id.localeCompare(right.id)),
    items: [...snapshot.items].sort((left, right) => left.id.localeCompare(right.id)),
    deletedEntities: [...snapshot.deletedEntities].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

async function snapshotHash(snapshot: ChihiroSyncSnapshot) {
  return sha256(stableStringify(snapshotContent(snapshot)));
}

async function encryptSnapshot(snapshot: ChihiroSyncSnapshot, passphrase: string): Promise<EncryptedSyncEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    format: 'chihiro-sync-encrypted',
    formatVersion: 1,
    algorithm: 'AES-GCM',
    keyDerivation: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    contentHash: await snapshotHash(snapshot),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

function assertSnapshot(value: unknown): asserts value is ChihiroSyncSnapshot {
  if (!value || typeof value !== 'object') throw new Error('云端快照格式无效');
  const candidate = value as Partial<ChihiroSyncSnapshot>;
  if (candidate.format !== 'chihiro-sync' || candidate.formatVersion !== 1) {
    throw new Error('云端快照版本不受支持');
  }
  if ((candidate.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error('请先升级千寻后再同步此云端数据');
  if (!candidate.generatedAt || Number.isNaN(Date.parse(candidate.generatedAt))) throw new Error('云端快照时间无效');
  if (!candidate.deviceId || typeof candidate.deviceId !== 'string') throw new Error('云端快照缺少设备标识');
  for (const key of ['workspaces', 'collections', 'items', 'deletedEntities'] as const) {
    if (!Array.isArray(candidate[key])) throw new Error(`云端快照缺少 ${key}`);
  }

  const workspaces = candidate.workspaces as Workspace[];
  const collections = candidate.collections as Collection[];
  const items = candidate.items as BoardItem[];
  const deletedEntities = candidate.deletedEntities as DeletedEntity[];
  if (workspaces.length + collections.length + items.length + deletedEntities.length > 100_000) {
    throw new Error('云端快照记录数超出限制');
  }
  const validEntity = (entry: { id?: unknown; updatedAt?: unknown }) =>
    typeof entry?.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(entry.updatedAt));
  if (![...workspaces, ...collections, ...items].every(validEntity)) {
    throw new Error('云端快照包含无效实体');
  }
  const workspaceIds = new Set(workspaces.map((entry) => entry.id));
  const collectionIds = new Set(collections.map((entry) => entry.id));
  const itemIds = new Set(items.map((entry) => entry.id));
  const deletedKeys = new Set(deletedEntities.map((entry) => entry.key));
  if (
    workspaceIds.size !== workspaces.length ||
    collectionIds.size !== collections.length ||
    itemIds.size !== items.length ||
    deletedKeys.size !== deletedEntities.length
  ) {
    throw new Error('云端快照包含重复实体');
  }
  if (collections.some((entry) => !workspaceIds.has(entry.workspaceId))) {
    throw new Error('云端快照包含无效集合关系');
  }
  if (items.some((entry) => !collectionIds.has(entry.collectionId))) {
    throw new Error('云端快照包含无效资料关系');
  }
  if (deletedEntities.some((entry) =>
    !['workspace', 'collection', 'item'].includes(entry.entityType) ||
    entry.key !== `${entry.entityType}:${entry.entityId}` ||
    Number.isNaN(Date.parse(entry.deletedAt)))) {
    throw new Error('云端快照包含无效删除记录');
  }
}

async function decryptSnapshot(envelope: EncryptedSyncEnvelope, passphrase: string) {
  if (
    envelope.format !== 'chihiro-sync-encrypted' ||
    envelope.formatVersion !== 1 ||
    envelope.algorithm !== 'AES-GCM' ||
    envelope.keyDerivation !== 'PBKDF2-SHA-256' ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < 100_000 ||
    envelope.iterations > 1_000_000
  ) {
    throw new Error('云端加密数据格式无效');
  }
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const key = await deriveEncryptionKey(passphrase, salt, envelope.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    const snapshot = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    assertSnapshot(snapshot);
    if (await snapshotHash(snapshot) !== envelope.contentHash) throw new Error('云端数据校验失败');
    return snapshot;
  } catch (reason) {
    if (reason instanceof Error && reason.message.startsWith('云端')) throw reason;
    throw new Error('无法解密云端数据，请检查加密口令');
  }
}

async function createLocalSnapshot(deviceId: string): Promise<ChihiroSyncSnapshot> {
  await ensureSeedData();
  const [workspaces, collections, items, deletedEntities] = await Promise.all([
    db.workspaces.toArray(),
    db.collections.toArray(),
    db.items.toArray(),
    db.deletedEntities.toArray(),
  ]);
  return {
    format: 'chihiro-sync',
    formatVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    deviceId,
    workspaces,
    collections,
    items,
    deletedEntities,
  };
}

function entityTable(entityType: DeletedEntityType) {
  if (entityType === 'workspace') return db.workspaces;
  if (entityType === 'collection') return db.collections;
  return db.items;
}

async function mergeRemoteSnapshot(remote: ChihiroSyncSnapshot) {
  const [localWorkspaces, localCollections, localItemCount, localDeletionCount] = await Promise.all([
    db.workspaces.toArray(),
    db.collections.toArray(),
    db.items.count(),
    db.deletedEntities.count(),
  ]);
  const pristineSeed =
    localItemCount === 0 &&
    localDeletionCount === 0 &&
    localWorkspaces.length === 1 &&
    localCollections.length === 1 &&
    localWorkspaces[0]?.name === '我的空间' &&
    localCollections[0]?.name === '收件箱' &&
    localCollections[0]?.workspaceId === localWorkspaces[0]?.id;

  await db.transaction('rw', [db.workspaces, db.collections, db.items, db.deletedEntities], async () => {
    if (pristineSeed && (remote.workspaces.length > 0 || remote.collections.length > 0 || remote.items.length > 0)) {
      await db.workspaces.clear();
      await db.collections.clear();
    }
    for (const tombstone of remote.deletedEntities) {
      const table = entityTable(tombstone.entityType);
      const local = await table.get(tombstone.entityId) as { updatedAt?: string } | undefined;
      if (!local?.updatedAt || tombstone.deletedAt >= local.updatedAt) await table.delete(tombstone.entityId);
      const current = await db.deletedEntities.get(tombstone.key);
      if (!current || tombstone.deletedAt > current.deletedAt) await db.deletedEntities.put(tombstone);
    }

    const mergeEntries = async <T extends { id: string; updatedAt: string }>(
      entityType: DeletedEntityType,
      table: typeof db.workspaces | typeof db.collections | typeof db.items,
      entries: T[],
    ) => {
      for (const entry of entries) {
        const key = `${entityType}:${entry.id}`;
        const tombstone = await db.deletedEntities.get(key);
        if (tombstone && tombstone.deletedAt >= entry.updatedAt) continue;
        const local = await table.get(entry.id) as { updatedAt?: string } | undefined;
        if (!local?.updatedAt || entry.updatedAt > local.updatedAt) await table.put(entry as never);
        if (tombstone && entry.updatedAt > tombstone.deletedAt) await db.deletedEntities.delete(key);
      }
    };

    await mergeEntries('workspace', db.workspaces, remote.workspaces);
    await mergeEntries('collection', db.collections, remote.collections);
    await mergeEntries('item', db.items, remote.items);
  });
  await ensureSeedData();
}

function requestHeaders(settings: StoredCloudSyncSettings) {
  return {
    Authorization: `Bearer ${settings.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function syncAttempt(settings: StoredCloudSyncSettings) {
  const url = `${settings.endpoint}${SNAPSHOT_PATH}`;
  const remoteResponse = await fetchWithTimeout(url, { method: 'GET', headers: requestHeaders(settings) });
  let remoteEnvelope: EncryptedSyncEnvelope | undefined;
  let remoteVersion: string | null = null;

  if (remoteResponse.status === 200) {
    remoteEnvelope = await remoteResponse.json() as EncryptedSyncEnvelope;
    remoteVersion = remoteResponse.headers.get(VERSION_HEADER) ||
      remoteResponse.headers.get('etag')?.replace(/^W\//, '').replace(/^"|"$/g, '') || null;
    if (!remoteVersion) throw new Error('云端未返回快照版本，请更新同步服务');
    await mergeRemoteSnapshot(await decryptSnapshot(remoteEnvelope, settings.encryptionPassphrase));
  } else if (remoteResponse.status !== 404) {
    throw new Error(remoteResponse.status === 401 ? '同步 Token 无效' : `读取云端数据失败（${remoteResponse.status}）`);
  }

  const local = await createLocalSnapshot(settings.deviceId);
  const localHash = await snapshotHash(local);
  if (remoteEnvelope?.contentHash === localHash) return true;

  const envelope = await encryptSnapshot(local, settings.encryptionPassphrase);
  const uploadHeaders = new Headers(requestHeaders(settings));
  uploadHeaders.set(remoteVersion ? VERSION_HEADER : 'If-None-Match', remoteVersion || '*');
  const uploadResponse = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: uploadHeaders,
    body: JSON.stringify(envelope),
  });
  if (uploadResponse.status === 412) return false;
  if (!uploadResponse.ok) {
    throw new Error(uploadResponse.status === 401 ? '同步 Token 无效' : `写入云端数据失败（${uploadResponse.status}）`);
  }
  return true;
}

let activeSync: Promise<CloudSyncStatus> | undefined;

export async function performCloudSync() {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const settings = await getStoredSettings();
    if (!settings?.enabled || !settings.endpoint || !settings.accessToken || !settings.encryptionPassphrase) {
      throw new Error('请先完成云同步配置');
    }
    try {
      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
        if (await syncAttempt(settings)) {
          const updated = { ...settings, lastSyncedAt: new Date().toISOString(), lastError: undefined };
          await saveStoredSettings(updated);
          return getCloudSyncStatus();
        }
      }
      throw new Error('云端数据正在被其他设备更新，请稍后重试');
    } catch (reason) {
      const message = reason instanceof Error
        ? (reason.name === 'AbortError' ? '连接云端超时' : reason.message)
        : '云同步失败';
      await saveStoredSettings({ ...settings, lastError: message });
      throw new Error(message);
    }
  })().finally(() => {
    activeSync = undefined;
  });
  return activeSync;
}

let scheduledSync: number | undefined;

export async function scheduleCloudSync(delay = 1_500) {
  const status = await getCloudSyncStatus();
  if (!status.enabled || !status.configured) return status;
  clearTimeout(scheduledSync);
  scheduledSync = setTimeout(() => {
    void performCloudSync().catch(() => undefined);
  }, delay) as unknown as number;
  return status;
}
