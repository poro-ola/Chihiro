import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getMarkRange, type Editor, type Range } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { ArrowUpRight, Pencil } from 'lucide-react';

interface LinkPreview {
  anchor: HTMLAnchorElement;
  href: string;
  text: string;
}

export function EditorLinkPreview({ editor, sourceMode, maxLength, onMarkdownChange, children }: {
  editor: Editor | null;
  sourceMode: boolean;
  maxLength?: number;
  onMarkdownChange: (value: string) => void;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<LinkPreview>();
  const [editing, setEditing] = useState<Range>();
  const [draftHref, setDraftHref] = useState('');
  const [error, setError] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverAnchor = useRef<HTMLAnchorElement | undefined>(undefined);

  const keepOpen = useCallback(() => window.clearTimeout(closeTimer.current), []);
  const dismiss = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(hoverTimer.current);
    hoverAnchor.current = undefined;
    setPreview(undefined);
    setEditing(undefined);
    setError('');
  }, []);
  const dismissSoon = () => {
    if (editing) return;
    keepOpen();
    closeTimer.current = window.setTimeout(dismiss, 180);
  };

  const showLink = (target: EventTarget | null) => {
    if (editing) return;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('.markdown-document a[href]');
    if (!anchor || !anchor.getAttribute('href')) return;
    let href: URL;
    try {
      href = new URL(anchor.href, anchor.baseURI);
    } catch {
      return;
    }
    if (!['http:', 'https:', 'mailto:'].includes(href.protocol)) return;
    keepOpen();
    const nextPreview = {
      anchor, href: href.href, text: anchor.textContent?.trim() || href.hostname || '链接',
    };
    if (!preview || preview.anchor === anchor) {
      setPreview((current) => current?.anchor === anchor && current.href === href.href ? current : nextPreview);
      return;
    }
    // A popover above a link can overlap the preceding line. Don't switch
    // previews while the pointer is merely passing over that neighboring link.
    if (hoverAnchor.current === anchor) return;
    window.clearTimeout(hoverTimer.current);
    hoverAnchor.current = anchor;
    hoverTimer.current = window.setTimeout(() => {
      hoverAnchor.current = undefined;
      hoverTimer.current = undefined;
      keepOpen();
      setPreview(nextPreview);
    }, 140);
  };

  const beginEdit = () => {
    if (!editor || !preview) return;
    const linkType = editor.schema.marks.link;
    if (!linkType) return;
    // Resolve from inside the anchor. At a boundary between adjacent links,
    // posAtDOM(anchor, 0) can resolve to the preceding link's mark.
    const position = editor.view.posAtDOM(preview.anchor, 0) + 1;
    const href = preview.anchor.getAttribute('href') || preview.href;
    const range = getMarkRange(editor.state.doc.resolve(position), linkType, { href });
    if (!range) return;
    keepOpen();
    setDraftHref(href);
    setError('');
    setEditing(range);
  };

  const applyEdit = () => {
    if (!editor || !editing) return;
    const href = draftHref.trim();
    if (href) {
      try {
        if (!['http:', 'https:', 'mailto:'].includes(new URL(href).protocol)) throw new Error();
      } catch {
        setError('请输入有效的 http、https 或 mailto 链接');
        return;
      }
    }
    const { from, to } = editing;
    const linkType = editor.schema.marks.link;
    if (!linkType) return;
    if (maxLength !== undefined) {
      const attributes = editor.state.doc.nodeAt(from)?.marks.find((mark) => mark.type === linkType)?.attrs;
      const transaction = editor.state.tr;
      if (href) transaction.addMark(from, to, linkType.create({ ...attributes, href }));
      else transaction.removeMark(from, to, linkType);
      const nextMarkdown = editor.markdown?.serialize(transaction.doc.toJSON()) || '';
      if (nextMarkdown.length > maxLength) {
        setError(`修改后超过 ${maxLength.toLocaleString()} 字，请缩短链接或正文`);
        return;
      }
    }
    const command = editor.chain().setTextSelection({ from, to });
    if (href) command.setLink({ href }).run();
    else command.unsetLink().run();
    // Readonly source previews still allow explicit edits through this control.
    if (sourceMode) onMarkdownChange(editor.isEmpty ? '' : editor.getMarkdown());
    dismiss();
  };

  useEffect(() => {
    dismiss();
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged) dismiss();
    };
    editor?.on('transaction', onTransaction);
    return () => {
      editor?.off('transaction', onTransaction);
      window.clearTimeout(closeTimer.current);
    };
  }, [editor, sourceMode, dismiss]);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!preview || !popover) return;
    // The native top layer escapes the scrolling dialog and the content script's Shadow DOM panel.
    popover.showPopover();
    const anchor = preview.anchor.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(gap, Math.min(anchor.left, window.innerWidth - box.width - gap));
    const above = anchor.top - box.height - gap;
    const below = anchor.bottom + gap;
    const top = above >= gap ? above : Math.max(gap, Math.min(below, window.innerHeight - box.height - gap));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    if (editing) editInputRef.current?.focus();

    const root = preview.anchor.getRootNode();
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popover.contains(event.target)) return;
      dismiss();
    };
    const onPointerDown = (event: Event) => {
      const path = event.composedPath();
      if (!path.includes(popover) && !path.includes(preview.anchor)) dismiss();
    };
    root.addEventListener('scroll', onScroll, true);
    root.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', dismiss);
    return () => {
      root.removeEventListener('scroll', onScroll, true);
      root.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', dismiss);
      window.clearTimeout(hoverTimer.current);
      if (popover.matches(':popover-open')) popover.hidePopover();
    };
  }, [preview, editing, error, dismiss]);

  return (
    <div className="markdown-editor__link-surface"
      onPointerOver={(event) => showLink(event.target)}
      onPointerOut={(event) => {
        const anchor = event.target instanceof Element ? event.target.closest('.markdown-document a[href]') : null;
        if (anchor && !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) {
          if (hoverAnchor.current === anchor) {
            window.clearTimeout(hoverTimer.current);
            hoverTimer.current = undefined;
            hoverAnchor.current = undefined;
          }
          dismissSoon();
        }
      }}
      onFocus={(event) => showLink(event.target)}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) dismissSoon();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && preview && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          if (popoverRef.current?.contains(event.target as Node)) editor?.commands.focus();
          dismiss();
        }
      }}>
      {children}
      {preview && (
        <div ref={popoverRef} popover="manual" className="markdown-link-preview" role="dialog" aria-label="链接预览"
          onPointerEnter={keepOpen} onPointerLeave={dismissSoon} onFocus={keepOpen}>
          {editing ? (
            <div className="markdown-link-preview__edit">
              <label>
                <span>链接地址</span>
                <input ref={editInputRef} aria-label="编辑链接地址" value={draftHref} placeholder="https://…"
                  onChange={(event) => { setDraftHref(event.target.value); setError(''); }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); applyEdit(); }
                  }} />
              </label>
              {error && <span className="markdown-link-preview__error" role="alert">{error}</span>}
              <footer>
                <span>留空可移除链接</span>
                <button type="button" onClick={dismiss}>取消</button>
                <button type="button" onClick={applyEdit}>应用</button>
              </footer>
            </div>
          ) : <>
            <div className="markdown-link-preview__copy">
              <strong>{preview.text}</strong>
              <span>{preview.href}</span>
            </div>
            <button className="markdown-link-preview__action" type="button" aria-label="编辑链接" title="编辑链接"
              onMouseDown={(event) => event.preventDefault()} onClick={beginEdit}>
              <Pencil size={15} aria-hidden="true" />
            </button>
            <a className="markdown-link-preview__open" href={preview.href} target="_blank" rel="noopener noreferrer"
              aria-label="在新标签页打开链接" title="在新标签页打开链接"
              onMouseDown={(event) => event.preventDefault()}>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </>}
        </div>
      )}
    </div>
  );
}
