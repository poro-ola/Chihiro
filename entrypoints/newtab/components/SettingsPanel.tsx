import { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  Database,
  Download,
  HardDrive,
  KeyRound,
  LayoutList,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import { downloadBackup, restoreBackup } from '../../../lib/backup';
import {
  CLOUD_SYNC_MESSAGE,
  type CloudSyncRequest,
  type CloudSyncResponse,
  type CloudSyncStatus,
} from '../../../lib/cloud-sync-messages';

interface SettingsPanelProps {
  open: boolean;
  counts: { workspaces: number; collections: number; items: number };
  compactMode: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
  onCompactModeChange: (compactMode: boolean) => Promise<void>;
  onRequestClear: () => void;
}

const DEFAULT_CLOUD_ENDPOINT = 'https://chihiro-sync.tan-jie.workers.dev';

async function sendCloudSyncMessage(message: CloudSyncRequest) {
  const response = await browser.runtime.sendMessage(message) as CloudSyncResponse | undefined;
  if (!response) throw new Error('云同步后台没有响应');
  if (!response.ok) throw new Error(response.error);
  return response.status;
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
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>();
  const [cloudEndpoint, setCloudEndpoint] = useState(DEFAULT_CLOUD_ENDPOINT);
  const [cloudToken, setCloudToken] = useState('');
  const [cloudPassphrase, setCloudPassphrase] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void sendCloudSyncMessage({ type: CLOUD_SYNC_MESSAGE.getStatus })
      .then((status) => {
        setCloudStatus(status);
        setCloudEndpoint(status.endpoint || DEFAULT_CLOUD_ENDPOINT);
      })
      .catch((reason) => onNotify(reason instanceof Error ? reason.message : '无法读取云同步设置', 'error'));
  }, [open, onNotify]);

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
            <strong>资料优先保存在此浏览器</strong>
            <p>本地由 IndexedDB 管理；启用云同步后只上传加密快照。</p>
          </div>
          <div className="storage-stats">
            <span><b>{counts.workspaces}</b> 空间</span>
            <span><b>{counts.collections}</b> 集合</span>
            <span><b>{counts.items}</b> 条资料</span>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <Cloud size={18} />
            <div>
              <h3>Cloudflare 云同步</h3>
              <p>本地优先、端到端加密；R2 仅保存密文与最近 30 个版本。</p>
            </div>
          </div>

          <div className={`sync-status ${cloudStatus?.enabled ? 'is-active' : ''}`}>
            <span className="sync-status__dot" aria-hidden="true" />
            <div>
              <strong>{cloudStatus?.enabled ? '云同步已启用' : '云同步未启用'}</strong>
              <span>
                {cloudStatus?.lastSyncedAt
                  ? `上次同步：${new Date(cloudStatus.lastSyncedAt).toLocaleString()}`
                  : '配置后会在变更时自动同步，并每分钟检查云端更新。'}
              </span>
            </div>
          </div>

          <div className="sync-form">
            <label>
              <span>Worker 地址</span>
              <input
                type="url"
                value={cloudEndpoint}
                placeholder="https://chihiro-sync.<账号>.workers.dev"
                spellCheck={false}
                onChange={(event) => setCloudEndpoint(event.target.value)}
              />
            </label>
            <label>
              <span>同步 Token</span>
              <div className="sync-secret-field">
                <KeyRound size={14} />
                <input
                  type="password"
                  value={cloudToken}
                  placeholder={cloudStatus?.configured ? '已保存；留空不修改' : '至少 24 个字符'}
                  autoComplete="new-password"
                  onChange={(event) => setCloudToken(event.target.value)}
                />
              </div>
            </label>
            <label>
              <span>客户端加密口令</span>
              <div className="sync-secret-field">
                <ShieldCheck size={14} />
                <input
                  type="password"
                  value={cloudPassphrase}
                  placeholder={cloudStatus?.configured ? '已保存；留空不修改' : '至少 16 个字符，请在设备间安全保存'}
                  autoComplete="new-password"
                  onChange={(event) => setCloudPassphrase(event.target.value)}
                />
              </div>
            </label>
          </div>

          {cloudStatus?.lastError && <p className="sync-error">{cloudStatus.lastError}</p>}

          <div className="sync-actions">
            <button
              type="button"
              className="primary-button"
              disabled={cloudBusy || !cloudEndpoint.trim()}
              onClick={() => {
                setCloudBusy(true);
                void sendCloudSyncMessage({
                  type: CLOUD_SYNC_MESSAGE.configure,
                  endpoint: cloudEndpoint,
                  accessToken: cloudToken || undefined,
                  encryptionPassphrase: cloudPassphrase || undefined,
                })
                  .then((status) => {
                    setCloudStatus(status);
                    setCloudToken('');
                    setCloudPassphrase('');
                    onNotify('云同步已连接并完成首次同步');
                  })
                  .catch((reason) => onNotify(reason instanceof Error ? reason.message : '云同步配置失败', 'error'))
                  .finally(() => setCloudBusy(false));
              }}
            >
              <Cloud size={16} />{cloudBusy ? '连接中…' : '保存并立即同步'}
            </button>
            {cloudStatus?.enabled && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={cloudBusy}
                  onClick={() => {
                    setCloudBusy(true);
                    void sendCloudSyncMessage({ type: CLOUD_SYNC_MESSAGE.syncNow })
                      .then((status) => {
                        setCloudStatus(status);
                        onNotify('已与云端同步');
                      })
                      .catch((reason) => onNotify(reason instanceof Error ? reason.message : '同步失败', 'error'))
                      .finally(() => setCloudBusy(false));
                  }}
                >
                  <RefreshCw size={15} />立即同步
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={cloudBusy}
                  onClick={() => {
                    setCloudBusy(true);
                    void sendCloudSyncMessage({ type: CLOUD_SYNC_MESSAGE.disable })
                      .then((status) => {
                        setCloudStatus(status);
                        onNotify('已停用云同步，本地数据不受影响');
                      })
                      .catch((reason) => onNotify(reason instanceof Error ? reason.message : '无法停用云同步', 'error'))
                      .finally(() => setCloudBusy(false));
                  }}
                >
                  <WifiOff size={14} />停用
                </button>
              </>
            )}
          </div>
          <p className="sync-hint">Token 用于访问控制；加密口令只保存在本机，遗失后云端密文无法恢复。</p>
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
