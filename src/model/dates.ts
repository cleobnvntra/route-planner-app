import { DAYS, type Day } from './types.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Parses "YYYY-MM-DD" as a UTC calendar date. The UTC round trip rejects dates
 * like 2026-02-30, and using UTC keeps the weekday independent of the phone's
 * time zone.
 */
export function parseIsoDate(date: string): Date {
  const match = typeof date === 'string' ? DATE_RE.exec(date) : null;
  if (!match) throw new Error(`Invalid date "${String(date)}", expected YYYY-MM-DD`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    throw new Error(`Invalid date "${date}", no such calendar day`);
  }
  return parsed;
}

export function isValidIsoDate(date: string): boolean {
  try {
    parseIsoDate(date);
    return true;
  } catch {
    return false;
  }
}

export function dayOf(date: string): Day {
  const day = DAYS[parseIsoDate(date).getUTCDay()];
  if (!day) throw new Error(`Could not get weekday of "${date}"`);
  return day;
}

/** Minutes since midnight. Accepts 00:00 to 24:00. */
export function parseTime(time: string): number {
  const match = typeof time === 'string' ? TIME_RE.exec(time) : null;
  if (!match) throw new Error(`Invalid time "${String(time)}", expected HH:MM`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (Number(match[2]) > 59 || minutes > 24 * 60) {
    throw new Error(`Invalid time "${time}", must be between 00:00 and 24:00`);
  }
  return minutes;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

/** Today's calendar date on this device, as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
