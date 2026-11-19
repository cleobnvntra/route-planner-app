import { daysBetween, isValidIsoDate, parseTime } from './dates.js';
import {
  DAYS,
  MATERIALS,
  RESERVED_POINT_IDS,
  type Day,
  type DayHours,
  type Material,
  type MaterialHours,
  type Station,
  type TimeRange,
} from './types.js';

export const STALE_AFTER_DAYS = 90;

const ID_RE = /^[a-z0-9-]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMaterial(value: string): value is Material {
  return (MATERIALS as readonly string[]).includes(value);
}

function isDay(value: string): value is Day {
  return (DAYS as readonly string[]).includes(value);
}

function parseRange(value: unknown, where: string): TimeRange {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${where}: expected ["HH:MM", "HH:MM"] or null`);
  }
  const [open, close] = value as [string, string];
  try {
    if (parseTime(open) >= parseTime(close)) throw new Error(`opens at ${open}, closes at ${close}`);
  } catch (err) {
    throw new Error(`${where}: ${(err as Error).message}`);
  }
  return [open, close];
}

function parseDayHours(value: Record<string, unknown>, where: string): DayHours {
  const hours: DayHours = {};
  for (const [day, range] of Object.entries(value)) {
    if (!isDay(day)) throw new Error(`${where}: unknown day "${day}"`);
    hours[day] = range === null ? null : parseRange(range, `${where}.${day}`);
  }
  return hours;
}

function parseMaterials(value: unknown, where: string): Station['materials'] {
  if (!isObject(value)) throw new Error(`${where}: materials must be an object`);
  const materials: Station['materials'] = {};

  for (const [name, entry] of Object.entries(value)) {
    const entryWhere = `${where}.${name}`;
    if (!isMaterial(name)) throw new Error(`${entryWhere}: unknown material`);
    if (!isObject(entry)) throw new Error(`${entryWhere}: must be an object with "hours"`);
    const { hours } = entry;

    if (typeof hours === 'string') {
      const target = hours.startsWith('sameAs:') ? hours.slice('sameAs:'.length) : '';
      if (!isMaterial(target)) throw new Error(`${entryWhere}: bad hours reference "${hours}"`);
      const targetEntry = value[target];
      if (target === name || !isObject(targetEntry) || typeof targetEntry.hours === 'string') {
        throw new Error(`${entryWhere}: "${hours}" must point to a different material with its own hours`);
      }
      materials[name] = { hours: `sameAs:${target}` };
    } else if (isObject(hours)) {
      materials[name] = { hours: parseDayHours(hours, `${entryWhere}.hours`) };
    } else {
      throw new Error(`${entryWhere}: hours must be an object or "sameAs:<material>"`);
    }
  }
  return materials;
}

function requireString(value: Record<string, unknown>, key: string, where: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.trim() === '') {
    throw new Error(`${where}: "${key}" must be a non-empty string`);
  }
  return field;
}

function parseStation(value: unknown, index: number): Station {
  if (!isObject(value)) throw new Error(`stations[${index}]: must be an object`);
  const id = requireString(value, 'id', `stations[${index}]`);
  if (!ID_RE.test(id)) throw new Error(`stations[${index}]: bad id "${id}", use a-z, 0-9 and "-"`);
  if (RESERVED_POINT_IDS.includes(id)) throw new Error(`stations[${index}]: id "${id}" is reserved`);

  const { lat, lng, operator, notes } = value;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 || lat === 0) {
    throw new Error(`${id}: lat must be a real latitude`);
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180 || lng === 0) {
    throw new Error(`${id}: lng must be a real longitude`);
  }
  if (operator !== 'city' && operator !== 'private') {
    throw new Error(`${id}: operator must be "city" or "private"`);
  }
  if (notes !== undefined && typeof notes !== 'string') throw new Error(`${id}: notes must be a string`);

  const lastVerified = requireString(value, 'lastVerified', id);
  if (!isValidIsoDate(lastVerified)) throw new Error(`${id}: lastVerified must be YYYY-MM-DD`);

  return {
    id,
    name: requireString(value, 'name', id),
    operator,
    address: requireString(value, 'address', id),
    lat,
    lng,
    materials: parseMaterials(value.materials, id),
    ...(notes ? { notes } : {}),
    sourceUrl: requireString(value, 'sourceUrl', id),
    lastVerified,
  };
}

/**
 * Validates hand-curated station data. Bad data fails loudly, because a silent
 * mistake here sends a truck to a closed depot.
 */
export function parseStations(raw: unknown): Station[] {
  if (!Array.isArray(raw)) throw new Error('Station data must be an array');
  const stations = raw.map(parseStation);
  const seen = new Set<string>();
  for (const { id } of stations) {
    if (seen.has(id)) throw new Error(`Duplicate station id "${id}"`);
    seen.add(id);
  }
  return stations;
}

/** Resolves "sameAs:" references. Returns undefined if the material isn't accepted. */
export function resolveHours(station: Station, material: Material): DayHours | undefined {
  const entry: MaterialHours | undefined = station.materials[material];
  if (!entry) return undefined;
  if (typeof entry.hours !== 'string') return entry.hours;

  const target = entry.hours.slice('sameAs:'.length) as Material;
  const targetHours = station.materials[target]?.hours;
  if (!targetHours || typeof targetHours === 'string') {
    throw new Error(`${station.id}.${material}: bad hours reference "${entry.hours}"`);
  }
  return targetHours;
}

export function isStale(lastVerified: string, today: string): boolean {
  return daysBetween(lastVerified, today) > STALE_AFTER_DAYS;
}
