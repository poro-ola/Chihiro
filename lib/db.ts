import Dexie, { type Table } from 'dexie';
import type {
  AppMeta,
  AppSettings,
  BoardItem,
  BookmarkItem,
  Collection,
  DeletedEntity,
  DeletedEntityType,
  NoteItem,
  Reminder,
  RequestItem,
  Workspace,
} from './types';
import { REQUEST_COMMAND_MAX_LENGTH } from './types';
import { dateKey, prepareReminderInput, resolveReminder, type ReminderInput } from './reminders';

export const APP_VERSION = '0.1.0';
export const SCHEMA_VERSION = 4;

const APP_ROW_ID = 'app' as const;

export class ChihiroDatabase extends Dexie {
  workspaces!: Table<Workspace, string>;
  collections!: Table<Collection, string>;
  items!: Table<BoardItem, string>;
  settings!: Table<AppSettings, string>;
  appMeta!: Table<AppMeta, string>;
  deletedEntities!: Table<DeletedEntity, string>;
  reminders!: Table<Reminder, string>;

  constructor() {
    // Keep the legacy storage key so upgrades continue reading existing local data.
    super('qianxun');

    this.version(1).stores({
      workspaces: 'id, order, updatedAt',
      collections: 'id, workspaceId, [workspaceId+order], updatedAt',
      items: 'id, collectionId, type, [collectionId+order], normalizedUrl, updatedAt',
      settings: 'id',
      appMeta: 'id, schemaVersion, appVersion',
    });

    this.version(2).stores({
      workspaces: 'id, order, updatedAt',
      collections: 'id, workspaceId, order, [workspaceId+order], updatedAt',
      items: 'id, collectionId, type, order, [collectionId+order], normalizedUrl, updatedAt',
      settings: 'id',
      appMeta: 'id, schemaVersion, appVersion',
    });

    this.version(3).stores({
      workspaces: 'id, order, updatedAt',
      collections: 'id, workspaceId, order, [workspaceId+order], updatedAt',
      items: 'id, collectionId, type, order, [collectionId+order], normalizedUrl, updatedAt',
      settings: 'id',
      appMeta: 'id, schemaVersion, appVersion',
      deletedEntities: 'key, entityType, entityId, deletedAt',
    });

    this.version(4).stores({
      workspaces: 'id, order, updatedAt',
      collections: 'id, workspaceId, order, [workspaceId+order], updatedAt',
      items: 'id, collectionId, type, order, [collectionId+order], normalizedUrl, updatedAt',
      settings: 'id',
      appMeta: 'id, schemaVersion, appVersion',
      deletedEntities: 'key, entityType, entityId, deletedAt',
      reminders: 'id, kind, repeat, date, updatedAt',
    });
  }
}

export const db = new ChihiroDatabase();

function createId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function now() {
  return new Date().toISOString();
}

function deletedEntity(entityType: DeletedEntityType, entityId: string, deletedAt: string): DeletedEntity {
  return { key: `${entityType}:${entityId}`, entityType, entityId, deletedAt };
}

function prepareBookmarkNote(value?: string) {
  return value?.trim() ? value : undefined;
}

export function prepareUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) throw new Error('请输入网址');

  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http 或 https 网址');
  }

  return url.toString();
}

export function normalizeUrl(value: string) {
  const url = new URL(prepareUrl(value));
  url.hostname = url.hostname.toLowerCase();

  const trackingKeys = new Set(['fbclid', 'gclid', 'dclid', 'msclkid']);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || trackingKeys.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  if (url.pathname === '/' && !url.search && !url.hash) url.pathname = '';
  return url.toString();
}

export async function ensureSeedData() {
  await db.transaction('rw', db.workspaces, db.collections, db.settings, db.appMeta, async () => {
    const firstWorkspace = await db.workspaces.orderBy('order').first();
    const createdAt = now();
    let workspaceId = firstWorkspace?.id;

    if (!workspaceId) {
      workspaceId = createId('workspace');
      const collectionId = createId('collection');

      await db.workspaces.add({
        id: workspaceId,
        name: '我的空间',
        order: 0,
        createdAt,
        updatedAt: createdAt,
      });
      await db.collections.add({
        id: collectionId,
        workspaceId,
        name: '收件箱',
        order: 0,
        isCollapsed: false,
        createdAt,
        updatedAt: createdAt,
      });
    }

    const settings = await db.settings.get(APP_ROW_ID);
    if (!settings) {
      await db.settings.add({
        id: APP_ROW_ID,
        activeWorkspaceId: workspaceId,
        leftPanelCollapsed: false,
        rightPanelCollapsed: false,
        compactMode: false,
        boardIntroDismissed: false,
        contentNoteButtonRatio: 0.5,
      });
    } else {
      const updates: Partial<AppSettings> = {};
      if (!(await db.workspaces.get(settings.activeWorkspaceId))) {
        updates.activeWorkspaceId = workspaceId;
      }
      if (typeof settings.compactMode !== 'boolean') {
        updates.compactMode = false;
      }
      if (typeof settings.boardIntroDismissed !== 'boolean') {
        updates.boardIntroDismissed = false;
      }
      if (typeof settings.contentNoteButtonRatio !== 'number') {
        updates.contentNoteButtonRatio = 0.5;
      }
      if (Object.keys(updates).length) await db.settings.update(APP_ROW_ID, updates);
    }

    const meta = await db.appMeta.get(APP_ROW_ID);
    if (!meta) {
      await db.appMeta.add({
        id: APP_ROW_ID,
        schemaVersion: SCHEMA_VERSION,
        appVersion: APP_VERSION,
        createdAt,
        updatedAt: createdAt,
      });
    } else if (meta.appVersion !== APP_VERSION || meta.schemaVersion !== SCHEMA_VERSION) {
      await db.appMeta.update(APP_ROW_ID, {
        schemaVersion: SCHEMA_VERSION,
        appVersion: APP_VERSION,
        updatedAt: createdAt,
      });
    }
  });
}

export async function createWorkspace(name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('空间名称不能为空');
  const createdAt = now();
  const workspaceId = createId('workspace');
  const collectionId = createId('collection');
  const order = await db.workspaces.count();

  await db.transaction('rw', db.workspaces, db.collections, db.settings, async () => {
    await db.workspaces.add({ id: workspaceId, name: cleanName, order, createdAt, updatedAt: createdAt });
    await db.collections.add({
      id: collectionId,
      workspaceId,
      name: '收件箱',
      order: 0,
      isCollapsed: false,
      createdAt,
      updatedAt: createdAt,
    });
    await db.settings.update(APP_ROW_ID, { activeWorkspaceId: workspaceId });
  });

  return workspaceId;
}

export async function renameWorkspace(id: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('空间名称不能为空');
  await db.workspaces.update(id, { name: cleanName, updatedAt: now() });
}

export async function reorderWorkspaces(activeId: string, overId: string) {
  if (activeId === overId) return;
  await db.transaction('rw', db.workspaces, async () => {
    const entries = await db.workspaces.orderBy('order').toArray();
    const from = entries.findIndex((entry) => entry.id === activeId);
    const to = entries.findIndex((entry) => entry.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = entries.splice(from, 1);
    if (!moved) return;
    entries.splice(to, 0, moved);
    const timestamp = now();
    await db.workspaces.bulkPut(entries.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
  });
}

export async function deleteWorkspace(id: string) {
  await db.transaction('rw', [db.workspaces, db.collections, db.items, db.settings, db.deletedEntities], async () => {
    const timestamp = now();
    const collections = await db.collections.where('workspaceId').equals(id).toArray();
    const collectionIds = collections.map((collection) => collection.id);
    const items = collectionIds.length ? await db.items.where('collectionId').anyOf(collectionIds).toArray() : [];
    await db.deletedEntities.bulkPut([
      deletedEntity('workspace', id, timestamp),
      ...collections.map((collection) => deletedEntity('collection', collection.id, timestamp)),
      ...items.map((item) => deletedEntity('item', item.id, timestamp)),
    ]);
    if (collectionIds.length) await db.items.where('collectionId').anyOf(collectionIds).delete();
    await db.collections.where('workspaceId').equals(id).delete();
    await db.workspaces.delete(id);

    const remaining = await db.workspaces.orderBy('order').toArray();
    await db.workspaces.bulkPut(remaining.map((workspace, order) => ({ ...workspace, order, updatedAt: timestamp })));
    if (remaining[0]) await db.settings.update(APP_ROW_ID, { activeWorkspaceId: remaining[0].id });
  });
  await ensureSeedData();
}

export async function setActiveWorkspace(activeWorkspaceId: string) {
  await db.settings.update(APP_ROW_ID, { activeWorkspaceId });
}

export async function updateAppSetting(
  key: 'leftPanelCollapsed' | 'rightPanelCollapsed' | 'compactMode' | 'boardIntroDismissed',
  value: boolean,
) {
  await db.settings.update(APP_ROW_ID, { [key]: value });
}

export async function createCollection(workspaceId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('集合名称不能为空');
  const order = await db.collections.where('workspaceId').equals(workspaceId).count();
  const timestamp = now();
  const id = createId('collection');
  await db.collections.add({
    id,
    workspaceId,
    name: cleanName,
    order,
    isCollapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return id;
}

export async function renameCollection(id: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('集合名称不能为空');
  await db.collections.update(id, { name: cleanName, updatedAt: now() });
}

export async function toggleCollection(id: string, isCollapsed: boolean) {
  await db.collections.update(id, { isCollapsed, updatedAt: now() });
}

export async function deleteCollection(id: string) {
  await db.transaction('rw', db.collections, db.items, db.deletedEntities, async () => {
    const collection = await db.collections.get(id);
    if (!collection) return;
    const timestamp = now();
    const items = await db.items.where('collectionId').equals(id).toArray();
    await db.deletedEntities.bulkPut([
      deletedEntity('collection', id, timestamp),
      ...items.map((item) => deletedEntity('item', item.id, timestamp)),
    ]);
    await db.items.where('collectionId').equals(id).delete();
    await db.collections.delete(id);
    const siblings = await db.collections.where('workspaceId').equals(collection.workspaceId).sortBy('order');
    await db.collections.bulkPut(siblings.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
  });
}

export async function reorderCollections(workspaceId: string, activeId: string, overId: string) {
  if (activeId === overId) return;
  await db.transaction('rw', db.collections, async () => {
    const entries = await db.collections.where('workspaceId').equals(workspaceId).sortBy('order');
    const from = entries.findIndex((entry) => entry.id === activeId);
    const to = entries.findIndex((entry) => entry.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = entries.splice(from, 1);
    if (!moved) return;
    entries.splice(to, 0, moved);
    const timestamp = now();
    await db.collections.bulkPut(entries.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
  });
}

export async function createBookmark(
  collectionId: string,
  input: { title: string; url: string; note?: string; faviconUrl?: string },
  targetIndex?: number,
) {
  const url = prepareUrl(input.url);
  const normalizedUrl = normalizeUrl(url);
  const duplicate = await db.items
    .where('collectionId')
    .equals(collectionId)
    .filter((item): item is BookmarkItem =>
      item.type === 'bookmark' && !item.archivedAt && item.normalizedUrl === normalizedUrl,
    )
    .first();

  if (duplicate) return { created: false as const, item: duplicate };

  const timestamp = now();
  const item: BookmarkItem = {
    id: createId('bookmark'),
    collectionId,
    type: 'bookmark',
    title: input.title.trim() || new URL(url).hostname,
    url,
    normalizedUrl,
    note: prepareBookmarkNote(input.note),
    faviconUrl: input.faviconUrl,
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.transaction('rw', db.items, async () => {
    const siblings = (await db.items.where('collectionId').equals(collectionId).sortBy('order'))
      .filter((entry) => !entry.archivedAt);
    const index = Math.min(Math.max(targetIndex ?? siblings.length, 0), siblings.length);
    siblings.splice(index, 0, item);
    await db.items.bulkPut(siblings.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
  });

  return { created: true as const, item };
}

export async function updateBookmark(
  id: string,
  input: { title: string; url: string; note?: string },
) {
  const existing = await db.items.get(id);
  if (!existing || existing.type !== 'bookmark') throw new Error('书签不存在');
  const url = prepareUrl(input.url);
  const normalizedUrl = normalizeUrl(url);
  const duplicate = await db.items
    .where('collectionId')
    .equals(existing.collectionId)
    .filter(
      (item) =>
        item.type === 'bookmark' &&
        !item.archivedAt &&
        item.id !== id &&
        item.normalizedUrl === normalizedUrl,
    )
    .first();
  if (duplicate) throw new Error('这个集合里已有相同链接');

  await db.items.put({
    ...existing,
    title: input.title.trim() || new URL(url).hostname,
    url,
    normalizedUrl,
    note: prepareBookmarkNote(input.note),
    updatedAt: now(),
  });
}

export async function updateBookmarkNote(id: string, note: string) {
  const existing = await db.items.get(id);
  if (!existing || existing.type !== 'bookmark') throw new Error('书签不存在');
  await db.items.put({ ...existing, note: prepareBookmarkNote(note), updatedAt: now() });
}

export async function createNote(collectionId: string) {
  const timestamp = now();
  const siblings = (await db.items.where('collectionId').equals(collectionId).sortBy('order'))
    .filter((entry) => !entry.archivedAt);
  const note: NoteItem = {
    id: createId('note'),
    collectionId,
    type: 'note',
    content: '',
    order: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.items.add(note);
  return note;
}

export async function updateNote(id: string, content: string) {
  const existing = await db.items.get(id);
  if (!existing || existing.type !== 'note') throw new Error('记事不存在');
  await db.items.put({ ...existing, content, updatedAt: now() });
}

export async function createRequest(collectionId: string) {
  const timestamp = now();
  const siblings = (await db.items.where('collectionId').equals(collectionId).sortBy('order'))
    .filter((entry) => !entry.archivedAt);
  const request: RequestItem = {
    id: createId('request'),
    collectionId,
    type: 'request',
    title: '未命名请求',
    command: '',
    order: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.items.add(request);
  return request;
}

export async function updateRequest(id: string, input: { title: string; command: string }) {
  if (input.command.length > REQUEST_COMMAND_MAX_LENGTH) {
    throw new Error(`单条请求最多 ${REQUEST_COMMAND_MAX_LENGTH.toLocaleString()} 字`);
  }
  const existing = await db.items.get(id);
  if (!existing || existing.type !== 'request') throw new Error('请求卡片不存在');
  await db.items.put({
    ...existing,
    title: input.title.trim().slice(0, 200) || '未命名请求',
    command: input.command,
    updatedAt: now(),
  });
}

export async function deleteItem(id: string) {
  const item = await db.items.get(id);
  if (!item) return undefined;
  await db.transaction('rw', db.items, db.deletedEntities, async () => {
    const timestamp = now();
    await db.items.delete(id);
    await db.deletedEntities.put(deletedEntity('item', id, timestamp));
    const siblings = (await db.items.where('collectionId').equals(item.collectionId).sortBy('order'))
      .filter((entry) => !entry.archivedAt);
    await db.items.bulkPut(siblings.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
  });
  return item;
}

export async function restoreItem(item: BoardItem) {
  await db.transaction('rw', db.items, db.deletedEntities, async () => {
    const restoredAt = now();
    const siblings = (await db.items.where('collectionId').equals(item.collectionId).sortBy('order'))
      .filter((entry) => Boolean(entry.archivedAt) === Boolean(item.archivedAt));
    const index = Math.min(item.order, siblings.length);
    siblings.splice(index, 0, { ...item, updatedAt: restoredAt });
    await db.items.bulkPut(siblings.map((entry, order) => ({ ...entry, order, updatedAt: restoredAt })));
    await db.deletedEntities.delete(`item:${item.id}`);
  });
}

export async function moveItem(itemId: string, collectionId: string, targetIndex?: number) {
  await db.transaction('rw', db.items, async () => {
    const item = await db.items.get(itemId);
    if (!item || item.archivedAt) return;
    const sourceCollectionId = item.collectionId;
    const sourceItems = (await db.items.where('collectionId').equals(sourceCollectionId).sortBy('order'))
      .filter((entry) => !entry.archivedAt);
    const sourceIndex = sourceItems.findIndex((entry) => entry.id === itemId);
    if (sourceIndex < 0) return;
    sourceItems.splice(sourceIndex, 1);
    const timestamp = now();

    if (sourceCollectionId === collectionId) {
      const index = Math.min(Math.max(targetIndex ?? sourceItems.length, 0), sourceItems.length);
      sourceItems.splice(index, 0, item);
      await db.items.bulkPut(sourceItems.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
      return;
    }

    const targetItems = (await db.items.where('collectionId').equals(collectionId).sortBy('order'))
      .filter((entry) => !entry.archivedAt);
    const index = Math.min(Math.max(targetIndex ?? targetItems.length, 0), targetItems.length);
    targetItems.splice(index, 0, { ...item, collectionId, updatedAt: timestamp });

    await db.items.bulkPut(sourceItems.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
    await db.items.bulkPut(targetItems.map((entry, order) => ({ ...entry, order, updatedAt: timestamp })));
  });
}

export async function archiveItem(id: string) {
  const item = await db.items.get(id);
  if (!item || item.archivedAt) return item;

  const archivedAt = now();
  await db.transaction('rw', db.items, async () => {
    await db.items.put({ ...item, archivedAt, updatedAt: archivedAt });
    const siblings = (await db.items.where('collectionId').equals(item.collectionId).sortBy('order'))
      .filter((entry) => !entry.archivedAt);
    await db.items.bulkPut(siblings.map((entry, order) => ({ ...entry, order, updatedAt: archivedAt })));
  });
  return { ...item, archivedAt, updatedAt: archivedAt };
}

export async function unarchiveItem(id: string) {
  const item = await db.items.get(id);
  if (!item || !item.archivedAt) return item;

  const restoredAt = now();
  await db.transaction('rw', db.items, async () => {
    const siblings = (await db.items.where('collectionId').equals(item.collectionId).sortBy('order'))
      .filter((entry) => !entry.archivedAt);
    await db.items.put({
      ...item,
      archivedAt: undefined,
      order: siblings.length,
      updatedAt: restoredAt,
    });
  });
  return db.items.get(id);
}

export async function createReminder(input: ReminderInput) {
  const prepared = prepareReminderInput(input);
  const createdAt = now();
  const reminder: Reminder = {
    id: createId('reminder'),
    ...prepared,
    createdAt,
    updatedAt: createdAt,
  };
  await db.reminders.add(reminder);
  return reminder;
}

export async function updateReminder(id: string, input: ReminderInput) {
  const existing = await db.reminders.get(id);
  if (!existing) throw new Error('提醒不存在或已删除');
  const prepared = prepareReminderInput(input);
  const reminder: Reminder = {
    ...existing,
    ...prepared,
    updatedAt: now(),
  };
  await db.reminders.put(reminder);
  return reminder;
}

export async function completeReminder(id: string, today = dateKey()) {
  const reminder = await db.reminders.get(id);
  if (!reminder) throw new Error('提醒不存在或已删除');
  const schedule = resolveReminder(reminder, today);
  if (!schedule?.isAlerting) throw new Error('还没到这个提醒的提示时间');
  const completedAt = now();
  await db.reminders.update(id, reminder.repeat === 'once'
    ? { completedAt, updatedAt: completedAt }
    : { completedOccurrence: schedule.dueDate, updatedAt: completedAt });
}

export async function deleteReminder(id: string) {
  await db.transaction('rw', db.reminders, db.deletedEntities, async () => {
    const reminder = await db.reminders.get(id);
    if (!reminder) return;
    const deletedAt = now();
    await db.reminders.delete(id);
    await db.deletedEntities.put(deletedEntity('reminder', id, deletedAt));
  });
}

export async function clearAllData() {
  await db.transaction('rw', [db.workspaces, db.collections, db.items, db.settings, db.appMeta, db.deletedEntities, db.reminders], async () => {
    const timestamp = now();
    const [workspaces, collections, items, reminders] = await Promise.all([
      db.workspaces.toArray(),
      db.collections.toArray(),
      db.items.toArray(),
      db.reminders.toArray(),
    ]);
    await db.deletedEntities.bulkPut([
      ...workspaces.map((entry) => deletedEntity('workspace', entry.id, timestamp)),
      ...collections.map((entry) => deletedEntity('collection', entry.id, timestamp)),
      ...items.map((entry) => deletedEntity('item', entry.id, timestamp)),
      ...reminders.map((entry) => deletedEntity('reminder', entry.id, timestamp)),
    ]);
    await Promise.all([
      db.workspaces.clear(),
      db.collections.clear(),
      db.items.clear(),
      db.reminders.clear(),
      db.settings.clear(),
      db.appMeta.clear(),
    ]);
  });
  await ensureSeedData();
}
