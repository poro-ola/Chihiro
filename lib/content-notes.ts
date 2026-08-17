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
