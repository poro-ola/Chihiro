import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, useEditorState, type ReactNodeViewProps } from '@tiptap/react';
import { Check, Copy, LoaderCircle, Pencil, Play, Terminal, Trash2 } from 'lucide-react';
import { CURL_MESSAGE, formatCurlOutput, parseCurl, type CurlExecutionResult } from '../lib/curl';

async function copyOutput(text: string, button: HTMLButtonElement) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* HTTP pages and some clipboard policies need the user-gesture fallback. */ }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = 'position:fixed;left:-10000px;top:0';
  const root = button.getRootNode();
  (root instanceof ShadowRoot ? root : document.body).append(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('复制失败');
  } finally { textarea.remove(); button.focus(); }
}

export function CurlRequestCard({ node, editor, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const command = String(node.attrs.command || '');
  const [editing, setEditing] = useState(!command);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<CurlExecutionResult>();
  const [copyState, setCopyState] = useState('');
  const version = useRef(0);
  const busy = useRef(false);
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  const parsed = useMemo(() => {
    try { return { request: parseCurl(command), error: '' }; }
    catch (reason) { return { request: undefined, error: reason instanceof Error ? reason.message : '请求格式无效' }; }
  }, [command]);
  const output = result ? formatCurlOutput(result) : '';

  useEffect(() => {
    version.current++;
    busy.current = false;
    setExecuting(false);
    setResult(undefined);
    setCopyState('');
  }, [command]);
  useEffect(() => () => { version.current++; }, []);

  const execute = async () => {
    if (!parsed.request || busy.current) return;
    busy.current = true;
    const current = ++version.current;
    setExecuting(true);
    setCopyState('');
    setResult(undefined);
    try {
      const response = await browser.runtime.sendMessage({ type: CURL_MESSAGE.execute, command }) as CurlExecutionResult;
      if (current === version.current) setResult(response);
    } catch (reason) {
      if (current === version.current) setResult({ ok: false, error: reason instanceof Error ? reason.message : '请求执行失败' });
    } finally {
      if (current === version.current) { busy.current = false; setExecuting(false); }
    }
  };

  return (
    <NodeViewWrapper as="section" className="curl-card" contentEditable={false} aria-label="cURL 请求卡片"
      onKeyDown={(event: React.KeyboardEvent) => {
        event.stopPropagation();
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void execute(); }
        if (event.key === 'Escape' && editing && command) { event.preventDefault(); setEditing(false); }
      }}>
      <header className="curl-card__header">
        <span className="curl-card__badge"><Terminal size={14} /> {parsed.request?.method || 'CURL'}</span>
        <span className="curl-card__url" title={parsed.request?.url}>{parsed.request?.url || '添加 HTTP 请求'}</span>
        <div className="curl-card__actions">
          {editable && <button type="button" aria-label={editing ? '完成请求编辑' : '编辑请求'} title={editing ? '完成编辑' : '编辑请求'}
            disabled={executing} onClick={() => { if (editor.isEditable) setEditing((value) => !value); }}>
            {editing ? <Check size={14} /> : <Pencil size={14} />}
          </button>}
          {editable && <button type="button" aria-label="删除请求" title="删除请求" disabled={executing}
            onClick={() => { if (editor.isEditable) deleteNode(); }}><Trash2 size={14} /></button>}
          <button type="button" className="curl-card__run" aria-label="执行请求" disabled={executing || !parsed.request} onClick={() => void execute()}>
            {executing ? <LoaderCircle size={13} className="curl-card__spinner" /> : <Play size={13} />}{executing ? '执行中…' : '执行'}
          </button>
        </div>
      </header>
      {editing && editable ? <div className="curl-card__editor">
        <textarea aria-label="cURL 请求命令" value={command} autoFocus spellCheck={false} disabled={executing}
          placeholder={'curl -sS -X POST \\\n  \'https://api.example.com/items\' \\\n  | jq -r \'.data\''}
          onChange={(event) => { if (editor.isEditable) updateAttributes({ command: event.target.value }); }} />
        <span>输入后自动保存 · ⌘/Ctrl + Enter 执行 · 支持 jq 字段路径提取</span>
      </div> : <pre className="curl-card__command">{command || '尚未输入请求'}</pre>}
      {command && parsed.error && <p className="curl-card__error" role="alert">{parsed.error}</p>}
      {parsed.request?.warnings.map((warning) => <p className="curl-card__hint" key={warning}>{warning}</p>)}
      {result && <div className="curl-card__result" aria-live="polite" data-error={!result.ok || Boolean(result.error) || undefined}>
        <div className="curl-card__result-header">
          <strong>{result.status ? `${result.status} ${result.statusText || ''}` : result.error ? '执行失败' : '响应结果'}</strong>
          {result.durationMs !== undefined && <span>{result.durationMs} ms</span>}
          <button type="button" aria-label="复制请求结果" onClick={async (event) => {
            try { await copyOutput(output, event.currentTarget); setCopyState('已复制'); }
            catch { setCopyState('复制失败，请选中下方结果复制'); }
          }}>{copyState === '已复制' ? <Check size={13} /> : <Copy size={13} />}{copyState || '复制结果'}</button>
        </div>
        {result.error && <p className="curl-card__error" role="alert">{result.error}</p>}
        {result.hint && <p className="curl-card__hint">{result.hint}</p>}
        {result.bodyTruncated && <p className="curl-card__error">响应超过 100 KB，以下展示和复制的内容已截断。</p>}
        <pre className="curl-card__output" aria-label="请求执行结果" tabIndex={0}>{output || (result.error ? '' : '(空响应)')}</pre>
        {Boolean(result.headers?.length) && <details className="curl-card__headers"><summary>响应头 · {result.headers!.length}</summary>
          <pre>{result.headers!.map(([name, value]) => `${name}: ${value}`).join('\n')}</pre>
        </details>}
      </div>}
    </NodeViewWrapper>
  );
}
