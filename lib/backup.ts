import { exportDB, importInto } from 'dexie-export-import';
import { APP_VERSION, SCHEMA_VERSION, db, ensureSeedData } from './db';
import type { ChihiroBackup } from './types';

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function backupFileName(date: Date) {
  return [
    'chihiro-backup-',
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '.json',
  ].join('');
}

export async function createBackup() {
  const databaseBlob = await exportDB(db, { prettyJson: false });
  const database = JSON.parse(await databaseBlob.text()) as unknown;
  const counts = Object.fromEntries(
    await Promise.all(db.tables.map(async (table) => [table.name, await table.count()] as const)),
  );
  const exportedAt = new Date();
  const backup: ChihiroBackup = {
    format: 'chihiro-backup',
    formatVersion: 1,
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    counts,
    database,
  };

  return {
    fileName: backupFileName(exportedAt),
    blob: new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }),
  };
}

export async function downloadBackup() {
  const { fileName, blob } = await createBackup();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function assertBackup(value: unknown): asserts value is ChihiroBackup {
  if (!value || typeof value !== 'object') throw new Error('备份文件内容无效');
  const candidate = value as Partial<ChihiroBackup>;
  const supportedFormat = candidate.format === 'chihiro-backup' || candidate.format === 'qianxun-backup';
  if (!supportedFormat || candidate.formatVersion !== 1) {
    throw new Error('不是受支持的千寻备份文件');
  }
  if (!candidate.database || typeof candidate.database !== 'object') {
    throw new Error('备份缺少数据库内容');
  }
  if (!candidate.counts || typeof candidate.counts !== 'object') {
    throw new Error('备份缺少记录统计');
  }
  if (!candidate.exportedAt || Number.isNaN(Date.parse(candidate.exportedAt))) {
    throw new Error('备份导出时间无效');
  }
}

export async function restoreBackup(file: File, mode: 'merge' | 'replace') {
  if (!file.name.toLowerCase().endsWith('.json')) throw new Error('请选择 JSON 备份文件');
  let backup: unknown;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('JSON 文件无法解析');
  }
  assertBackup(backup);

  const databaseBlob = new Blob([JSON.stringify(backup.database)], {
    type: 'application/json;charset=utf-8',
  });

  await importInto(db, databaseBlob, {
    acceptNameDiff: false,
    acceptVersionDiff: false,
    acceptMissingTables: false,
    overwriteValues: true,
    clearTablesBeforeImport: mode === 'replace',
  });
  await ensureSeedData();
  return backup;
}
