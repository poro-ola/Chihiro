import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Folder, Link2, PanelsTopLeft, Search, StickyNote, X } from 'lucide-react';
import type { SearchCategory, SearchResult } from '../../../lib/types';

interface SearchPaletteProps {
  open: boolean;
  query: string;
  category: SearchCategory;
  results: SearchResult[];
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: SearchCategory) => void;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
}

const categories: { id: SearchCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'bookmark', label: '书签' },
  { id: 'note', label: '记事' },
  { id: 'collection', label: '集合' },
  { id: 'tab', label: '当前标签' },
];

function ResultIcon({ type }: { type: SearchResult['type'] }) {
  if (type === 'bookmark') return <Link2 size={17} />;
  if (type === 'note') return <StickyNote size={17} />;
  if (type === 'collection') return <Folder size={17} />;
  return <PanelsTopLeft size={17} />;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    if (!query.trim()) return [text];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.split(new RegExp(`(${escaped})`, 'ig'));
  }, [query, text]);

  return (
    <>
      {parts.map((part, index) =>
        query && part.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part,
      )}
    </>
  );
}

export function SearchPalette({
  open,
  query,
  category,
  results,
  onQueryChange,
  onCategoryChange,
  onSelect,
  onClose,
}: SearchPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [category, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="search-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="search-palette" role="dialog" aria-modal="true" aria-label="搜索所有资料">
        <div className="search-palette__input">
          <Search size={23} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索标题、网址、记事或当前标签…"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelectedIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === 'Enter' && results[selectedIndex]) {
                event.preventDefault();
                onSelect(results[selectedIndex]);
              }
            }}
          />
          <button className="icon-button" onClick={onClose} aria-label="关闭搜索"><X size={19} /></button>
        </div>

        <nav className="search-categories" aria-label="搜索分类">
          {categories.map((entry) => (
            <button key={entry.id} className={category === entry.id ? 'is-active' : ''} onClick={() => onCategoryChange(entry.id)}>
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="search-results" role="listbox">
          <div className="search-results__label">{query ? `${results.length} 个结果` : '最近更新'}</div>
          {results.length ? (
            results.map((result, index) => (
              <button
                key={result.id}
                className={`search-result ${selectedIndex === index ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onSelect(result)}
                role="option"
                aria-selected={selectedIndex === index}
              >
                <span className={`search-result__icon search-result__icon--${result.type}`}><ResultIcon type={result.type} /></span>
                <span className="search-result__copy">
                  <strong><Highlight text={result.title} query={query} /></strong>
                  <span><Highlight text={result.subtitle} query={query} /></span>
                </span>
                <span className="search-result__type">
                  {result.type === 'bookmark' ? '书签' : result.type === 'note' ? '记事' : result.type === 'collection' ? '集合' : '标签'}
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))
          ) : (
            <div className="search-empty">
              <Search size={24} />
              <h3>没有找到匹配内容</h3>
              <p>换一个标题、域名或记事关键词试试。</p>
            </div>
          )}
        </div>

        <footer className="search-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </section>
    </div>
  );
}
