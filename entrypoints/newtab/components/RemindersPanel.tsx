import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  Gift,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { dateKey, resolveReminder, type ReminderInput } from '../../../lib/reminders';
import type { Reminder, ReminderKind } from '../../../lib/types';

interface RemindersPanelProps {
  open: boolean;
  reminders: Reminder[];
  today: string;
  onClose: () => void;
  onCreate: (input: ReminderInput) => Promise<void>;
  onUpdate: (id: string, input: ReminderInput) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

type FormState = ReminderInput;

const LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const KIND_OPTIONS: { value: ReminderKind; label: string; description: string }[] = [
  { value: 'todo', label: '待办', description: '需要完成的事项' },
  { value: 'event', label: '时间节点', description: '上线、截止或约定' },
  { value: 'anniversary', label: '纪念日', description: '生日与重要日子' },
];

function defaultForm(): FormState {
  return {
    title: '',
    kind: 'todo',
    repeat: 'once',
    calendar: 'solar',
    date: dateKey(),
    lunarMonth: 1,
    lunarDay: 1,
    lunarLeapMonth: false,
    advanceDays: 0,
  };
}

function formFromReminder(reminder: Reminder): FormState {
  return {
    title: reminder.title,
    kind: reminder.kind,
    repeat: reminder.repeat,
    calendar: reminder.calendar,
    date: reminder.date || dateKey(),
    lunarMonth: reminder.lunarMonth || 1,
    lunarDay: reminder.lunarDay || 1,
    lunarLeapMonth: reminder.lunarLeapMonth || false,
    advanceDays: reminder.advanceDays,
  };
}

function kindIcon(kind: ReminderKind) {
  if (kind === 'event') return <Clock3 size={17} />;
  if (kind === 'anniversary') return <Gift size={17} />;
  return <ListTodo size={17} />;
}

function kindLabel(kind: ReminderKind) {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label || '提醒';
}

function formatSolarDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function scheduleLabel(daysUntil: number) {
  if (daysUntil === 0) return '今天';
  if (daysUntil < 0) return `已逾期 ${Math.abs(daysUntil)} 天`;
  return `${daysUntil} 天后`;
}

export function RemindersPanel({
  open,
  reminders,
  today,
  onClose,
  onCreate,
  onUpdate,
  onComplete,
  onDelete,
  onNotify,
}: RemindersPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string>();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setShowForm(reminders.filter((reminder) => !(reminder.repeat === 'once' && reminder.completedAt)).length === 0);
      setEditingId(undefined);
      setDeletingId(undefined);
      setError('');
    }
    wasOpen.current = open;
  }, [open, reminders]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const scheduled = useMemo(() => reminders
    .map((reminder) => ({ reminder, schedule: resolveReminder(reminder, today) }))
    .filter((entry): entry is { reminder: Reminder; schedule: NonNullable<typeof entry.schedule> } => Boolean(entry.schedule))
    .sort((left, right) => left.schedule.dueDate.localeCompare(right.schedule.dueDate)), [reminders, today]);
  const alerting = scheduled.filter((entry) => entry.schedule.isAlerting);
  const upcoming = scheduled.filter((entry) => !entry.schedule.isAlerting);

  if (!open) return null;

  const beginCreate = () => {
    setEditingId(undefined);
    setForm(defaultForm());
    setError('');
    setShowForm(true);
  };

  const beginEdit = (reminder: Reminder) => {
    setEditingId(reminder.id);
    setDeletingId(undefined);
    setForm(formFromReminder(reminder));
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(undefined);
    setError('');
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await onUpdate(editingId, form);
        onNotify('提醒已更新');
      } else {
        await onCreate(form);
        onNotify('提醒已添加');
      }
      closeForm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法保存提醒');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = ({ reminder, schedule }: typeof scheduled[number]) => (
    <article className={`reminder-row ${schedule.isAlerting ? 'is-alerting' : ''}`} key={reminder.id}>
      <div className="reminder-row__icon">{kindIcon(reminder.kind)}</div>
      <div className="reminder-row__copy">
        <strong>{reminder.title}</strong>
        <span>
          {kindLabel(reminder.kind)} · {formatSolarDate(schedule.dueDate)} · {scheduleLabel(schedule.daysUntil)}
        </span>
        <em>
          {reminder.repeat === 'yearly'
            ? `每年 · ${reminder.calendar === 'lunar' ? `${reminder.lunarLeapMonth ? '闰' : ''}${LUNAR_MONTHS[(reminder.lunarMonth || 1) - 1]}${LUNAR_DAYS[(reminder.lunarDay || 1) - 1]}` : '阳历'}`
            : '一次性'}
          {reminder.advanceDays > 0 ? ` · 提前 ${reminder.advanceDays} 天` : ' · 当天提醒'}
        </em>
      </div>
      <div className="reminder-row__actions">
        {schedule.isAlerting && (
          <button
            className="reminder-complete"
            onClick={() => void onComplete(reminder.id)
              .then(() => onNotify(reminder.repeat === 'yearly' ? '本次提醒已完成，明年再见' : '提醒已完成'))
              .catch((reason) => onNotify(reason instanceof Error ? reason.message : '无法完成提醒', 'error'))}
          >
            <Check size={14} />完成
          </button>
        )}
        <button className="reminder-icon-action" onClick={() => beginEdit(reminder)} aria-label={`编辑${reminder.title}`}>
          <Pencil size={14} />
        </button>
        {deletingId === reminder.id ? (
          <div className="reminder-delete-confirm">
            <button onClick={() => setDeletingId(undefined)}>取消</button>
            <button
              className="is-danger"
              onClick={() => void onDelete(reminder.id)
                .then(() => {
                  setDeletingId(undefined);
                  onNotify('提醒已删除');
                })
                .catch((reason) => onNotify(reason instanceof Error ? reason.message : '无法删除提醒', 'error'))}
            >确认</button>
          </div>
        ) : (
          <button className="reminder-icon-action" onClick={() => setDeletingId(reminder.id)} aria-label={`删除${reminder.title}`}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div className="reminders-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="reminders-panel" role="dialog" aria-modal="true" aria-labelledby="reminders-title">
        <header className="reminders-panel__header">
          <div>
            <span className="eyebrow">TIMEKEEPER</span>
            <h2 id="reminders-title">提醒</h2>
            <p>{alerting.length > 0 ? `${alerting.length} 件事正在等你处理` : '把重要日期交给千寻记住'}</p>
          </div>
          <div className="reminders-panel__header-actions">
            <button className="secondary-button" onClick={beginCreate}><Plus size={15} />新增</button>
            <button className="icon-button" onClick={onClose} aria-label="关闭提醒"><X size={19} /></button>
          </div>
        </header>

        {showForm && (
          <form
            className="reminder-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="reminder-form__heading">
              <div><span>{editingId ? '编辑提醒' : '新提醒'}</span><strong>{editingId ? '调整日期与规则' : '先记下要紧的事'}</strong></div>
              <button type="button" className="icon-button" onClick={closeForm} aria-label="收起表单"><X size={16} /></button>
            </div>

            <label className="reminder-field reminder-field--title">
              <span>提醒内容</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：产品 9 月 20 日上线"
                maxLength={80}
                autoFocus
              />
            </label>

            <fieldset className="reminder-field">
              <legend>类型</legend>
              <div className="reminder-kind-options">
                {KIND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={form.kind === option.value ? 'is-active' : ''}
                    onClick={() => setForm((current) => ({
                      ...current,
                      kind: option.value,
                      ...(option.value === 'anniversary' && current.kind !== 'anniversary'
                        ? { repeat: 'yearly', advanceDays: Math.max(current.advanceDays, 7) }
                        : {}),
                    }))}
                  >
                    {kindIcon(option.value)}
                    <span><strong>{option.label}</strong><em>{option.description}</em></span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="reminder-form__grid">
              <fieldset className="reminder-field">
                <legend>重复</legend>
                <div className="reminder-segmented">
                  <button type="button" className={form.repeat === 'once' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, repeat: 'once', calendar: 'solar' }))}>一次</button>
                  <button type="button" className={form.repeat === 'yearly' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, repeat: 'yearly' }))}>每年</button>
                </div>
              </fieldset>

              {form.repeat === 'yearly' && (
                <fieldset className="reminder-field">
                  <legend>历法</legend>
                  <div className="reminder-segmented">
                    <button type="button" className={form.calendar === 'solar' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, calendar: 'solar' }))}>阳历</button>
                    <button type="button" className={form.calendar === 'lunar' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, calendar: 'lunar' }))}>农历</button>
                  </div>
                </fieldset>
              )}
            </div>

            {form.repeat === 'yearly' && form.calendar === 'lunar' ? (
              <div className="reminder-lunar-row">
                <label className="reminder-field">
                  <span>农历月</span>
                  <select value={form.lunarMonth} onChange={(event) => setForm((current) => ({ ...current, lunarMonth: Number(event.target.value) }))}>
                    {LUNAR_MONTHS.map((label, index) => <option value={index + 1} key={label}>{label}</option>)}
                  </select>
                </label>
                <label className="reminder-field">
                  <span>农历日</span>
                  <select value={form.lunarDay} onChange={(event) => setForm((current) => ({ ...current, lunarDay: Number(event.target.value) }))}>
                    {LUNAR_DAYS.map((label, index) => <option value={index + 1} key={label}>{label}</option>)}
                  </select>
                </label>
                <label className="reminder-leap-check">
                  <input type="checkbox" checked={form.lunarLeapMonth} onChange={(event) => setForm((current) => ({ ...current, lunarLeapMonth: event.target.checked }))} />
                  <span>闰月</span>
                </label>
              </div>
            ) : (
              <label className="reminder-field">
                <span>{form.repeat === 'yearly' ? '阳历日期（每年使用月、日）' : '日期'}</span>
                <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
              </label>
            )}

            <label className="reminder-field reminder-advance-field">
              <span>提前提醒</span>
              <div><input type="number" min={0} max={90} value={form.advanceDays} onChange={(event) => setForm((current) => ({ ...current, advanceDays: Number(event.target.value) }))} /><em>天</em></div>
              <small>设为 0 时只在当天开始提醒；逾期后会保留到完成。</small>
            </label>

            {error && <p className="dialog-error">{error}</p>}
            <footer className="reminder-form__actions">
              <button type="button" className="text-button" onClick={closeForm}>取消</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : editingId ? '保存修改' : '添加提醒'}</button>
            </footer>
          </form>
        )}

        <div className="reminders-list">
          {alerting.length > 0 && (
            <section className="reminders-group reminders-group--alerting">
              <header><BellRing size={15} /><strong>需要处理</strong><span>{alerting.length}</span></header>
              <div>{alerting.map(renderRow)}</div>
            </section>
          )}

          <section className="reminders-group">
            <header><CalendarDays size={15} /><strong>接下来</strong><span>{upcoming.length}</span></header>
            {upcoming.length > 0 ? (
              <div>{upcoming.map(renderRow)}</div>
            ) : alerting.length === 0 && !showForm ? (
              <div className="reminders-empty">
                <BellRing size={24} />
                <strong>还没有提醒</strong>
                <p>记录一个截止日期、生日或纪念日，到了时间这里会叫你回来。</p>
                <button className="secondary-button" onClick={beginCreate}><Plus size={15} />添加第一个提醒</button>
              </div>
            ) : (
              <p className="reminders-group__empty">没有更晚的提醒</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
