import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { activateTab, openBookmarks, subscribeToOpenTabs } from '../../lib/browser-tabs';
import {
  archiveItem,
  clearAllData,
  createBookmark,
  createCollection,
  createNote,
  createWorkspace,
  db,
  deleteCollection,
  deleteItem,
  deleteWorkspace,
  ensureSeedData,
  moveItem,
  renameWorkspace,
  renameCollection,
  reorderCollections,
  reorderWorkspaces,
  restoreItem,
  setActiveWorkspace,
  toggleCollection,
  unarchiveItem,
  updateBookmark,
  updateBookmarkNote,
  updateNote,
  updateAppSetting,
} from '../../lib/db';
import type {
  BoardItem,
  BookmarkItem,
  Collection,
  NoteItem,
  OpenTab,
  SearchCategory,
  SearchResult,
  Workspace,
} from '../../lib/types';
import { Board } from './components/Board';
import { BookmarkDialog, BookmarkNoteDialog, ConfirmDialog, NoteDialog } from './components/Dialogs';
import { OpenTabsPanel } from './components/OpenTabsPanel';
import { SearchPalette } from './components/SearchPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';

type Toast = {
  id: number;
  message: string;
  tone: 'success' | 'error';
  action?: { label: string; run: () => void };
};

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

type BookmarkDialogState = {
  collectionId: string;
  item?: BookmarkItem;
  focusField?: 'url' | 'note';
};

const workspaceCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length ? pointerCollisions : closestCenter(args);
};

function App() {
  const workspaces = useLiveQuery(() => db.workspaces.orderBy('order').toArray(), []) ?? [];
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []) ?? [];
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [toast, setToast] = useState<Toast>();
  const [confirm, setConfirm] = useState<ConfirmState>();
  const [bookmarkDialog, setBookmarkDialog] = useState<BookmarkDialogState>();
  const [noteDialog, setNoteDialog] = useState<NoteItem>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('all');
  const [openArchiveCollectionIds, setOpenArchiveCollectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [highlightedItemId, setHighlightedItemId] = useState<string>();
  const [dragLabel, setDragLabel] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverCollectionId = useRef<string | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success', action?: Toast['action']) => {
    window.clearTimeout(toastTimer.current);
    const next = { id: Date.now(), message, tone, action };
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast((current) => current?.id === next.id ? undefined : current), 5_000);
  }, []);

  const setCollectionArchiveOpen = useCallback((collectionId: string, open: boolean) => {
    setOpenArchiveCollectionIds((current) => {
      const next = new Set(current);
      if (open) next.add(collectionId);
      else next.delete(collectionId);
      return next;
    });
  }, []);

  useEffect(() => {
    void ensureSeedData()
      .then(() => setReady(true))
      .catch((reason) => {
        setStartupError(reason instanceof Error ? reason.message : '本地数据初始化失败');
        setReady(true);
      });
    return subscribeToOpenTabs(setOpenTabs);
  }, [notify]);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(hoverTimer.current);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    const narrowViewport = window.matchMedia('(max-width: 980px)');
    const collapseTabsOnNarrowScreens = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) void updateAppSetting('rightPanelCollapsed', true);
    };
    collapseTabsOnNarrowScreens(narrowViewport);
    narrowViewport.addEventListener('change', collapseTabsOnNarrowScreens);
    return () => narrowViewport.removeEventListener('change', collapseTabsOnNarrowScreens);
  }, []);

  const activeWorkspaceId = settings?.activeWorkspaceId || workspaces[0]?.id || '';
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeCollections = collections
    .filter((collection) => collection.workspaceId === activeWorkspaceId)
    .sort((a, b) => a.order - b.order);
  const activeCollectionIds = new Set(activeCollections.map((collection) => collection.id));
  const activeItems = items.filter((item) => activeCollectionIds.has(item.collectionId));

  const collectionMap = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections],
  );
  const workspaceMap = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const matches = (value: string) => !query || value.toLocaleLowerCase().includes(query);
    const results: (SearchResult & { updatedAt?: string })[] = [];

    for (const collection of collections) {
      const workspace = workspaceMap.get(collection.workspaceId);
      if ((searchCategory === 'all' || searchCategory === 'collection') && matches(`${collection.name} ${workspace?.name || ''}`)) {
        results.push({
          id: `search-collection-${collection.id}`,
          type: 'collection',
          title: collection.name,
          subtitle: workspace?.name || '工作区',
          workspaceId: collection.workspaceId,
          collectionId: collection.id,
          updatedAt: collection.updatedAt,
        });
      }
    }

    for (const item of items) {
      const collection = collectionMap.get(item.collectionId);
      if (!collection) continue;
      const workspace = workspaceMap.get(collection.workspaceId);
      const path = `${workspace?.name || '工作区'} / ${collection.name}`;
      const archivePrefix = item.archivedAt ? '归档 · ' : '';
      if (item.type === 'bookmark') {
        if (searchCategory !== 'all' && searchCategory !== 'bookmark') continue;
        if (!matches(`${item.title} ${item.url} ${item.note || ''} ${path}`)) continue;
        results.push({
          id: `search-bookmark-${item.id}`,
          type: 'bookmark',
          title: item.title,
          subtitle: `${archivePrefix}${path} · ${item.note || item.url}`,
          workspaceId: collection.workspaceId,
          collectionId: collection.id,
          itemId: item.id,
          archived: Boolean(item.archivedAt),
          updatedAt: item.updatedAt,
        });
      } else {
        if (searchCategory !== 'all' && searchCategory !== 'note') continue;
        if (!matches(`${item.content} ${path}`)) continue;
        const firstLine = item.content.trim().split('\n')[0] || '空白记事';
        results.push({
          id: `search-note-${item.id}`,
          type: 'note',
          title: firstLine.slice(0, 100),
          subtitle: `${archivePrefix}${path}`,
          workspaceId: collection.workspaceId,
          collectionId: collection.id,
          itemId: item.id,
          archived: Boolean(item.archivedAt),
          updatedAt: item.updatedAt,
        });
      }
    }

    if (searchCategory === 'all' || searchCategory === 'tab') {
      for (const tab of openTabs) {
        if (!matches(`${tab.title} ${tab.url}`)) continue;
        results.push({
          id: `search-tab-${tab.id}`,
          type: 'tab',
          title: tab.title,
          subtitle: tab.url,
          tabId: tab.id,
          updatedAt: tab.active ? new Date().toISOString() : '',
        });
      }
    }

    return results
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 40)
      .map(({ updatedAt: _updatedAt, ...result }) => result as SearchResult);
  }, [collectionMap, collections, items, openTabs, searchCategory, searchQuery, workspaceMap]);

  const locateResult = async (result: SearchResult) => {
    if (result.type === 'tab') {
      await activateTab(result.tabId);
      setSearchOpen(false);
      return;
    }
    await setActiveWorkspace(result.workspaceId);
    await toggleCollection(result.collectionId, false);
    if ('itemId' in result && result.archived) {
      setCollectionArchiveOpen(result.collectionId, true);
    }
    setSearchOpen(false);
    if ('itemId' in result) setHighlightedItemId(result.itemId);
    window.setTimeout(() => {
      const element = document.getElementById('itemId' in result ? `item-${result.itemId}` : `collection-${result.collectionId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => setHighlightedItemId(undefined), 2_400);
    }, 100);
  };

  const resolveTarget = (event: DragEndEvent | DragOverEvent) => {
    const overData = event.over?.data.current;
    if (!event.over || !overData) return undefined;
    if (overData.type === 'collection') {
      const collection = overData.collection as Collection;
      return { collectionId: collection.id, targetIndex: undefined };
    }
    if (overData.type === 'item') {
      const item = overData.item as BoardItem;
      return { collectionId: item.collectionId, targetIndex: item.order };
    }
    return undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'tab') setDragLabel((data.tab as OpenTab).title);
    if (data?.type === 'item') {
      const item = data.item as BoardItem;
      setDragLabel(item.type === 'bookmark' ? item.title : item.content || '空白记事');
    }
    if (data?.type === 'collection') setDragLabel((data.collection as Collection).name);
    if (data?.type === 'workspace') setDragLabel((data.workspace as Workspace).name);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const target = resolveTarget(event);
    if (!target) return;
    const collection = collectionMap.get(target.collectionId);
    if (!collection?.isCollapsed || hoverCollectionId.current === collection.id) return;
    window.clearTimeout(hoverTimer.current);
    hoverCollectionId.current = collection.id;
    hoverTimer.current = window.setTimeout(() => {
      void toggleCollection(collection.id, false);
      hoverCollectionId.current = undefined;
    }, 600);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    window.clearTimeout(hoverTimer.current);
    hoverCollectionId.current = undefined;
    setDragLabel('');
    if (!event.over) return;
    const activeData = event.active.data.current;
    const overData = event.over.data.current;
    if (!activeData || !overData) return;

    try {
      if (activeData.type === 'workspace' && overData.type === 'workspace') {
        const activeWorkspace = activeData.workspace as Workspace;
        const overWorkspace = overData.workspace as Workspace;
        await reorderWorkspaces(activeWorkspace.id, overWorkspace.id);
        return;
      }

      if (activeData.type === 'collection' && overData.type === 'collection') {
        const activeCollection = activeData.collection as Collection;
        const overCollection = overData.collection as Collection;
        if (activeCollection.workspaceId === overCollection.workspaceId) {
          await reorderCollections(activeCollection.workspaceId, activeCollection.id, overCollection.id);
        }
        return;
      }

      const target = resolveTarget(event);
      if (!target) return;
      if (activeData.type === 'item') {
        const item = activeData.item as BoardItem;
        await moveItem(item.id, target.collectionId, target.targetIndex);
        notify('卡片已移动');
      }
      if (activeData.type === 'tab') {
        const tab = activeData.tab as OpenTab;
        const result = await createBookmark(
          target.collectionId,
          { title: tab.title, url: tab.url, faviconUrl: tab.faviconUrl },
          target.targetIndex,
        );
        if (result.created) notify('标签已保存，原页面保持打开');
        else {
          setHighlightedItemId(result.item.id);
          notify('这个集合里已有相同链接');
        }
      }
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '拖拽操作失败', 'error');
    }
  };

  const requestDeleteItem = async (item: BoardItem) => {
    const deleted = await deleteItem(item.id);
    if (!deleted) return;
    notify('卡片已删除', 'success', {
      label: '撤销',
      run: () => {
        void restoreItem(deleted).then(() => notify('卡片已恢复'));
      },
    });
  };

  const requestArchiveItem = async (item: BoardItem) => {
    await archiveItem(item.id);
    notify('卡片已归档', 'success', {
      label: '撤销',
      run: () => {
        void unarchiveItem(item.id).then(() => notify('卡片已恢复到原集合'));
      },
    });
  };

  const requestRestoreArchivedItem = async (item: BoardItem) => {
    await unarchiveItem(item.id);
    notify('卡片已恢复到原集合');
  };

  const saveBookmarkDialog = async (input: { title: string; url: string; note?: string }) => {
    if (!bookmarkDialog) return;
    if (bookmarkDialog.item) {
      await updateBookmark(bookmarkDialog.item.id, input);
      notify('书签已更新');
      return;
    }
    const result = await createBookmark(bookmarkDialog.collectionId, input);
    if (!result.created) throw new Error('这个集合里已有相同链接');
    notify('链接已添加');
  };

  const saveNoteDialog = async (content: string) => {
    if (!noteDialog) return;
    await updateNote(noteDialog.id, content);
    notify('记事已更新');
  };

  if (!ready && !workspaces.length) {
    return (
      <div className="app-loading">
        <div className="brand-mark">千</div>
        <p>正在打开你的资料台…</p>
      </div>
    );
  }

  if (startupError && !workspaces.length) {
    return (
      <main className="fatal-state">
        <div className="fatal-state__icon"><AlertTriangle size={24} /></div>
        <span className="eyebrow">DATABASE UNAVAILABLE</span>
        <h1>无法打开本地资料库</h1>
        <p>{startupError}。现有数据不会被自动清除。</p>
        <button className="primary-button" onClick={() => window.location.reload()}>
          <RefreshCw size={17} /> 重试
        </button>
      </main>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={workspaceCollisionDetection}
      autoScroll
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={() => setDragLabel('')}
    >
      <div className={`app-shell ${settings?.leftPanelCollapsed ? 'has-collapsed-sidebar' : ''} ${settings?.rightPanelCollapsed ? 'has-collapsed-tabs' : ''} ${settings?.compactMode ? 'is-compact' : ''}`}>
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          collapsed={settings?.leftPanelCollapsed || false}
          onSelect={(id) => void setActiveWorkspace(id)}
          onCreate={async (name) => { await createWorkspace(name); notify('工作区已创建'); }}
          onRename={async (id, name) => { await renameWorkspace(id, name); notify('工作区已重命名'); }}
          onDelete={(workspace: Workspace) => {
            const childCollections = collections.filter((entry) => entry.workspaceId === workspace.id);
            const childIds = new Set(childCollections.map((entry) => entry.id));
            const childItems = items.filter((item) => childIds.has(item.collectionId));
            setConfirm({
              title: `删除“${workspace.name}”？`,
              description: `将同时删除 ${childCollections.length} 个集合和 ${childItems.length} 条资料，此操作不可撤销。`,
              confirmLabel: '删除工作区',
              onConfirm: async () => { await deleteWorkspace(workspace.id); setConfirm(undefined); notify('工作区已删除'); },
            });
          }}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleCollapsed={() => void updateAppSetting('leftPanelCollapsed', !(settings?.leftPanelCollapsed || false))}
        />

        <Board
          workspace={activeWorkspace}
          collections={activeCollections}
          items={activeItems}
          openArchiveCollectionIds={openArchiveCollectionIds}
          highlightedItemId={highlightedItemId}
          showIntro={Boolean(settings && !settings.boardIntroDismissed)}
          onDismissIntro={() => void updateAppSetting('boardIntroDismissed', true)
            .catch((reason) => notify(reason instanceof Error ? reason.message : '无法保存提示设置', 'error'))}
          onAddCollection={async (name) => { await createCollection(activeWorkspaceId, name); notify('集合已创建'); }}
          onRenameCollection={async (id, name) => { await renameCollection(id, name); notify('集合已重命名'); }}
          onDeleteCollection={(collection) => {
            const count = items.filter((item) => item.collectionId === collection.id).length;
            setConfirm({
              title: `删除“${collection.name}”？`,
              description: `其中的 ${count} 条书签和记事也会被删除，此操作不可撤销。`,
              confirmLabel: '删除集合',
              onConfirm: async () => { await deleteCollection(collection.id); setConfirm(undefined); notify('集合已删除'); },
            });
          }}
          onToggleCollection={(id, collapsed) => void toggleCollection(id, collapsed)}
          onAddBookmark={(collectionId) => setBookmarkDialog({ collectionId })}
          onAddNote={(collectionId) => void createNote(collectionId)
            .then((note) => {
              setNoteDialog(note);
              notify('记事已添加');
            })
            .catch((reason) => notify(reason instanceof Error ? reason.message : '无法添加记事', 'error'))}
          onEditBookmark={(item) => setBookmarkDialog({ collectionId: item.collectionId, item })}
          onEditBookmarkNote={(item) => setBookmarkDialog({
            collectionId: item.collectionId,
            item,
            focusField: 'note',
          })}
          onEditNote={setNoteDialog}
          onOpenBookmarks={(collection, bookmarks) => void openBookmarks(bookmarks.map((item) => item.url))
            .then((opened) => notify(`已打开“${collection.name}”中的 ${opened} 个链接`))
            .catch((reason) => notify(reason instanceof Error ? reason.message : '无法打开集合链接', 'error'))}
          onArchiveItem={(item) => void requestArchiveItem(item)
            .catch((reason) => notify(reason instanceof Error ? reason.message : '无法归档卡片', 'error'))}
          onRestoreArchivedItem={(item) => void requestRestoreArchivedItem(item)
            .catch((reason) => notify(reason instanceof Error ? reason.message : '无法恢复卡片', 'error'))}
          onArchiveOpenChange={setCollectionArchiveOpen}
          onDeleteItem={(item) => void requestDeleteItem(item)}
          onMoveItem={(itemId, collectionId) => void moveItem(itemId, collectionId)
            .then(() => notify('卡片已移动'))
            .catch((reason) => notify(reason instanceof Error ? reason.message : '无法移动卡片', 'error'))}
        />

        <OpenTabsPanel
          tabs={openTabs}
          collapsed={settings?.rightPanelCollapsed || false}
          onActivate={(id) => void activateTab(id)}
          onToggleCollapsed={() => void updateAppSetting('rightPanelCollapsed', !(settings?.rightPanelCollapsed || false))}
        />
      </div>

      <DragOverlay>{dragLabel ? <div className="drag-overlay"><span>拖动中</span>{dragLabel}</div> : null}</DragOverlay>

      <BookmarkDialog
        open={Boolean(bookmarkDialog && bookmarkDialog.focusField !== 'note')}
        item={bookmarkDialog?.item}
        focusField="url"
        collectionName={collectionMap.get(bookmarkDialog?.collectionId || '')?.name || '集合'}
        onClose={() => setBookmarkDialog(undefined)}
        onSave={saveBookmarkDialog}
      />

      <BookmarkNoteDialog
        open={Boolean(bookmarkDialog?.item && bookmarkDialog.focusField === 'note')}
        item={bookmarkDialog?.item}
        onClose={() => setBookmarkDialog(undefined)}
        onSave={async (note) => {
          if (!bookmarkDialog?.item) return;
          await updateBookmarkNote(bookmarkDialog.item.id, note);
        }}
      />

      <NoteDialog
        open={Boolean(noteDialog)}
        item={noteDialog}
        collectionName={collectionMap.get(noteDialog?.collectionId || '')?.name || '集合'}
        onClose={() => setNoteDialog(undefined)}
        onSave={saveNoteDialog}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        description={confirm?.description || ''}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(undefined)}
        onConfirm={confirm?.onConfirm || (() => undefined)}
      />

      <SettingsPanel
        open={settingsOpen}
        counts={{ workspaces: workspaces.length, collections: collections.length, items: items.length }}
        compactMode={settings?.compactMode ?? false}
        onClose={() => setSettingsOpen(false)}
        onNotify={notify}
        onCompactModeChange={async (compactMode) => {
          await updateAppSetting('compactMode', compactMode);
          notify(compactMode ? '已切换为紧凑模式' : '已切换为标准模式');
        }}
        onRequestClear={() => setConfirm({
          title: '清空全部本地数据？',
          description: '所有工作区、集合、书签、记事和设置都会被删除。请先导出 JSON 备份。',
          confirmLabel: '清空数据',
          onConfirm: async () => { await clearAllData(); setConfirm(undefined); setSettingsOpen(false); notify('本地数据已清空'); },
        })}
      />

      <SearchPalette
        open={searchOpen}
        query={searchQuery}
        category={searchCategory}
        results={searchResults}
        onQueryChange={setSearchQuery}
        onCategoryChange={setSearchCategory}
        onSelect={(result) => void locateResult(result)}
        onClose={() => setSearchOpen(false)}
      />

      {toast && (
        <div className={`toast toast--${toast.tone}`} role="status">
          {toast.tone === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{toast.message}</span>
          {toast.action && (
            <button onClick={toast.action.run}><RotateCcw size={14} />{toast.action.label}</button>
          )}
        </div>
      )}
    </DndContext>
  );
}

export default App;
