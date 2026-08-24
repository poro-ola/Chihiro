import { describe, expect, test } from 'bun:test';
import {
  findLunarDateInGregorianYear,
  prepareReminderInput,
  resolveReminder,
} from '../lib/reminders';

function reminder(overrides = {}) {
  return {
    id: 'reminder-1',
    title: '产品上线',
    kind: 'event',
    repeat: 'once',
    calendar: 'solar',
    date: '2026-09-20',
    advanceDays: 3,
    createdAt: '2026-08-24T08:00:00.000Z',
    updatedAt: '2026-08-24T08:00:00.000Z',
    ...overrides,
  };
}

describe('reminder schedules', () => {
  test('starts a one-time reminder at the configured advance window and keeps overdue work visible', () => {
    expect(resolveReminder(reminder(), '2026-09-16')?.isAlerting).toBe(false);
    expect(resolveReminder(reminder(), '2026-09-17')).toMatchObject({
      dueDate: '2026-09-20',
      remindFrom: '2026-09-17',
      daysUntil: 3,
      isAlerting: true,
      isDue: false,
    });
    expect(resolveReminder(reminder(), '2026-09-23')).toMatchObject({
      daysUntil: -3,
      isAlerting: true,
      isDue: true,
    });
  });

  test('removes a completed one-time reminder', () => {
    expect(resolveReminder(reminder({ completedAt: '2026-09-20T08:00:00.000Z' }), '2026-09-20')).toBeUndefined();
  });

  test('moves a completed yearly reminder to its next occurrence', () => {
    const birthday = reminder({
      kind: 'anniversary',
      repeat: 'yearly',
      date: '1990-09-20',
      completedOccurrence: '2026-09-20',
    });
    expect(resolveReminder(birthday, '2026-09-21')).toMatchObject({
      dueDate: '2027-09-20',
      isAlerting: false,
    });
  });

  test('does not immediately flag an annual date that passed before the reminder was created', () => {
    const birthday = reminder({
      kind: 'anniversary',
      repeat: 'yearly',
      date: '1990-02-01',
    });
    expect(resolveReminder(birthday, '2026-08-24')).toMatchObject({
      dueDate: '2027-02-01',
      isAlerting: false,
    });
  });

  test('uses February 28 for a February 29 solar anniversary in non-leap years', () => {
    const birthday = reminder({
      kind: 'anniversary',
      repeat: 'yearly',
      date: '2000-02-29',
      createdAt: '2025-03-01T08:00:00.000Z',
    });
    expect(resolveReminder(birthday, '2026-02-20')?.dueDate).toBe('2026-02-28');
  });

  test('converts a lunar birthday to its Gregorian occurrence', () => {
    expect(findLunarDateInGregorianYear(2026, 1, 1)).toBe('2026-02-17');
    const lunarBirthday = reminder({
      kind: 'anniversary',
      repeat: 'yearly',
      calendar: 'lunar',
      date: undefined,
      lunarMonth: 1,
      lunarDay: 1,
      advanceDays: 7,
      createdAt: '2026-02-01T08:00:00.000Z',
    });
    expect(resolveReminder(lunarBirthday, '2026-02-10')).toMatchObject({
      dueDate: '2026-02-17',
      remindFrom: '2026-02-10',
      isAlerting: true,
    });
  });

  test('rejects invalid dates and advance windows', () => {
    expect(() => prepareReminderInput({
      title: '无效日期',
      kind: 'todo',
      repeat: 'once',
      calendar: 'solar',
      date: '2026-02-30',
      advanceDays: 0,
    })).toThrow('请选择有效日期');
    expect(() => prepareReminderInput({
      title: '太早',
      kind: 'todo',
      repeat: 'once',
      calendar: 'solar',
      date: '2026-09-20',
      advanceDays: 91,
    })).toThrow('提前天数需在 0–90 之间');
  });
});
