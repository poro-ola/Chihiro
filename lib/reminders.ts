import type {
  Reminder,
  ReminderCalendar,
  ReminderKind,
  ReminderRepeat,
} from './types';

export const REMINDER_TITLE_MAX_LENGTH = 80;
export const REMINDER_ADVANCE_DAYS_MAX = 90;

export interface ReminderInput {
  title: string;
  kind: ReminderKind;
  repeat: ReminderRepeat;
  calendar: ReminderCalendar;
  date?: string;
  lunarMonth?: number;
  lunarDay?: number;
  lunarLeapMonth?: boolean;
  advanceDays: number;
}

export interface ReminderSchedule {
  dueDate: string;
  remindFrom: string;
  daysUntil: number;
  isDue: boolean;
  isAlerting: boolean;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const lunarDateCache = new Map<string, string | undefined>();
const lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  month: 'long',
  day: 'numeric',
});

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

export function addDays(value: string, amount: number) {
  const date = parseDateKey(value);
  if (!date) throw new Error('提醒日期无效');
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function daysBetween(from: string, to: string) {
  const left = parseDateKey(from);
  const right = parseDateKey(to);
  if (!left || !right) throw new Error('提醒日期无效');
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}

function lunarMonthNumber(value: string) {
  const clean = value.replace(/^闰/, '');
  const names: Record<string, number> = {
    正月: 1,
    一月: 1,
    二月: 2,
    三月: 3,
    四月: 4,
    五月: 5,
    六月: 6,
    七月: 7,
    八月: 8,
    九月: 9,
    十月: 10,
    十一月: 11,
    冬月: 11,
    十二月: 12,
    腊月: 12,
  };
  return names[clean];
}

function lunarParts(date: Date) {
  const parts = lunarFormatter.formatToParts(date);
  const monthText = parts.find((part) => part.type === 'month')?.value || '';
  const dayText = parts.find((part) => part.type === 'day')?.value || '';
  return {
    month: lunarMonthNumber(monthText),
    day: Number(dayText),
    leap: monthText.startsWith('闰'),
  };
}

export function findLunarDateInGregorianYear(
  year: number,
  month: number,
  day: number,
  leap = false,
) {
  const cacheKey = `${year}:${month}:${day}:${Number(leap)}`;
  if (lunarDateCache.has(cacheKey)) return lunarDateCache.get(cacheKey);

  const cursor = new Date(year, 0, 1, 12);
  while (cursor.getFullYear() === year) {
    const lunar = lunarParts(cursor);
    if (lunar.month === month && lunar.day === day && lunar.leap === leap) {
      const result = dateKey(cursor);
      lunarDateCache.set(cacheKey, result);
      return result;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  lunarDateCache.set(cacheKey, undefined);
  return undefined;
}

function solarDateForYear(sourceDate: string, year: number) {
  const source = parseDateKey(sourceDate);
  if (!source) return undefined;
  const month = source.getMonth();
  const requestedDay = source.getDate();
  const lastDay = new Date(year, month + 1, 0, 12).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(requestedDay, lastDay))}`;
}

function nextYearlyOccurrence(reminder: Reminder, lowerBound: string) {
  const startYear = Number(lowerBound.slice(0, 4));
  const searchYears = reminder.calendar === 'lunar' && reminder.lunarLeapMonth ? 60 : 3;
  for (let year = startYear; year <= startYear + searchYears; year += 1) {
    const candidate = reminder.calendar === 'lunar'
      ? findLunarDateInGregorianYear(
        year,
        reminder.lunarMonth || 0,
        reminder.lunarDay || 0,
        reminder.lunarLeapMonth || false,
      )
      : reminder.date && solarDateForYear(reminder.date, year);
    if (candidate && candidate >= lowerBound) return candidate;
  }
  return undefined;
}

export function resolveReminder(reminder: Reminder, today = dateKey()): ReminderSchedule | undefined {
  if (reminder.repeat === 'once' && reminder.completedAt) return undefined;

  const createdDate = reminder.createdAt.slice(0, 10);
  const lowerBound = reminder.repeat === 'yearly'
    ? (reminder.completedOccurrence ? addDays(reminder.completedOccurrence, 1) : createdDate)
    : createdDate;
  const dueDate = reminder.repeat === 'yearly'
    ? nextYearlyOccurrence(reminder, lowerBound)
    : reminder.date;
  if (!dueDate || !parseDateKey(dueDate)) return undefined;

  const remindFrom = addDays(dueDate, -reminder.advanceDays);
  const daysUntil = daysBetween(today, dueDate);
  return {
    dueDate,
    remindFrom,
    daysUntil,
    isDue: daysUntil <= 0,
    isAlerting: today >= remindFrom,
  };
}

export function prepareReminderInput(input: ReminderInput): ReminderInput {
  const title = input.title.trim();
  if (!title) throw new Error('请输入提醒内容');
  if (title.length > REMINDER_TITLE_MAX_LENGTH) {
    throw new Error(`提醒内容最多 ${REMINDER_TITLE_MAX_LENGTH} 字`);
  }
  if (!Number.isInteger(input.advanceDays) || input.advanceDays < 0 || input.advanceDays > REMINDER_ADVANCE_DAYS_MAX) {
    throw new Error(`提前天数需在 0–${REMINDER_ADVANCE_DAYS_MAX} 之间`);
  }

  if (input.repeat === 'once') {
    if (!input.date || !parseDateKey(input.date)) throw new Error('请选择有效日期');
    return {
      ...input,
      title,
      calendar: 'solar',
      lunarMonth: undefined,
      lunarDay: undefined,
      lunarLeapMonth: undefined,
    };
  }

  if (input.calendar === 'solar') {
    if (!input.date || !parseDateKey(input.date)) throw new Error('请选择有效阳历日期');
    return {
      ...input,
      title,
      lunarMonth: undefined,
      lunarDay: undefined,
      lunarLeapMonth: undefined,
    };
  }

  if (!Number.isInteger(input.lunarMonth) || (input.lunarMonth ?? 0) < 1 || (input.lunarMonth ?? 0) > 12) {
    throw new Error('请选择有效农历月份');
  }
  if (!Number.isInteger(input.lunarDay) || (input.lunarDay ?? 0) < 1 || (input.lunarDay ?? 0) > 30) {
    throw new Error('请选择有效农历日期');
  }
  return {
    ...input,
    title,
    date: undefined,
    lunarLeapMonth: Boolean(input.lunarLeapMonth),
  };
}
