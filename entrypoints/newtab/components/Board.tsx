import { useEffect, useState } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  GripVertical,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { openBookmark } from '../../../lib/browser-tabs';
import type {
  BoardItem,
  BookmarkItem,
  Collection,
  NoteItem,
  Workspace,
} from '../../../lib/types';

interface BoardProps {
  workspace?: Workspace;
  collections: Collection[];
  items: BoardItem[];
  openArchiveCollectionIds: ReadonlySet<string>;
  highlightedItemId?: string;
  onAddCollection: (name: string) => Promise<void>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (collection: Collection) => void;
  onToggleCollection: (id: string, collapsed: boolean) => void;
  onAddBookmark: (collectionId: string) => void;
  onAddNote: (collectionId: string) => void;
  onEditBookmark: (item: BookmarkItem) => void;
  onEditNote: (item: NoteItem) => void;
  onOpenBookmarks: (collection: Collection, bookmarks: BookmarkItem[]) => void;
  onArchiveItem: (item: BoardItem) => void;
  onRestoreArchivedItem: (item: BoardItem) => void;
  onArchiveOpenChange: (collectionId: string, open: boolean) => void;
  onDeleteItem: (item: BoardItem) => void;
  onMoveItem: (itemId: string, collectionId: string) => void;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Favicon({ item }: { item: BookmarkItem }) {
  const fallback = (hostOf(item.url)[0] || '•').toUpperCase();
  return (
    <span className="bookmark-favicon" aria-hidden="true">
      {item.faviconUrl ? <img src={item.faviconUrl} alt="" draggable={false} /> : fallback}
    </span>
  );
}

function MoveSelect({
  item,
  collections,
  onMove,
}: {
  item: BoardItem;
  collections: Collection[];
  onMove: (itemId: string, collectionId: string) => void;
}) {
  return (
    <label className="move-select" title="移动到其他集合">
      <span className="sr-only">移动到集合</span>
      <MoreHorizontal size={15} aria-hidden="true" />
      <select
        value=""
        aria-label="移动到集合"
        onChange={(event) => {
          if (event.target.value) onMove(item.id, event.target.value);
        }}
      >
        <option value="">移动到…</option>
        {collections
          .filter((collection) => collection.id !== item.collectionId)
          .map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function NoteCard({ item, onEdit }: { item: NoteItem; onEdit: (item: NoteItem) => void }) {
  const lines = item.content.trim().split('\n').map((line) => line.trim()).filter(Boolean);
  const title = (lines[0] || '空白记事').slice(0, 120);
  const detail = (
    lines.slice(1).join(' ') || (item.content.trim() ? '点击打开完整内容' : '点击开始记录')
  ).slice(0, 180);

  return (
    <button className="note-card__main" onClick={() => onEdit(item)} title="点击编辑记事">
      <span className="note-card__icon" aria-hidden="true"><StickyNote size={16} /></span>
      <span className="note-card__copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <Pencil size={14} className="note-card__edit-icon" aria-hidden="true" />
    </button>
  );
}

function SortableBoardItem({
  item,
  collections,
  highlighted,
  onEditBookmark,
  onEditNote,
  onArchive,
  onDelete,
  onMove,
}: {
  item: BoardItem;
  collections: Collection[];
  highlighted: boolean;
  onEditBookmark: (item: BookmarkItem) => void;
  onEditNote: (item: NoteItem) => void;
  onArchive: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
  onMove: (itemId: string, collectionId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `item:${item.id}`,
    data: { type: 'item', item },
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <article
      id={`item-${item.id}`}
      ref={setNodeRef}
      style={style}
      className={`board-item board-item--${item.type} ${isDragging ? 'is-dragging' : ''} ${highlighted ? 'is-highlighted' : ''}`}
    >
      <button className="item-drag-handle" aria-label="拖动卡片" {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>

      {item.type === 'bookmark' ? (
        <button
          className="bookmark-card__main"
          onClick={(event) => void openBookmark(item.url, event.metaKey || event.ctrlKey)}
          title={`${item.title}\n${item.url}`}
        >
          <Favicon item={item} />
          <span className="bookmark-card__copy">
            <strong>{item.title}</strong>
            <span>{item.note || hostOf(item.url)}</span>
          </span>
          <ExternalLink size={15} className="external-icon" />
        </button>
      ) : (
        <NoteCard item={item} onEdit={onEditNote} />
      )}

      <div className="board-item__actions">
        {item.type === 'bookmark' && (
          <button className="icon-button" onClick={() => onEditBookmark(item)} aria-label="编辑书签">
            <Pencil size={14} />
          </button>
        )}
        <MoveSelect item={item} collections={collections} onMove={onMove} />
        <button className="icon-button" onClick={() => onArchive(item)} aria-label="归档卡片" title="归档">
          <Archive size={14} />
        </button>
        <button className="icon-button danger-icon" onClick={() => onDelete(item)} aria-label="删除卡片">
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function SortableCollection({
  collection,
  items,
  archivedItems,
  collections,
  archiveOpen,
  highlightedItemId,
  onRename,
  onDelete,
  onToggle,
  onAddBookmark,
  onAddNote,
  onEditBookmark,
  onEditNote,
  onOpenBookmarks,
  onArchiveItem,
  onRestoreArchivedItem,
  onArchiveOpenChange,
  onDeleteItem,
  onMoveItem,
}: {
  collection: Collection;
  items: BoardItem[];
  archivedItems: BoardItem[];
  collections: Collection[];
  archiveOpen: boolean;
  highlightedItemId?: string;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (collection: Collection) => void;
  onToggle: (id: string, collapsed: boolean) => void;
  onAddBookmark: (collectionId: string) => void;
  onAddNote: (collectionId: string) => void;
  onEditBookmark: (item: BookmarkItem) => void;
  onEditNote: (item: NoteItem) => void;
  onOpenBookmarks: (collection: Collection, bookmarks: BookmarkItem[]) => void;
  onArchiveItem: (item: BoardItem) => void;
  onRestoreArchivedItem: (item: BoardItem) => void;
  onArchiveOpenChange: (open: boolean) => void;
  onDeleteItem: (item: BoardItem) => void;
  onMoveItem: (itemId: string, collectionId: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(collection.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `collection:${collection.id}`,
    data: { type: 'collection', collection },
  });

  useEffect(() => setName(collection.name), [collection.name]);
  const bookmarks = items.filter((item): item is BookmarkItem => item.type === 'bookmark');

  const saveName = async () => {
    await onRename(collection.id, name);
    setRenaming(false);
  };

  return (
    <section
      id={`collection-${collection.id}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`collection ${isDragging ? 'is-dragging' : ''} ${isOver ? 'is-drop-target' : ''}`}
    >
      <header className="collection__header">
        <button className="collection-drag-handle" aria-label={`拖动${collection.name}`} {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
        <button
          className="collection__collapse"
          onClick={() => onToggle(collection.id, !collection.isCollapsed)}
          aria-label={collection.isCollapsed ? '展开集合' : '折叠集合'}
        >
          {collection.isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
        </button>

        {renaming ? (
          <form
            className="collection-rename"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={60} />
          </form>
        ) : (
          <div className="collection__identity">
            <button className="collection__title" onDoubleClick={() => setRenaming(true)} onClick={() => onToggle(collection.id, !collection.isCollapsed)}>
              <span>{collection.name}</span>
              <em>{items.length}</em>
            </button>
            <button
              type="button"
              className="collection__open-all"
              onClick={() => onOpenBookmarks(collection, bookmarks)}
              aria-label={`打开${collection.name}的全部链接`}
              title={bookmarks.length ? `在新标签页打开 ${bookmarks.length} 个链接` : '集合中没有可打开的链接'}
              disabled={!bookmarks.length}
            >
              <FolderOpen size={16} />
            </button>
          </div>
        )}

        <div className="collection__actions">
          <button className="text-action" onClick={() => onAddBookmark(collection.id)}>
            <Link2 size={15} /> 链接
          </button>
          <button className="text-action" onClick={() => onAddNote(collection.id)}>
            <StickyNote size={15} /> 记事
          </button>
          <button className="icon-button" onClick={() => setRenaming(true)} aria-label="重命名集合">
            <Pencil size={14} />
          </button>
          <button className="icon-button danger-icon" onClick={() => onDelete(collection)} aria-label="删除集合">
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      <div className={`collection__content ${collection.isCollapsed ? 'is-collapsed' : ''}`}>
        <div>
          <SortableContext items={items.map((item) => `item:${item.id}`)} strategy={verticalListSortingStrategy}>
            <div className="items-grid">
              {items.map((item) => (
                <SortableBoardItem
                  key={item.id}
                  item={item}
                  collections={collections}
                  highlighted={item.id === highlightedItemId}
                  onEditBookmark={onEditBookmark}
                  onEditNote={onEditNote}
                  onArchive={onArchiveItem}
                  onDelete={onDeleteItem}
                  onMove={onMoveItem}
                />
              ))}
              {!items.length && (
                <div className="collection-empty">
                  <FileText size={18} />
                  <span>拖入标签，或添加链接与记事</span>
                </div>
              )}
            </div>
          </SortableContext>

          {archivedItems.length > 0 && (
            <ArchiveShelf
              collection={collection}
              items={archivedItems}
              open={archiveOpen}
              highlightedItemId={highlightedItemId}
              onOpenChange={onArchiveOpenChange}
              onRestore={onRestoreArchivedItem}
              onDelete={onDeleteItem}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ArchivedItemRow({
  item,
  highlighted,
  onRestore,
  onDelete,
}: {
  item: BoardItem;
  highlighted: boolean;
  onRestore: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
}) {
  const title = item.type === 'bookmark'
    ? item.title
    : item.content.trim().split('\n')[0] || '空白记事';
  const detail = item.type === 'bookmark'
    ? hostOf(item.url)
    : item.content.trim().split('\n').slice(1).join(' ') || '记事';
  const copy = (
    <>
      {item.type === 'bookmark' ? (
        <Favicon item={item} />
      ) : (
        <span className="archive-item__icon archive-item__icon--note" aria-hidden="true">
          <StickyNote size={15} />
        </span>
      )}
      <span className="archive-item__copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </>
  );

  return (
    <article
      id={`item-${item.id}`}
      className={`archive-item ${highlighted ? 'is-highlighted' : ''}`}
    >
      {item.type === 'bookmark' ? (
        <button
          className="archive-item__main"
          onClick={(event) => void openBookmark(item.url, event.metaKey || event.ctrlKey)}
          title={`${item.title}\n${item.url}`}
        >
          {copy}
        </button>
      ) : (
        <div className="archive-item__main">{copy}</div>
      )}
      <div className="archive-item__actions">
        <button className="icon-button" onClick={() => onRestore(item)} aria-label="恢复卡片" title="恢复到原集合">
          <ArchiveRestore size={15} />
        </button>
        <button className="icon-button danger-icon" onClick={() => onDelete(item)} aria-label="删除归档卡片">
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function ArchiveShelf({
  collection,
  items,
  open,
  highlightedItemId,
  onOpenChange,
  onRestore,
  onDelete,
}: {
  collection: Collection;
  items: BoardItem[];
  open: boolean;
  highlightedItemId?: string;
  onOpenChange: (open: boolean) => void;
  onRestore: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
}) {
  const contentId = `archive-shelf-content-${collection.id}`;

  return (
    <section className={`archive-shelf ${open ? 'is-open' : ''}`} aria-label={`${collection.name}归档`}>
      <button
        className="archive-shelf__toggle"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="archive-shelf__mark"><Archive size={17} /></span>
        <span className="archive-shelf__title">
          <strong>归档</strong>
          <span>收起暂时不需要展示的资料</span>
        </span>
        <em>{items.length}</em>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>

      <div
        id={contentId}
        className="archive-shelf__content"
        aria-hidden={!open}
        inert={!open}
      >
        <div>
          <div className="archive-items">
            {items.map((item) => (
              <ArchivedItemRow
                key={item.id}
                item={item}
                highlighted={item.id === highlightedItemId}
                onRestore={onRestore}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Board({
  workspace,
  collections,
  items,
  openArchiveCollectionIds,
  highlightedItemId,
  onAddCollection,
  onRenameCollection,
  onDeleteCollection,
  onToggleCollection,
  onAddBookmark,
  onAddNote,
  onEditBookmark,
  onEditNote,
  onOpenBookmarks,
  onArchiveItem,
  onRestoreArchivedItem,
  onArchiveOpenChange,
  onDeleteItem,
  onMoveItem,
}: BoardProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [addError, setAddError] = useState('');
  const visibleItems = items.filter((item) => !item.archivedAt);
  const archivedItems = items
    .filter((item) => item.archivedAt)
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));

  const submit = async () => {
    try {
      await onAddCollection(name);
      setName('');
      setAdding(false);
      setAddError('');
    } catch (reason) {
      setAddError(reason instanceof Error ? reason.message : '创建失败');
    }
  };

  return (
    <main className="board">
      <header className="board-header">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>{workspace?.name || '我的空间'}</h1>
          <p>
            {collections.length} 个集合 · {visibleItems.length} 条资料
            {archivedItems.length ? ` · ${archivedItems.length} 已归档` : ''}
          </p>
        </div>
        {adding ? (
          <form
            className="add-collection-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="集合名称"
              autoFocus
              maxLength={60}
            />
            {addError && <span className="field-error">{addError}</span>}
            <button type="button" className="text-button" onClick={() => setAdding(false)}>取消</button>
            <button type="submit" className="small-primary">创建</button>
          </form>
        ) : (
          <button className="primary-button" onClick={() => setAdding(true)}>
            <Plus size={17} /> 新建集合
          </button>
        )}
      </header>

      <div className="board-intro">
        <div className="board-intro__icon"><FileText size={17} /></div>
        <p><strong>把浏览变成资料。</strong> 从右侧拖入当前标签，也可以在集合中直接补充链接和文字。</p>
      </div>

      <SortableContext items={collections.map((collection) => `collection:${collection.id}`)} strategy={verticalListSortingStrategy}>
        <div className="collections-list">
          {collections.map((collection) => (
            <SortableCollection
              key={collection.id}
              collection={collection}
              items={visibleItems.filter((item) => item.collectionId === collection.id).sort((a, b) => a.order - b.order)}
              archivedItems={archivedItems.filter((item) => item.collectionId === collection.id)}
              collections={collections}
              archiveOpen={openArchiveCollectionIds.has(collection.id)}
              highlightedItemId={highlightedItemId}
              onRename={onRenameCollection}
              onDelete={onDeleteCollection}
              onToggle={onToggleCollection}
              onAddBookmark={onAddBookmark}
              onAddNote={onAddNote}
              onEditBookmark={onEditBookmark}
              onEditNote={onEditNote}
              onOpenBookmarks={onOpenBookmarks}
              onArchiveItem={onArchiveItem}
              onRestoreArchivedItem={onRestoreArchivedItem}
              onArchiveOpenChange={(open) => onArchiveOpenChange(collection.id, open)}
              onDeleteItem={onDeleteItem}
              onMoveItem={onMoveItem}
            />
          ))}
        </div>
      </SortableContext>
    </main>
  );
}
