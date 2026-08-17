import { useRef, useState } from 'react';
import { Database, Download, HardDrive, LayoutList, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { downloadBackup, restoreBackup } from '../../../lib/backup';

interface SettingsPanelProps {
  open: boolean;
  counts: { workspaces: number; collections: number; items: number };
  compactMode: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
  onCompactModeChange: (compactMode: boolean) => Promise<void>;
  onRequestClear: () => void;
}

export function SettingsPanel({
  open,
  counts,
  compactMode,
  onClose,
  onNotify,
  onCompactModeChange,
  onRequestClear,
}: SettingsPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File>();

  if (!open) return null;

  const importFile = async (file: File, selectedMode: 'merge' | 'replace') => {
    setBusy(true);
    try {
      await restoreBackup(file, selectedMode);
      onNotify(selectedMode === 'replace' ? '备份已完整恢复' : '备份已合并到当前资料');
      setPendingFile(undefined);
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : '导入失败', 'error');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div>
            <span className="eyebrow">LOCAL FIRST</span>
            <h2 id="settings-title">设置与备份</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        </header>

        <section className="storage-summary">
          <div className="storage-summary__icon"><HardDrive size={23} /></div>
          <div>
            <strong>资料仅保存在此浏览器</strong>
            <p>IndexedDB 由 Dexie 管理，不上传书签或记事。</p>
          </div>
          <div className="storage-stats">
            <span><b>{counts.workspaces}</b> 空间</span>
            <span><b>{counts.collections}</b> 集合</span>
            <span><b>{counts.items}</b> 条资料</span>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <LayoutList size={18} />
            <div><h3>卡片布局</h3><p>调整集合内书签与记事的显示密度。</p></div>
          </div>
          <button
            type="button"
            className="settings-toggle"
            role="switch"
            aria-checked={compactMode}
            disabled={layoutBusy}
            onClick={() => {
              setLayoutBusy(true);
              void onCompactModeChange(!compactMode)
                .catch((reason) => onNotify(reason instanceof Error ? reason.message : '无法保存布局设置', 'error'))
                .finally(() => setLayoutBusy(false));
            }}
          >
            <span className="settings-toggle__copy">
              <strong>紧凑模式</strong>
              <span>卡片仅显示图标与标题，在同一屏容纳更多资料。</span>
            </span>
            <span className="settings-switch" aria-hidden="true"><span /></span>
          </button>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <Database size={18} />
            <div><h3>JSON 备份</h3><p>导出包含全部数据、顺序和界面状态的完整备份。</p></div>
          </div>
          <button
            className="settings-action"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void downloadBackup()
                .then(() => onNotify('JSON 备份已导出'))
                .catch((reason) => onNotify(reason instanceof Error ? reason.message : '导出失败', 'error'))
                .finally(() => setBusy(false));
            }}
          >
            <Download size={18} />
            <span><strong>导出备份</strong><em>下载 chihiro-backup-*.json</em></span>
          </button>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <Upload size={18} />
            <div><h3>恢复备份</h3><p>导入前会校验格式，失败不会更改现有资料。</p></div>
          </div>
          <div className="restore-mode" role="group" aria-label="导入方式">
            <button className={mode === 'merge' ? 'is-active' : ''} onClick={() => setMode('merge')}>
              <strong>合并</strong><span>保留当前资料</span>
            </button>
            <button className={mode === 'replace' ? 'is-active' : ''} onClick={() => setMode('replace')}>
              <strong>覆盖</strong><span>恢复到备份状态</span>
            </button>
          </div>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (mode === 'replace') setPendingFile(file);
              else void importFile(file, mode);
            }}
          />
          <button className="settings-action" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload size={18} />
            <span><strong>{busy ? '处理中…' : '选择 JSON 文件'}</strong><em>当前模式：{mode === 'merge' ? '合并' : '覆盖'}</em></span>
          </button>

          {pendingFile && (
            <div className="inline-warning">
              <ShieldCheck size={18} />
              <div><strong>确认覆盖当前数据？</strong><p>将先校验 {pendingFile.name}，再以单次事务完整恢复。</p></div>
              <button className="text-button" onClick={() => setPendingFile(undefined)}>取消</button>
              <button className="danger-button" onClick={() => void importFile(pendingFile, 'replace')}>确认覆盖</button>
            </div>
          )}
        </section>

        <section className="settings-section settings-section--danger">
          <div className="settings-section__heading">
            <Trash2 size={18} />
            <div><h3>清空本地数据</h3><p>删除所有工作区、集合、书签、记事和设置。</p></div>
          </div>
          <button className="danger-outline-button" onClick={onRequestClear}>清空全部数据</button>
        </section>
      </aside>
    </div>
  );
}
