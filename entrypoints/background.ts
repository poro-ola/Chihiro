import {
  CONTENT_NOTES_MESSAGE,
  type ContentNotesRequest,
  type ContentNotesResponse,
  type ContentNotesSnapshot,
} from '../lib/content-notes';
import { db, ensureSeedData, normalizeUrl, updateBookmarkNote } from '../lib/db';
import type { BookmarkItem } from '../lib/types';

const APP_ROW_ID = 'app' as const;
const CONTENT_NOTE_REQUEST_TYPES = [
  CONTENT_NOTES_MESSAGE.get,
  CONTENT_NOTES_MESSAGE.save,
  CONTENT_NOTES_MESSAGE.savePosition,
  CONTENT_NOTES_MESSAGE.openWorkspace,
] as string[];

async function getPageNotes(url: string): Promise<ContentNotesSnapshot> {
  await ensureSeedData();
  const normalizedUrl = normalizeUrl(url);
  const [items, settings] = await Promise.all([
    db.items.where('normalizedUrl').equals(normalizedUrl).toArray(),
    db.settings.get(APP_ROW_ID),
  ]);

  return {
    buttonRatio: settings?.contentNoteButtonRatio ?? 0.5,
    records: items
      .filter((item): item is BookmarkItem => item.type === 'bookmark')
      .sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) || b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => ({
        id: item.id,
        note: item.note || '',
      })),
  };
}

async function handleContentNotesMessage(message: ContentNotesRequest): Promise<ContentNotesResponse<unknown>> {
  try {
    switch (message.type) {
      case CONTENT_NOTES_MESSAGE.get:
        return { ok: true, data: await getPageNotes(message.url) };
      case CONTENT_NOTES_MESSAGE.save:
        await updateBookmarkNote(message.itemId, message.note);
        return { ok: true, data: undefined };
      case CONTENT_NOTES_MESSAGE.savePosition:
        await ensureSeedData();
        await db.settings.update(APP_ROW_ID, {
          contentNoteButtonRatio: Math.min(Math.max(message.ratio, 0), 1),
        });
        return { ok: true, data: undefined };
      case CONTENT_NOTES_MESSAGE.openWorkspace:
        await browser.tabs.create({});
        return { ok: true, data: undefined };
    }
  } catch (reason) {
    return {
      ok: false,
      error: reason instanceof Error ? reason.message : '网页备注操作失败',
    };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !CONTENT_NOTE_REQUEST_TYPES.includes(message.type)) {
      return undefined;
    }
    void handleContentNotesMessage(message as ContentNotesRequest).then(sendResponse);
    return true;
  });

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({});
  });
});
