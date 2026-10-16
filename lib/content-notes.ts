import type { BoardItem, BookmarkItem } from './types';

export const CONTENT_NOTES_MESSAGE = {
  get: 'chihiro:content-notes:get',
  save: 'chihiro:content-notes:save',
  savePosition: 'chihiro:content-notes:save-position',
  openWorkspace: 'chihiro:content-notes:open-workspace',
  toggle: 'chihiro:content-notes:toggle',
} as const;

export interface ContentNoteRecord {
  id: string;
  note: string;
  title: string;
  url: string;
}

export interface ContentNotesSnapshot {
  buttonRatio: number;
  records: ContentNoteRecord[];
}

export type ContentNotesRequest =
  | { type: typeof CONTENT_NOTES_MESSAGE.get; url: string }
  | { type: typeof CONTENT_NOTES_MESSAGE.save; itemId: string; note: string }
  | { type: typeof CONTENT_NOTES_MESSAGE.savePosition; ratio: number }
  | { type: typeof CONTENT_NOTES_MESSAGE.openWorkspace };

export type ContentNotesResponse<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function pageHost(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.host : undefined;
  } catch {
    return undefined;
  }
}

export function selectPageNotes(items: BoardItem[], url: string): ContentNoteRecord[] {
  const host = pageHost(url);
  if (!host) return [];
  return items
    .filter((item): item is BookmarkItem => item.type === 'bookmark' && Boolean(item.note?.trim()) && pageHost(item.url) === host)
    .sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) || b.updatedAt.localeCompare(a.updatedAt))
    .map((item) => ({ id: item.id, note: item.note || '', title: item.title, url: item.url }));
}
