/**
 * Helpers for splitting and composing due date/time fields in the unified overlay.
 */

import { getDateService } from '../../lib/date/DateService';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WITH_TIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const ISO_ZERO_Z_RE = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d+)?Z$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const toIsoLocal = (date: Date) => {
  const datePart = getDateService().toLocalDate(date);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
  const offsetMinutes = pad(Math.abs(offset) % 60);
  return `${datePart}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
};

export const normalizeTimeInput = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = TIME_RE.exec(trimmed);
  if (!match) return null;
  const [, hourRaw, minuteRaw] = match;
  const hour = pad(Number(hourRaw));
  const minute = pad(Number(minuteRaw));
  return `${hour}:${minute}`;
};

export const splitDueParts = (
  raw?: string | null,
  storedTime?: string | null,
): { date: string | null; time: string | null } => {
  const normalizedStoredTime = normalizeTimeInput(storedTime);
  if (!raw) {
    return { date: null, time: normalizedStoredTime };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { date: null, time: normalizedStoredTime };
  }

  if (DATE_ONLY_RE.test(trimmed)) {
    return { date: trimmed, time: normalizedStoredTime };
  }

  const zeroZMatch = ISO_ZERO_Z_RE.exec(trimmed);
  if (zeroZMatch && !normalizedStoredTime) {
    return { date: zeroZMatch[1], time: null };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, time: normalizedStoredTime };
  }

  const date = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  const derivedTime = `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  const hasTimeComponent = ISO_WITH_TIME_RE.test(trimmed);
  return {
    date,
    time: normalizedStoredTime ?? (hasTimeComponent ? derivedTime : null),
  };
};

export const combineDueIso = (
  dateInput?: string | null,
  timeInput?: string | null,
): string | null => {
  const normalizedTime = normalizeTimeInput(timeInput);
  if (!dateInput) {
    return null;
  }

  const trimmedDate = dateInput.trim();
  if (!trimmedDate) {
    return null;
  }

  if (ISO_WITH_TIME_RE.test(trimmedDate)) {
    if (!normalizedTime) {
      return trimmedDate;
    }
    const baseDate = trimmedDate.slice(0, 10);
    return combineDueIso(baseDate, normalizedTime);
  }

  if (!DATE_ONLY_RE.test(trimmedDate)) {
    const parsed = new Date(trimmedDate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    if (normalizedTime) {
      const [hour, minute] = normalizedTime.split(':').map(Number);
      parsed.setHours(hour, minute, 0, 0);
    }
    return toIsoLocal(parsed);
  }

  const [yearStr, monthStr, dayStr] = trimmedDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  const result = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (normalizedTime) {
    const [hour, minute] = normalizedTime.split(':').map(Number);
    result.setHours(hour, minute, 0, 0);
  }
  return toIsoLocal(result);
};
