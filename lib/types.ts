export type ItemType = 'bookmark' | 'note' | 'request';

export const REQUEST_COMMAND_MAX_LENGTH = 20_000;

export interface Workspace {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  order: number;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BaseItem {
  id: string;
  collectionId: string;
  order: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkItem extends BaseItem {
  type: 'bookmark';
  title: string;
  url: string;
  normalizedUrl: string;
  note?: string;
  faviconUrl?: string;
}

export interface NoteItem extends BaseItem {
  type: 'note';
  content: string;
}

export interface RequestItem extends BaseItem {
  type: 'request';
  title: string;
  command: string;
}

export type BoardItem = BookmarkItem | NoteItem | RequestItem;

export interface AppSettings {
  id: 'app';
  activeWorkspaceId: string;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  compactMode: boolean;
  boardIntroDismissed: boolean;
  contentNoteButtonRatio: number;
}

export interface AppMeta {
  id: 'app';
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

export type ReminderKind = 'todo' | 'event' | 'anniversary';
export type ReminderCalendar = 'solar' | 'lunar';
export type ReminderRepeat = 'once' | 'yearly';

export interface Reminder {
  id: string;
  title: string;
  kind: ReminderKind;
  repeat: ReminderRepeat;
  calendar: ReminderCalendar;
  date?: string;
  lunarYear?: number;
  lunarMonth?: number;
  lunarDay?: number;
  lunarLeapMonth?: boolean;
  advanceDays: number;
  completedAt?: string;
  completedOccurrence?: string;
  createdAt: string;
  updatedAt: string;
}

export type DeletedEntityType = 'workspace' | 'collection' | 'item' | 'reminder';

export interface DeletedEntity {
  key: string;
  entityType: DeletedEntityType;
  entityId: string;
  deletedAt: string;
}

export interface OpenTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  faviconUrl?: string;
  active: boolean;
  pinned: boolean;
}

export type SearchCategory = 'all' | 'bookmark' | 'note' | 'request' | 'collection' | 'tab';

export type SearchResult =
  | {
      id: string;
      type: 'bookmark' | 'note' | 'request';
      title: string;
      subtitle: string;
      workspaceId: string;
      collectionId: string;
      itemId: string;
      archived?: boolean;
    }
  | {
      id: string;
      type: 'collection';
      title: string;
      subtitle: string;
      workspaceId: string;
      collectionId: string;
    }
  | {
      id: string;
      type: 'tab';
      title: string;
      subtitle: string;
      tabId: number;
    };

export interface ChihiroBackup {
  format: 'chihiro-backup' | 'qianxun-backup';
  formatVersion: 1;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  database: unknown;
}
