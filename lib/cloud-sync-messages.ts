export const CLOUD_SYNC_MESSAGE = {
  getStatus: 'chihiro:cloud-sync:get-status',
  configure: 'chihiro:cloud-sync:configure',
  disable: 'chihiro:cloud-sync:disable',
  syncNow: 'chihiro:cloud-sync:sync-now',
  schedule: 'chihiro:cloud-sync:schedule',
} as const;

export interface CloudSyncStatus {
  enabled: boolean;
  configured: boolean;
  endpoint: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export type CloudSyncRequest =
  | { type: typeof CLOUD_SYNC_MESSAGE.getStatus }
  | {
      type: typeof CLOUD_SYNC_MESSAGE.configure;
      endpoint: string;
      accessToken?: string;
      encryptionPassphrase?: string;
    }
  | { type: typeof CLOUD_SYNC_MESSAGE.disable }
  | { type: typeof CLOUD_SYNC_MESSAGE.syncNow }
  | { type: typeof CLOUD_SYNC_MESSAGE.schedule };

export type CloudSyncResponse =
  | { ok: true; status: CloudSyncStatus }
  | { ok: false; error: string; status?: CloudSyncStatus };
