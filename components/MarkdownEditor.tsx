import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { Bold, CheckSquare, Code, Code2, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Strikethrough, Table2, Terminal } from 'lucide-react';
import { CODE_LANGUAGES, createMarkdownExtensions, hasMarkdownSyntax } from '../lib/markdown';
import { EditorLinkPreview } from './EditorLinkPreview';
import './markdown-editor.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  label: string;
  autoFocus?: boolean;
}

export function MarkdownEditor({ value, onChange, maxLength, label, autoFocus = false }: MarkdownEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageError, setImageError] = useState('');
  const sourceModeRef = useRef(false);
  const lastValue = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: createMarkdownExtensions(maxLength),
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    injectCSS: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'markdown-document', role: 'textbox', 'aria-label': label, 'aria-multiline': 'true' },
      handlePaste: (view, event): boolean => {
        const markdown = event.clipboardData?.getData('text/markdown') || event.clipboardData?.getData('text/x-markdown');
        const text = event.clipboardData?.getData('text/plain') || markdown;
        if (!text) return false;
        if (editor?.isActive('codeBlock') || editor?.isActive('code')) {
          view.dispatch(view.state.tr.insertText(text));
          return true;
        }
        if (!editor?.markdown) return false;
        if (!markdown && event.clipboardData?.getData('text/html') && !hasMarkdownSyntax(text, editor.markdown)) return false;
        return editor.commands.insertContent(markdown || text, { contentType: 'markdown' });
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      // Focus can append a trailing paragraph. Opening a note must not rewrite its source.
      if (sourceModeRef.current || !transaction.docChanged) return;
      const markdown = current.isEmpty ? '' : current.getMarkdown();
      lastValue.current = markdown;
      onChangeRef.current(markdown);
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive('bold'), italic: current.isActive('italic'), strike: current.isActive('strike'),
      headingLevel: Number(current.getAttributes('heading').level) || 0, bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'),
      task: current.isActive('taskList'), quote: current.isActive('blockquote'), code: current.isActive('codeBlock'),
      link: current.isActive('link'), table: current.isActive('table'),
      inlineCode: current.isActive('code'), codeLanguage: String(current.getAttributes('codeBlock').language || 'plaintext'),
    } : null,
  });

  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    editor.chain().setMeta('markdownSource', true).setContent(value, { contentType: 'markdown', emitUpdate: false }).run();
  }, [editor, value]);

  const toggleSource = () => {
    if (!editor) return;
    const next = !sourceMode;
    sourceModeRef.current = next;
    setSourceMode(next);
    setLinkOpen(false);
    setImageOpen(false);
    editor.setEditable(!next, false);
    editor.commands.setMeta('markdownSource', true);
    if (!next) editor.commands.focus();
  };

  return (
    <div className="markdown-editor" data-source={sourceMode || undefined}>
      <div className="markdown-editor__header">
        <div className="markdown-editor__toolbar" role="toolbar" aria-label={`${label}格式工具`}>
          {!sourceMode && editor && (
            <div className="markdown-editor__formats">
              <select className="markdown-editor__select" aria-label="段落与标题" value={active?.headingLevel || 0}
                onChange={(event) => {
                  const level = Number(event.target.value);
                  if (level) editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
                  else editor.chain().focus().setParagraph().run();
                }}>
                <option value={0}>正文</option>
                {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>标题 {level}</option>)}
              </select>
              {[
                { label: '粗体', icon: Bold, active: active?.bold, run: () => editor.chain().focus().toggleBold().run() },
                { label: '斜体', icon: Italic, active: active?.italic, run: () => editor.chain().focus().toggleItalic().run() },
                { label: '删除线', icon: Strikethrough, active: active?.strike, run: () => editor.chain().focus().toggleStrike().run() },
                { label: '无序列表', icon: List, active: active?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
                { label: '有序列表', icon: ListOrdered, active: active?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
                { label: '任务清单', icon: CheckSquare, active: active?.task, run: () => editor.chain().focus().toggleTaskList().run() },
                { label: '引用', icon: Quote, active: active?.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
                { label: '行内代码', icon: Code, active: active?.inlineCode, run: () => editor.chain().focus().toggleCode().run() },
                { label: '代码块', icon: Code2, active: active?.code, run: () => editor.chain().focus().toggleCodeBlock().run() },
                { label: '链接', icon: Link2, active: active?.link, run: () => {
                  setImageOpen(false);
                  setLinkUrl(editor.getAttributes('link').href || '');
                  setLinkError('');
                  setLinkOpen((current) => !current);
                } },
                { label: '插入图片', icon: ImagePlus, active: imageOpen, run: () => {
                  setLinkOpen(false);
                  setImageError('');
                  setImageOpen((current) => !current);
                } },
                { label: '分割线', icon: Minus, active: false, run: () => editor.chain().focus().setHorizontalRule().run() },
                { label: '插入表格', icon: Table2, active: active?.table, run: () => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run() },
                { label: '插入请求', icon: Terminal, active: false, run: () => editor.chain().focus().insertContent({ type: 'curlRequest', attrs: { command: '' } }).run() },
              ].map(({ label: title, icon: Icon, active: pressed, run }) => (
                <button key={title} type="button" aria-label={title} title={title === '行内代码' ? '行内代码 · ⌘/Ctrl + E' : title} aria-pressed={Boolean(pressed)}
                  onMouseDown={(event) => event.preventDefault()} onClick={run}><Icon size={15} /></button>
              ))}
            </div>
          )}
          <button className="markdown-editor__mode" type="button" aria-pressed={sourceMode} onClick={toggleSource}>
            {sourceMode ? '返回编辑' : 'Markdown 源码'}
          </button>
        </div>

        {!sourceMode && editor && active?.code && (
          <div className="markdown-editor__context" role="toolbar" aria-label="代码块工具">
            <label>代码语言 <select aria-label="代码语言" value={active.codeLanguage}
              onChange={(event) => editor.chain().focus().updateAttributes('codeBlock', { language: event.target.value }).run()}>
              {!CODE_LANGUAGES.some(([language]) => language === active.codeLanguage) && <option value={active.codeLanguage}>{active.codeLanguage}</option>}
              {CODE_LANGUAGES.map(([language, title]) => <option key={language} value={language}>{title}</option>)}
            </select></label>
          </div>
        )}

        {!sourceMode && editor && active?.table && (
          <div className="markdown-editor__context" role="toolbar" aria-label="表格工具">
            {[
              { title: '下方插入行', run: () => editor.chain().focus().addRowAfter().run() },
              { title: '右侧插入列', run: () => editor.chain().focus().addColumnAfter().run() },
              { title: '删除当前行', run: () => editor.chain().focus().deleteRow().run() },
              { title: '删除当前列', run: () => editor.chain().focus().deleteColumn().run() },
              { title: '删除表格', run: () => editor.chain().focus().deleteTable().run() },
            ].map(({ title, run }) => <button key={title} type="button" onMouseDown={(event) => event.preventDefault()}
              onClick={run}>{title}</button>)}
          </div>
        )}

        {imageOpen && editor && (
          <div className="markdown-editor__link markdown-editor__image" onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.querySelector('button')?.click(); }
            if (event.key === 'Escape') { event.stopPropagation(); setImageOpen(false); editor.commands.focus(); }
          }}>
            <input aria-label="图片地址" placeholder="图片地址 https://…" value={imageUrl} autoFocus
              onChange={(event) => { setImageUrl(event.target.value); setImageError(''); }} />
            <input aria-label="图片说明" placeholder="图片说明（可选）" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} />
            <button type="button" onClick={() => {
              const src = imageUrl.trim();
              try {
                if (!['http:', 'https:', 'data:'].includes(new URL(src).protocol) || (src.startsWith('data:') && !src.startsWith('data:image/'))) throw new Error();
              } catch { setImageError('请输入有效的图片地址'); return; }
              editor.chain().focus().setImage({ src, alt: imageAlt.trim() }).run();
              setImageOpen(false);
              setImageUrl('');
              setImageAlt('');
            }}>插入</button>
            <button type="button" onClick={() => setImageOpen(false)}>收起</button>
            {imageError && <span role="alert">{imageError}</span>}
          </div>
        )}

        {linkOpen && editor && (
          <div className="markdown-editor__link">
            <input aria-label="链接地址" placeholder="https://…" value={linkUrl} autoFocus
              onChange={(event) => { setLinkUrl(event.target.value); setLinkError(''); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.parentElement?.querySelector('button')?.click(); }
                if (event.key === 'Escape') { event.stopPropagation(); setLinkOpen(false); editor.commands.focus(); }
              }} />
            <button type="button" onClick={() => {
              const href = linkUrl.trim();
              if (href && !/^(https?:\/\/|mailto:)/i.test(href)) { setLinkError('请输入 http、https 或 mailto 链接'); return; }
              if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
              else editor.chain().focus().extendMarkRange('link').unsetLink().run();
              setLinkOpen(false);
            }}>应用</button>
            <button type="button" onClick={() => { setLinkOpen(false); editor.commands.focus(); }}>收起</button>
            {linkError && <span role="alert">{linkError}</span>}
          </div>
        )}
      </div>

      {sourceMode && (
        <textarea className="markdown-editor__source" value={value} maxLength={maxLength} aria-label={`${label} Markdown 源码`}
          spellCheck={false} autoFocus onChange={(event) => onChange(event.target.value)} />
      )}
      {sourceMode && <span className="markdown-editor__preview-label">实时预览</span>}
      <EditorLinkPreview editor={editor} sourceMode={sourceMode} maxLength={maxLength}
        onMarkdownChange={(next) => { lastValue.current = next; onChangeRef.current(next); }}>
        <EditorContent editor={editor} className="markdown-editor__content" />
      </EditorLinkPreview>
    </div>
  );
}
