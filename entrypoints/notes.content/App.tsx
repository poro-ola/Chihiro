import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  GripVertical,
  MessageSquareText,
  RefreshCw,
  StickyNote,
  X,
} from 'lucide-react';
import {
  CONTENT_NOTES_MESSAGE,
  type ContentNoteRecord,
  type ContentNotesRequest,
  type ContentNotesResponse,
  type ContentNotesSnapshot,
} from '../../lib/content-notes';
import { BOOKMARK_NOTE_MAX_LENGTH } from '../../lib/types';

const BUTTON_SIZE = 48;
const EDGE_GAP = 14;

function clampButtonTop(value: number) {
  return Math.min(Math.max(value, EDGE_GAP), Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP));
}

function topFromRatio(ratio: number) {
  const travel = Math.max(1, window.innerHeight - BUTTON_SIZE - EDGE_GAP * 2);
  return clampButtonTop(EDGE_GAP + travel * Math.min(Math.max(ratio, 0), 1));
}

function ratioFromTop(top: number) {
  const travel = Math.max(1, window.innerHeight - BUTTON_SIZE - EDGE_GAP * 2);
  return Math.min(Math.max((top - EDGE_GAP) / travel, 0), 1);
}

async function sendContentNotesMessage<T>(message: ContentNotesRequest): Promise<T> {
  const response = await browser.runtime.sendMessage(message) as ContentNotesResponse<T> | undefined;
  if (!response?.ok) throw new Error(response?.error || '网页备注服务暂不可用');
  return response.data;
}

function NoteEditor({
  record,
  index,
  onSaved,
}: {
  record: ContentNoteRecord;
  index: number;
  onSaved: (note: string) => void;
}) {
  const [draft, setDraft] = useState(record.note);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<number | undefined>(undefined);
  const draftRef = useRef(record.note);
  const lastSavedRef = useRef(record.note);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);

  onSavedRef.current = onSaved;

  useEffect(() => {
    setDraft(record.note);
    draftRef.current = record.note;
    lastSavedRef.current = record.note;
    setStatus('idle');
  }, [record.id]);

  const persist = useCallback(async (value: string) => {
    setStatus('saving');
    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(() => sendContentNotesMessage<void>({
        type: CONTENT_NOTES_MESSAGE.save,
        itemId: record.id,
        note: value,
      }));
    saveQueueRef.current = task;

    try {
      await task;
      lastSavedRef.current = value;
      onSavedRef.current(value.trim());
      if (draftRef.current === value) setStatus('saved');
    } catch {
      if (draftRef.current === value) setStatus('error');
    }
  }, [record.id]);

  useEffect(() => () => {
    window.clearTimeout(saveTimerRef.current);
    const latest = draftRef.current;
    if (latest === lastSavedRef.current) return;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => sendContentNotesMessage<void>({
        type: CONTENT_NOTES_MESSAGE.save,
        itemId: record.id,
        note: latest,
      }));
  }, [record.id]);

  return (
    <article className="note-card">
      <textarea
        value={draft}
        maxLength={BOOKMARK_NOTE_MAX_LENGTH}
        placeholder="写下一条想法、结论或待办…"
        aria-label={`第 ${index + 1} 条网页备注`}
        autoFocus={index === 0}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          draftRef.current = nextValue;
          setStatus('idle');
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => void persist(nextValue), 400);
        }}
      />
      <footer className="note-card__status" aria-live="polite">
        <span className={status === 'error' ? 'is-error' : undefined}>
          {status === 'saving' && '保存中…'}
          {status === 'saved' && '已保存'}
          {status === 'error' && '保存失败，将在关闭时重试'}
          {status === 'idle' && '自动保存'}
        </span>
        <em>{draft.length.toLocaleString()} / {BOOKMARK_NOTE_MAX_LENGTH.toLocaleString()}</em>
      </footer>
    </article>
  );
}

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<ContentNoteRecord[]>([]);
  const [pageUrl, setPageUrl] = useState(window.location.href);
  const [buttonTop, setButtonTop] = useState(() => topFromRatio(0.5));
  const positionLoaded = useRef(false);
  const suppressClick = useRef(false);
  const dragState = useRef<{
    pointerId: number;
    startY: number;
    startTop: number;
    moved: boolean;
  } | undefined>(undefined);

  const loadNotes = useCallback(async (url = window.location.href, showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const snapshot = await sendContentNotesMessage<ContentNotesSnapshot>({
        type: CONTENT_NOTES_MESSAGE.get,
        url,
      });
      setRecords(snapshot.records);
      if (!positionLoaded.current) {
        positionLoaded.current = true;
        setButtonTop(topFromRatio(snapshot.buttonRatio));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取网页备注');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes(pageUrl);
  }, [loadNotes, pageUrl]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.location.href !== pageUrl) setPageUrl(window.location.href);
    }, 800);
    return () => window.clearInterval(timer);
  }, [pageUrl]);

  useEffect(() => {
    const handleResize = () => setButtonTop((current) => clampButtonTop(current));
    const handleFocus = () => {
      if (isOpen) void loadNotes(window.location.href, false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loadNotes]);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message && message.type === CONTENT_NOTES_MESSAGE.toggle) {
        setIsOpen((current) => !current);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadNotes(window.location.href, false);
    }
  }, [isOpen, loadNotes]);

  const saveButtonPosition = (top: number) => {
    void sendContentNotesMessage({
      type: CONTENT_NOTES_MESSAGE.savePosition,
      ratio: ratioFromTop(top),
    }).catch(() => undefined);
  };

  return (
    <div className="content-notes-shell" data-open={isOpen || undefined}>
      {isOpen && (
        <aside className="content-notes-panel" role="dialog" aria-modal="false" aria-label="千寻网页备注">
          <header className="content-notes-header">
            <h2><StickyNote size={18} aria-hidden="true" /> 网页备注</h2>
            <button className="icon-button" type="button" onClick={() => setIsOpen(false)} aria-label="关闭网页备注">
              <X size={18} />
            </button>
          </header>

          <div className="content-notes-body">
            {isLoading && (
              <div className="content-state"><RefreshCw className="is-spinning" size={18} /><p>读取中…</p></div>
            )}

            {!isLoading && error && (
              <div className="content-state content-state--error">
                <p>{error}</p>
                <button type="button" onClick={() => void loadNotes()}>重新读取</button>
              </div>
            )}

            {!isLoading && !error && records.length === 0 && (
              <div className="content-state">
                <p>暂无备注。先在千寻中保存这个网页。</p>
                <button type="button" onClick={() => void sendContentNotesMessage({ type: CONTENT_NOTES_MESSAGE.openWorkspace })}>
                  打开千寻 <ArrowUpRight size={14} />
                </button>
              </div>
            )}

            {!isLoading && !error && records.length > 0 && (
              <section className="content-notes-list" aria-label="当前网页关联备注">
                {records.map((record, index) => (
                  <NoteEditor
                    key={record.id}
                    record={record}
                    index={index}
                    onSaved={(note) => setRecords((current) => current.map((item) => item.id === record.id ? { ...item, note } : item))}
                  />
                ))}
              </section>
            )}
          </div>
        </aside>
      )}

      <button
        className="content-notes-trigger"
        type="button"
        style={{ top: buttonTop }}
        aria-label={isOpen ? '关闭千寻网页备注' : '打开千寻网页备注'}
        aria-expanded={isOpen}
        title="上下拖动调整位置，点击打开网页备注"
        onPointerDown={(event) => {
          dragState.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startTop: buttonTop,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragState.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const distance = event.clientY - drag.startY;
          if (Math.abs(distance) > 4) drag.moved = true;
          if (drag.moved) setButtonTop(clampButtonTop(drag.startTop + distance));
        }}
        onPointerUp={(event) => {
          const drag = dragState.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          dragState.current = undefined;
          if (drag.moved) {
            const finalTop = clampButtonTop(drag.startTop + event.clientY - drag.startY);
            setButtonTop(finalTop);
            suppressClick.current = true;
            saveButtonPosition(finalTop);
            window.setTimeout(() => { suppressClick.current = false; }, 0);
          }
        }}
        onPointerCancel={() => {
          dragState.current = undefined;
        }}
        onClick={() => {
          if (!suppressClick.current) setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const nextTop = clampButtonTop(buttonTop + (event.key === 'ArrowUp' ? -24 : 24));
          setButtonTop(nextTop);
          saveButtonPosition(nextTop);
        }}
      >
        <GripVertical className="content-notes-trigger__grip" size={12} aria-hidden="true" />
        <MessageSquareText size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
