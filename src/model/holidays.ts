import { parseIsoDate } from './dates.js';

const WEEKDAY = { sun: 0, mon: 1, fri: 5, sat: 6 } as const;

function iso(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/** The nth given weekday of a month, as a day of the month. */
function nthWeekday(year: number, monthIndex: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

/** Western Easter, by the Anonymous Gregorian algorithm. */
function easterSunday(year: number): { monthIndex: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return { monthIndex: Math.floor(n / 31) - 1, day: (n % 31) + 1 };
}

function victoriaDay(year: number): number {
  // The Monday before May 25.
  const may24Weekday = new Date(Date.UTC(year, 4, 24)).getUTCDay();
  return 24 - ((may24Weekday - WEEKDAY.mon + 7) % 7);
}

/** The Monday after a weekend date, or null if the date is a weekday. */
function mondayAfterWeekend(year: number, monthIndex: number, day: number): string | null {
  const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
  if (weekday === WEEKDAY.sat) return iso(year, monthIndex, day + 2);
  if (weekday === WEEKDAY.sun) return iso(year, monthIndex, day + 1);
  return null;
}

/**
 * Holidays the City lists on toronto.ca/holiday-impacts. That is more than
 * Ontario's statutory list: depots also close on Easter Monday and Civic Day.
 * Weekend dates also flag their usual observed weekday, since a false warning
 * costs a phone call and a missed one costs a wasted trip.
 */
function holidaysIn(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const holidays = new Map<string, string>([
    [iso(year, 0, 1), "New Year's Day"],
    [iso(year, 1, nthWeekday(year, 1, WEEKDAY.mon, 3)), 'Family Day'],
    [iso(year, easter.monthIndex, easter.day - 2), 'Good Friday'],
    [iso(year, easter.monthIndex, easter.day + 1), 'Easter Monday'],
    [iso(year, 4, victoriaDay(year)), 'Victoria Day'],
    [iso(year, 6, 1), 'Canada Day'],
    [iso(year, 7, nthWeekday(year, 7, WEEKDAY.mon, 1)), 'Civic Day'],
    [iso(year, 8, nthWeekday(year, 8, WEEKDAY.mon, 1)), 'Labour Day'],
    [iso(year, 8, 30), 'National Day for Truth and Reconciliation'],
    [iso(year, 9, nthWeekday(year, 9, WEEKDAY.mon, 2)), 'Thanksgiving'],
    [iso(year, 10, 11), 'Remembrance Day'],
    [iso(year, 11, 25), 'Christmas Day'],
    [iso(year, 11, 26), 'Boxing Day'],
  ]);

  const addObserved = (date: string | null, name: string) => {
    if (date && !holidays.has(date)) holidays.set(date, `${name} (observed)`);
  };
  addObserved(mondayAfterWeekend(year, 0, 1), "New Year's Day");
  addObserved(mondayAfterWeekend(year, 6, 1), 'Canada Day');

  const christmasWeekday = new Date(Date.UTC(year, 11, 25)).getUTCDay();
  if (christmasWeekday === WEEKDAY.fri) {
    addObserved(iso(year, 11, 28), 'Boxing Day');
  } else if (christmasWeekday === WEEKDAY.sat) {
    addObserved(iso(year, 11, 27), 'Christmas Day');
    addObserved(iso(year, 11, 28), 'Boxing Day');
  } else if (christmasWeekday === WEEKDAY.sun) {
    addObserved(iso(year, 11, 27), 'Christmas Day');
  }
  return holidays;
}

/** The holiday's name if the date is one, otherwise null. */
export function holidayOn(date: string): string | null {
  const year = parseIsoDate(date).getUTCFullYear();
  return holidaysIn(year).get(date) ?? null;
}
