import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
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
import { MarkdownEditor } from '../../components/MarkdownEditor';
import { AutosaveStatus } from '../../components/AutosaveStatus';
import { useAutosave } from '../../components/useAutosave';

const BUTTON_SIZE = window.matchMedia('(pointer: coarse)').matches ? 44 : 28;
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

type FlushNote = () => Promise<boolean>;

function NoteEditor({ record, index, onSaved, registerFlush }: {
  record: ContentNoteRecord;
  index: number;
  onSaved: (note: string) => void;
  registerFlush: (id: string, flush: FlushNote) => () => void;
}) {
  const autosave = useAutosave(record.note, async (value) => {
    await sendContentNotesMessage<void>({ type: CONTENT_NOTES_MESSAGE.save, itemId: record.id, note: value });
    onSaved(value);
  });
  useEffect(() => registerFlush(record.id, autosave.flush), [record.id, registerFlush, autosave.flush]);

  return (
    <article className="note-card">
      <a className="note-card__source" href={record.url} target="_blank" rel="noopener noreferrer" title={record.url}>
        {record.title || record.url}<ArrowUpRight size={12} aria-hidden="true" />
      </a>
      <MarkdownEditor value={autosave.value} onChange={autosave.change}
        label={`第 ${index + 1} 条网页备注`} autoFocus={index === 0} />
      <AutosaveStatus {...autosave} onRetry={autosave.flush} />
    </article>
  );
}

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<ContentNoteRecord[]>([]);
  const [host, setHost] = useState(window.location.host);
  const flushers = useRef(new Map<string, FlushNote>());
  const requestId = useRef(0);
  const openRef = useRef(false);

  const registerFlush = useCallback((id: string, flush: FlushNote) => {
    flushers.current.set(id, flush);
    return () => { flushers.current.delete(id); };
  }, []);

  const closePanel = useCallback(async () => {
    const saved = await Promise.all([...flushers.current.values()].map((flush) => flush()));
    if (saved.every(Boolean)) {
      openRef.current = false;
      setIsOpen(false);
      setRecords((current) => current.filter((record) => record.note.trim()));
    }
  }, []);
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
    const currentRequest = ++requestId.current;
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const snapshot = await sendContentNotesMessage<ContentNotesSnapshot>({
        type: CONTENT_NOTES_MESSAGE.get,
        url,
      });
      if (currentRequest !== requestId.current || openRef.current) return;
      setRecords(snapshot.records);
      if (!positionLoaded.current) {
        positionLoaded.current = true;
        setButtonTop(topFromRatio(snapshot.buttonRatio));
      }
    } catch (reason) {
      if (currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : '无法读取网页备注');
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  const openPanel = useCallback(async () => {
    await loadNotes(window.location.href, false);
    openRef.current = true;
    setIsOpen(true);
  }, [loadNotes]);

  useEffect(() => {
    if (!isOpen) void loadNotes(window.location.href);
  }, [loadNotes, host, isOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.location.host !== host) setHost(window.location.host);
      if (!openRef.current && document.visibilityState === 'visible') void loadNotes(window.location.href, false);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [host, loadNotes]);

  useEffect(() => {
    const handleResize = () => setButtonTop((current) => clampButtonTop(current));
    const handleFocus = () => {
      if (!openRef.current) void loadNotes(window.location.href, false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) void closePanel();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePanel, loadNotes]);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message && message.type === CONTENT_NOTES_MESSAGE.toggle) {
        if (openRef.current) void closePanel();
        else void openPanel();
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [closePanel, openPanel]);

  const saveButtonPosition = (top: number) => {
    void sendContentNotesMessage({
      type: CONTENT_NOTES_MESSAGE.savePosition,
      ratio: ratioFromTop(top),
    }).catch(() => undefined);
  };

  return (
    <div className="content-notes-shell" data-open={isOpen || undefined}>
      {isOpen && (
        <aside className="content-notes-panel" role="dialog" aria-modal="false" aria-label="千寻网页备注"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.stopPropagation();
              void closePanel();
            }
          }}>
          <header className="content-notes-header">
            <h2><StickyNote size={18} aria-hidden="true" /> 网页备注</h2>
            <button className="icon-button" type="button" onClick={() => void closePanel()} aria-label="关闭网页备注">
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
                <p>这个站点暂无备注。可在千寻中为书签添加备注。</p>
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
                    registerFlush={registerFlush}
                    onSaved={(note) => setRecords((current) => current.map((item) => item.id === record.id ? { ...item, note } : item))}
                  />
                ))}
              </section>
            )}
          </div>
        </aside>
      )}

      {(isOpen || records.some((record) => record.note.trim())) && <button
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
          if (suppressClick.current) return;
          if (isOpen) void closePanel();
          else void openPanel();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const nextTop = clampButtonTop(buttonTop + (event.key === 'ArrowUp' ? -24 : 24));
          setButtonTop(nextTop);
          saveButtonPosition(nextTop);
        }}
      >
        <MessageSquareText size={15} aria-hidden="true" />
      </button>}
    </div>
  );
}
