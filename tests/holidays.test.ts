import { describe, expect, it } from 'vitest';
import { holidayOn } from '../src/model/holidays.js';

describe('holidayOn', () => {
  // 2026 dates as printed on toronto.ca/holiday-impacts.
  it.each([
    ['2026-01-01', "New Year's Day"],
    ['2026-02-16', 'Family Day'],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-06', 'Easter Monday'],
    ['2026-05-18', 'Victoria Day'],
    ['2026-07-01', 'Canada Day'],
    ['2026-08-03', 'Civic Day'],
    ['2026-09-07', 'Labour Day'],
    ['2026-09-30', 'National Day for Truth and Reconciliation'],
    ['2026-10-12', 'Thanksgiving'],
    ['2026-11-11', 'Remembrance Day'],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-26', 'Boxing Day'],
    ['2027-01-01', "New Year's Day"],
  ])('%s is %s', (date, name) => {
    expect(holidayOn(date)).toBe(name);
  });

  it('computes moving holidays in other years', () => {
    expect(holidayOn('2027-03-26')).toBe('Good Friday');
    expect(holidayOn('2027-05-24')).toBe('Victoria Day');
    expect(holidayOn('2032-05-24')).toBe('Victoria Day');
    expect(holidayOn('2025-05-19')).toBe('Victoria Day');
  });

  it('flags observed weekdays', () => {
    expect(holidayOn('2026-12-28')).toBe('Boxing Day (observed)');
    expect(holidayOn('2027-12-27')).toBe('Christmas Day (observed)');
    expect(holidayOn('2027-12-28')).toBe('Boxing Day (observed)');
    // Christmas 2033 is a Sunday.
    expect(holidayOn('2033-12-26')).toBe('Boxing Day');
    expect(holidayOn('2033-12-27')).toBe('Christmas Day (observed)');
    // Christmas 2028 is a Monday, so nothing shifts.
    expect(holidayOn('2028-12-27')).toBeNull();
    expect(holidayOn('2028-01-03')).toBe("New Year's Day (observed)");
    expect(holidayOn('2028-07-03')).toBe('Canada Day (observed)');
  });

  it('returns null on a normal day and rejects bad input', () => {
    expect(holidayOn('2026-11-03')).toBeNull();
    expect(() => holidayOn('2026-13-01')).toThrow(/no such calendar day/);
  });
});
