import { useState } from 'react';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Folder,
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
            <span>Qianxun</span>
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
          {workspaces.map((workspace) => (
            <div
              className={`workspace-row ${workspace.id === activeWorkspaceId ? 'is-active' : ''}`}
              key={workspace.id}
            >
              {editingId === workspace.id && !collapsed ? (
                <form
                  className="workspace-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onRename(workspace.id, editingName)
                      .then(() => {
                        setEditingId(undefined);
                        setError('');
                      })
                      .catch((reason) => setError(reason instanceof Error ? reason.message : '重命名失败'));
                  }}
                >
                  <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus maxLength={40} />
                </form>
              ) : (
                <button
                  className="workspace-row__main"
                  onClick={() => onSelect(workspace.id)}
                  onDoubleClick={() => {
                    setEditingId(workspace.id);
                    setEditingName(workspace.name);
                  }}
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
                    onClick={() => {
                      setEditingId(workspace.id);
                      setEditingName(workspace.name);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  {workspaces.length > 1 && (
                    <button
                      className="workspace-row__action"
                      aria-label={`删除${workspace.name}`}
                      onClick={() => onDelete(workspace)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
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
