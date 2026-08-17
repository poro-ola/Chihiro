import { useEffect, useState } from 'react';
import { AlertTriangle, Link2, StickyNote, X } from 'lucide-react';
import type { BookmarkItem, NoteItem } from '../../../lib/types';

interface BookmarkDialogProps {
  open: boolean;
  item?: BookmarkItem;
  collectionName: string;
  onClose: () => void;
  onSave: (input: { title: string; url: string; note?: string }) => Promise<void>;
}

export function BookmarkDialog({ open, item, collectionName, onClose, onSave }: BookmarkDialogProps) {
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
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="bookmark-dialog-title">
        <header className="dialog__header">
          <div className="dialog__icon"><Link2 size={19} /></div>
          <div>
            <span className="eyebrow">{collectionName}</span>
            <h2 id="bookmark-dialog-title">{item ? '编辑书签' : '添加链接'}</h2>
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
              autoFocus
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="留空则使用域名" maxLength={200} />
          </label>
          <label className="field">
            <span>备注 <em>可选</em></span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="为什么保存这个链接？" maxLength={500} />
          </label>
          {error && <p className="dialog-error">{error}</p>}
          <footer className="dialog__footer">
            <span>⌘/Ctrl + 点击可在后台打开书签</span>
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

interface NoteDialogProps {
  open: boolean;
  item?: NoteItem;
  collectionName: string;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}

export function NoteDialog({ open, item, collectionName, onClose, onSave }: NoteDialogProps) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContent(item?.content || '');
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
      await onSave(content);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog note-dialog" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title">
        <header className="dialog__header">
          <div className="dialog__icon note-dialog__icon"><StickyNote size={19} /></div>
          <div>
            <span className="eyebrow">{collectionName}</span>
            <h2 id="note-dialog-title">编辑记事</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="field note-dialog__field">
            <span>
              正文
              <em>{content.length.toLocaleString()} / 20,000</em>
            </span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 20_000))}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="写下一条想法、结论或待办…"
              aria-label="记事内容"
              autoFocus
              maxLength={20_000}
            />
          </label>
          {error && <p className="dialog-error">{error}</p>}
          <footer className="dialog__footer">
            <span>⌘/Ctrl + Enter 保存</span>
            <div>
              <button type="button" className="secondary-button" onClick={onClose}>取消</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存记事'}</button>
            </div>
          </footer>
        </form>
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
