import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, GripVertical, PanelsTopLeft, Pin, X } from 'lucide-react';
import type { OpenTab } from '../../../lib/types';

interface OpenTabsPanelProps {
  tabs: OpenTab[];
  collapsed: boolean;
  onActivate: (id: number) => void;
  onCloseTab: (id: number) => void;
  onToggleCollapsed: () => void;
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '浏览器页面';
  }
}

function TabFavicon({ tab }: { tab: OpenTab }) {
  const fallback = (domainOf(tab.url)[0] || '•').toUpperCase();
  return (
    <span className="favicon" aria-hidden="true">
      {tab.faviconUrl ? <img src={tab.faviconUrl} alt="" draggable={false} /> : fallback}
    </span>
  );
}

function DraggableTab({
  tab,
  onActivate,
  onClose,
}: {
  tab: OpenTab;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } = useDraggable({
    id: `tab:${tab.id}`,
    data: { type: 'tab', tab },
  });

  return (
    <article
      ref={setNodeRef}
      className={`open-tab ${tab.active ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      title="按住卡片任意位置拖入集合"
      {...listeners}
    >
      <button
        ref={setActivatorNodeRef}
        className="tab-drag-handle"
        aria-label={`拖动${tab.title}`}
        {...attributes}
      >
        <GripVertical size={14} />
      </button>
      <button className="open-tab__main" onClick={() => onActivate(tab.id)}>
        <TabFavicon tab={tab} />
        <span className="open-tab__copy">
          <strong>{tab.title}</strong>
          <span>{domainOf(tab.url)}</span>
        </span>
        {tab.pinned && <Pin size={13} className="pin-icon" />}
      </button>
      <button
        className="open-tab__close"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose(tab.id);
        }}
        aria-label={`关闭标签：${tab.title}`}
        title={`关闭 ${tab.title}`}
      >
        <X size={14} />
      </button>
    </article>
  );
}

export function OpenTabsPanel({ tabs, collapsed, onActivate, onCloseTab, onToggleCollapsed }: OpenTabsPanelProps) {
  if (collapsed) {
    return (
      <aside className="tabs-panel tabs-panel--collapsed" aria-label="当前标签页">
        <button className="tabs-panel__expand" onClick={onToggleCollapsed} aria-label="展开当前标签">
          <ChevronLeft size={18} />
          <PanelsTopLeft size={18} />
          <span>{tabs.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="tabs-panel" aria-label="当前标签页">
      <header className="tabs-panel__header">
        <div>
          <span className="eyebrow">CURRENT WINDOW</span>
          <h2>当前标签</h2>
        </div>
        <button className="icon-button" onClick={onToggleCollapsed} aria-label="折叠当前标签">
          <ChevronRight size={18} />
        </button>
      </header>
      <p className="tabs-panel__hint">拖动标签到任意集合，原页面会保持打开。</p>
      <div className="open-tabs-list">
        {tabs.length ? (
          tabs.map((tab) => (
            <DraggableTab key={tab.id} tab={tab} onActivate={onActivate} onClose={onCloseTab} />
          ))
        ) : (
          <div className="tabs-empty">
            <PanelsTopLeft size={21} />
            <p>没有可读取的标签页</p>
            <span>已存资料仍可正常使用</span>
          </div>
        )}
      </div>
      <footer className="tabs-panel__footer">
        <span>{tabs.length} 个标签</span>
        <span>拖拽保存</span>
      </footer>
    </aside>
  );
}
