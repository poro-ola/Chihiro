import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MarkdownEditor } from '../../../components/MarkdownEditor';
import { AutosaveStatus } from '../../../components/AutosaveStatus';
import { useAutosave } from '../../../components/useAutosave';
import { AlertTriangle, Check, Copy, Link2, Play, StickyNote, Terminal, X } from 'lucide-react';
import { CURL_MESSAGE, formatCurlOutput, parseCurl, type CurlExecutionResult } from '../../../lib/curl';
import { normalizeCurlCommand } from '../../../lib/curl-format';
import {
  REQUEST_COMMAND_MAX_LENGTH,
  type BookmarkItem,
  type NoteItem,
  type RequestItem,
} from '../../../lib/types';

interface BookmarkDialogProps {
  open: boolean;
  item?: BookmarkItem;
  focusField?: 'url' | 'note';
  collectionName: string;
  onClose: () => void;
  onSave: (input: { title: string; url: string; note?: string }) => Promise<void>;
}

export function BookmarkDialog({ open, item, focusField = 'url', collectionName, onClose, onSave }: BookmarkDialogProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title || '');
    setUrl(item?.url || '');
    setNote(item?.note || '');
    setError('');
  }, [item, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({ title, url, note });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog bookmark-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmark-dialog-title">
        <header className="dialog__header">
          <div className="dialog__icon"><Link2 size={19} /></div>
          <div>
            <span className="eyebrow">{collectionName}</span>
            <h2 id="bookmark-dialog-title">{focusField === 'note' ? '编辑备注' : item ? '编辑书签' : '添加链接'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="field">
            <span>网址</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              autoFocus={focusField === 'url'}
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="留空则使用域名" maxLength={200} />
          </label>
          <div className="field">
            <span>备注 <em>可选 · {note.length.toLocaleString()} 字符</em></span>
            <MarkdownEditor value={note} onChange={setNote}
              label="书签备注" autoFocus={focusField === 'note'} />
          </div>
          {error && <p className="dialog-error">{error}</p>}
          <footer className="dialog__footer">
            <span>点击书签卡片将在新标签页打开</span>
            <div>
              <button type="button" className="secondary-button" onClick={onClose}>取消</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

interface BookmarkNoteDialogProps {
  open: boolean;
  item?: BookmarkItem;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}

function bookmarkIconFallback(item?: BookmarkItem) {
  if (!item) return '•';
  try {
    return (new URL(item.url).hostname.replace(/^www\./, '')[0] || item.title[0] || '•').toUpperCase();
  } catch {
    return (item.title[0] || '•').toUpperCase();
  }
}

function AutosaveNoteDialog({ initialValue, onSave, onClose, maxLength, label, className, header }: {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
  maxLength?: number;
  label: string;
  className: string;
  header: ReactNode;
}) {
  const autosave = useAutosave(initialValue, onSave);
  const closeAfterSave = useCallback(async () => {
    if (await autosave.flush()) onClose();
  }, [autosave.flush, onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) void closeAfterSave();
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.stopPropagation();
        void closeAfterSave();
      }
    }}>
      <section className={`dialog markdown-note-dialog ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        <header className="dialog__header">
          {header}
          <button type="button" className="icon-button" onClick={() => void closeAfterSave()} aria-label="关闭备注"><X size={18} /></button>
        </header>
        <div className="markdown-note-dialog__body">
          <MarkdownEditor value={autosave.value} onChange={autosave.change} maxLength={maxLength} label={label} autoFocus />
          <AutosaveStatus {...autosave} maxLength={maxLength} onRetry={autosave.flush} />
        </div>
      </section>
    </div>
  );
}

export function BookmarkNoteDialog({ open, item, onClose, onSave }: BookmarkNoteDialogProps) {
  if (!open || !item) return null;
  return <AutosaveNoteDialog key={item.id} initialValue={item.note || ''} onSave={onSave} onClose={onClose}
    label="书签备注" className="bookmark-note-dialog"
    header={<>
      <div className="dialog__icon bookmark-note-dialog__favicon" aria-hidden="true">
        <span>{bookmarkIconFallback(item)}</span>
        {item.faviconUrl && <img src={item.faviconUrl} alt="" draggable={false} onError={(event) => { event.currentTarget.hidden = true; }} />}
      </div>
      <div className="bookmark-note-dialog__heading"><span className="eyebrow">书签备注</span><h2 title={item.title}>{item.title || '未命名书签'}</h2></div>
    </>} />;
}

interface NoteDialogProps {
  open: boolean;
  item?: NoteItem;
  collectionName: string;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}

export function NoteDialog({ open, item, collectionName, onClose, onSave }: NoteDialogProps) {
  if (!open || !item) return null;
  return <AutosaveNoteDialog key={item.id} initialValue={item.content} onSave={onSave} onClose={onClose}
    label="记事内容" className="note-dialog"
    header={<>
      <div className="dialog__icon note-dialog__icon"><StickyNote size={19} /></div>
      <div><span className="eyebrow">{collectionName}</span><h2>编辑记事</h2></div>
    </>} />;
}

interface RequestDialogProps {
  open: boolean;
  item?: RequestItem;
  collectionName: string;
  onClose: () => void;
  onSave: (input: { title: string; command: string }) => Promise<void>;
}

export function RequestDialog({ open, item, collectionName, onClose, onSave }: RequestDialogProps) {
  if (!open || !item) return null;
  return <AutosaveRequestDialog key={item.id} item={item} collectionName={collectionName} onClose={onClose} onSave={onSave} />;
}

function AutosaveRequestDialog({ item, collectionName, onClose, onSave }: Omit<RequestDialogProps, 'open' | 'item'> & { item: RequestItem }) {
  const autosave = useAutosave(JSON.stringify({ title: item.title, command: item.command }), async (value) => {
    await onSave(JSON.parse(value) as { title: string; command: string });
  });
  const draft = useMemo(() => JSON.parse(autosave.value) as { title: string; command: string }, [autosave.value]);
  const { title, command } = draft;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [error, setError] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<CurlExecutionResult>();
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const runVersion = useRef(0);
  const parsed = useMemo(() => {
    if (!command.trim()) return { request: undefined, error: '' };
    try { return { request: parseCurl(command), error: '' }; }
    catch (reason) { return { request: undefined, error: reason instanceof Error ? reason.message : '请求格式无效' }; }
  }, [command]);

  useEffect(() => () => { runVersion.current++; }, []);

  const changeDraft = (patch: Partial<typeof draft>) => {
    draftRef.current = { ...draftRef.current, ...patch };
    autosave.change(JSON.stringify(draftRef.current));
  };

  const closeAfterSave = async () => {
    changeDraft({ command: normalizeCurlCommand(draftRef.current.command) });
    if (await autosave.flush()) onClose();
  };

  const execute = async () => {
    if (busy.current || !parsed.request) return;
    busy.current = true;
    const current = ++runVersion.current;
    const nextCommand = normalizeCurlCommand(command);
    setExecuting(true);
    setError('');
    setResult(undefined);
    setCopied(false);
    try {
      changeDraft({ command: nextCommand });
      if (!await autosave.flush()) return;
      if (current !== runVersion.current) return;
      const response = await browser.runtime.sendMessage({ type: CURL_MESSAGE.execute, command: nextCommand }) as CurlExecutionResult;
      if (current === runVersion.current) setResult(response);
    } catch (reason) {
      if (current === runVersion.current) setError(reason instanceof Error ? reason.message : '请求执行失败');
    } finally {
      if (current === runVersion.current) { busy.current = false; setExecuting(false); }
    }
  };

  const copyResult = async () => {
    if (!result) return;
    const output = formatCurlOutput(result);
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError('无法复制结果，请检查浏览器剪贴板权限');
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) void closeAfterSave();
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); void closeAfterSave(); }
    }}>
      <section className="dialog request-dialog" role="dialog" aria-modal="true" aria-labelledby="request-dialog-title">
        <header className="dialog__header">
          <div className="dialog__icon request-dialog__icon"><Terminal size={19} /></div>
          <div>
            <span className="eyebrow">{collectionName}</span>
            <h2 id="request-dialog-title">工作流请求</h2>
          </div>
          <button type="button" className="icon-button" onClick={() => void closeAfterSave()} aria-label="关闭请求卡片"><X size={18} /></button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label className="field">
            <span>名称</span>
            <input value={title} onChange={(event) => changeDraft({ title: event.target.value })} maxLength={200} autoFocus disabled={executing} />
          </label>
          <label className="field request-dialog__command-field">
            <span>
              cURL 请求
            </span>
            <textarea
              value={command}
              disabled={executing}
              onChange={(event) => {
                changeDraft({ command: event.target.value.slice(0, REQUEST_COMMAND_MAX_LENGTH) });
                setResult(undefined); setCopied(false); setError('');
              }}
              onBlur={() => changeDraft({ command: normalizeCurlCommand(draftRef.current.command) })}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void execute();
                }
              }}
              placeholder={"curl --request POST \\\n  'https://api.example.com/webhook' \\\n  --header 'Content-Type: application/json' \\\n  --data-raw '{\"name\":\"示例\"}'"}
              spellCheck={false}
              aria-label="cURL 请求"
              maxLength={REQUEST_COMMAND_MAX_LENGTH}
            />
          </label>
          <p className="request-dialog__hint">每张卡片保存一条 curl；兼容 Markdown 转义、多行 JSON 和 jq 字段提取。不会自动携带浏览器 Cookie。</p>
          {parsed.request && <p className="request-dialog__hint">{parsed.request.method} · {parsed.request.url}</p>}
          {parsed.request?.warnings.map((warning) => <p className="request-dialog__hint" key={warning}>{warning}</p>)}
          {parsed.error && <p className="dialog-error" role="alert">{parsed.error}</p>}
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog__footer request-dialog__footer">
            <AutosaveStatus {...autosave} value={command} maxLength={REQUEST_COMMAND_MAX_LENGTH} onRetry={autosave.flush} />
            <button type="button" className="primary-button" onClick={() => void execute()} disabled={executing || !parsed.request}>
              <Play size={14} /> {executing ? '执行中…' : '执行'}
            </button>
          </div>
        </form>
        {result && (
          <section className={`request-result ${result.ok && !result.error ? 'is-success' : 'is-error'}`} aria-live="polite">
            <header>
              <div>
                <strong>{result.status ? `${result.status} ${result.statusText || ''}` : result.error || '响应结果'}</strong>
                {result.durationMs !== undefined && <span>{result.durationMs} ms{result.finalUrl ? ` · ${result.finalUrl}` : ''}</span>}
              </div>
              <button type="button" className="icon-button" onClick={() => void copyResult()} aria-label="复制执行结果" title={copied ? '已复制' : '复制执行结果'}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </header>
            {result.error && <p role="alert">{result.error}</p>}
            {result.hint && <p>{result.hint}</p>}
            {result.headers && result.headers.length > 0 && (
              <details className="request-result__headers">
                <summary>响应头 · {result.headers.length}</summary>
                <pre>{result.headers.map(([name, value]) => `${name}: ${value}`).join('\n')}</pre>
              </details>
            )}
            <pre className="request-result__body" aria-label="工作流执行结果">{formatCurlOutput(result) || '(无响应内容)'}</pre>
            {result.bodyTruncated && <p>响应内容超过 100 KB，已截断显示。</p>}
          </section>
        )}
      </section>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  danger = true,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [working, setWorking] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  useEffect(() => {
    if (open) setConfirmError('');
  }, [open, title]);
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-dialog__icon"><AlertTriangle size={21} /></div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        {confirmError && <p className="dialog-error">{confirmError}</p>}
        <footer>
          <button className="secondary-button" onClick={onCancel}>取消</button>
          <button
            className={danger ? 'danger-button' : 'primary-button'}
            disabled={working}
            onClick={() => {
              setWorking(true);
              setConfirmError('');
              void Promise.resolve(onConfirm())
                .catch((reason) => setConfirmError(reason instanceof Error ? reason.message : '操作失败'))
                .finally(() => setWorking(false));
            }}
          >
            {working ? '处理中…' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
