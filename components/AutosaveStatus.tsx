import type { AutosaveSnapshot } from '../lib/autosave';

export function AutosaveStatus({ value, status, error, maxLength, onRetry }: AutosaveSnapshot & {
  maxLength?: number;
  onRetry: () => Promise<boolean>;
}) {
  return (
    <footer className="markdown-save-status" aria-live="polite">
      <span className={status === 'error' ? 'is-error' : undefined}>
        {status === 'idle' && '自动保存'}
        {status === 'pending' && '等待保存…'}
        {status === 'saving' && '保存中…'}
        {status === 'saved' && '已保存'}
        {status === 'error' && <>{error || '自动保存失败'} <button type="button" onClick={() => void onRetry()}>重试</button></>}
      </span>
      <em>{value.length.toLocaleString()}{maxLength === undefined ? ' 字符' : ` / ${maxLength.toLocaleString()}`}</em>
    </footer>
  );
}
