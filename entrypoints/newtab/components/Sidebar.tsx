import { useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Folder,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import type { Workspace } from '../../../lib/types';

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (workspace: Workspace) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
}

interface WorkspaceRowProps {
  workspace: Workspace;
  active: boolean;
  collapsed: boolean;
  editing: boolean;
  editingName: string;
  canDelete: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onEditingNameChange: (name: string) => void;
  onCommitRename: () => void;
  onDelete: () => void;
}

function SortableWorkspaceRow({
  workspace,
  active,
  collapsed,
  editing,
  editingName,
  canDelete,
  onSelect,
  onStartRename,
  onEditingNameChange,
  onCommitRename,
  onDelete,
}: WorkspaceRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `workspace:${workspace.id}`,
    data: { type: 'workspace', workspace },
    disabled: editing,
  });

  return (
    <div
      ref={setNodeRef}
      className={`workspace-row ${active ? 'is-active' : ''} ${editing ? 'is-editing' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      title={collapsed ? `拖动调整顺序 · ${workspace.name}` : '按住卡片任意位置拖动调整顺序'}
      onPointerDown={(event) => listeners?.onPointerDown?.(event)}
    >
      <button
        ref={setActivatorNodeRef}
        className="workspace-drag-handle"
        aria-label={`拖动${workspace.name}`}
        disabled={editing}
        onKeyDown={(event) => listeners?.onKeyDown?.(event)}
        {...attributes}
      >
        <GripVertical size={14} />
      </button>
      {editing && !collapsed ? (
        <form
          className="workspace-rename"
          onSubmit={(event) => {
            event.preventDefault();
            onCommitRename();
          }}
        >
          <input
            value={editingName}
            onChange={(event) => onEditingNameChange(event.target.value)}
            autoFocus
            maxLength={40}
          />
        </form>
      ) : (
        <button
          className="workspace-row__main"
          onClick={onSelect}
          onDoubleClick={onStartRename}
          title={workspace.name}
        >
          <Folder size={17} />
          {!collapsed && <span>{workspace.name}</span>}
        </button>
      )}
      {!collapsed && (
        <div className="workspace-row__actions">
          <button
            className="workspace-row__action"
            aria-label={`重命名${workspace.name}`}
            onClick={onStartRename}
          >
            <Pencil size={13} />
          </button>
          {canDelete && (
            <button
              className="workspace-row__action"
              aria-label={`删除${workspace.name}`}
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  collapsed,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onOpenSearch,
  onOpenSettings,
  onToggleCollapsed,
}: SidebarProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState('');

  const submit = async () => {
    try {
      await onCreate(name);
      setName('');
      setAdding(false);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败');
    }
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} aria-label="工作区导航">
      <div className="brand-row">
        <button className="brand-mark" aria-label="千寻首页" onClick={() => onSelect(activeWorkspaceId)}>
          千
        </button>
        {!collapsed && (
          <div className="brand-copy">
            <strong>千寻</strong>
            <span>Chihiro</span>
          </div>
        )}
        <button className="icon-button sidebar-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}>
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      <button className="search-trigger" onClick={onOpenSearch} title="搜索（⌘/Ctrl K）">
        <Search size={18} />
        {!collapsed && (
          <>
            <span>搜索所有资料</span>
            <kbd>⌘ K</kbd>
          </>
        )}
      </button>

      <div className="sidebar-section">
        {!collapsed && (
          <div className="sidebar-section__heading">
            <span>工作区</span>
            <button className="icon-button" onClick={() => setAdding(true)} aria-label="新建工作区">
              <Plus size={17} />
            </button>
          </div>
        )}

        <nav className="workspace-list">
          <SortableContext
            items={workspaces.map((workspace) => `workspace:${workspace.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {workspaces.map((workspace) => {
              const startRename = () => {
                setEditingId(workspace.id);
                setEditingName(workspace.name);
              };
              return (
                <SortableWorkspaceRow
                  key={workspace.id}
                  workspace={workspace}
                  active={workspace.id === activeWorkspaceId}
                  collapsed={collapsed}
                  editing={editingId === workspace.id}
                  editingName={editingName}
                  canDelete={workspaces.length > 1}
                  onSelect={() => onSelect(workspace.id)}
                  onStartRename={startRename}
                  onEditingNameChange={setEditingName}
                  onCommitRename={() => {
                    void onRename(workspace.id, editingName)
                      .then(() => {
                        setEditingId(undefined);
                        setError('');
                      })
                      .catch((reason) => setError(reason instanceof Error ? reason.message : '重命名失败'));
                  }}
                  onDelete={() => onDelete(workspace)}
                />
              );
            })}
          </SortableContext>
        </nav>

        {collapsed && (
          <button className="collapsed-add" onClick={() => setAdding(true)} aria-label="新建工作区">
            <Plus size={18} />
          </button>
        )}

        {adding && (
          <form
            className={`inline-create ${collapsed ? 'inline-create--floating' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="workspace-name">新工作区</label>
            <input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：工作"
              maxLength={40}
              autoFocus
            />
            {error && <p className="field-error">{error}</p>}
            <div className="inline-create__actions">
              <button type="button" className="text-button" onClick={() => setAdding(false)}>
                取消
              </button>
              <button type="submit" className="small-primary">创建</button>
            </div>
          </form>
        )}
      </div>

      <div className="sidebar-spacer" />
      {!collapsed && (
        <div className="local-badge">
          <Archive size={16} />
          <div>
            <strong>仅存于本机</strong>
            <span>IndexedDB · 可随时备份</span>
          </div>
        </div>
      )}
      <button className="sidebar-settings" onClick={onOpenSettings}>
        <Settings size={18} />
        {!collapsed && <span>设置与备份</span>}
      </button>
    </aside>
  );
}
