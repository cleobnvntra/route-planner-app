import { describe, expect, it } from 'vitest';
import raw from '../src/data/stations.json';
import { isOpenFor } from '../src/model/planner.js';
import { isStale, parseStations, resolveHours } from '../src/model/stations.js';
import type { Material, Station } from '../src/model/types.js';

const stations = parseStations(raw);
const byId = (id: string) => {
  const found = stations.find((s) => s.id === id);
  if (!found) throw new Error(`No station ${id}`);
  return found;
};
const accepts = (m: Material) =>
  stations
    .filter((s) => resolveHours(s, m))
    .map((s) => s.id)
    .sort();

const MONDAY = '2026-11-02';
const FRIDAY = '2026-11-06';
const SATURDAY = '2026-11-07';
const SUNDAY = '2026-11-08';

// Facts below come from toronto.ca's depot pages, checked 2026-11-03.
describe('stations.json matches the City pages', () => {
  it('has all 7 City depots', () => {
    expect(stations.map((s) => s.id).sort()).toEqual([
      'bermondsey',
      'commissioners',
      'disco',
      'dufferin',
      'ingram',
      'scarborough',
      'victoria-park',
    ]);
  });

  it('is closed for everything on Sunday', () => {
    for (const s of stations) {
      for (const m of Object.keys(s.materials) as Material[]) {
        expect(isOpenFor(s, m, SUNDAY), `${s.id}/${m}`).toBe(false);
      }
    }
  });

  it('takes metal only where listed', () => {
    expect(accepts('metal')).toEqual(['bermondsey', 'commissioners', 'dufferin', 'ingram']);
  });

  it('takes drywall only at Bermondsey, Commissioners and Ingram', () => {
    expect(accepts('drywall')).toEqual(['bermondsey', 'commissioners', 'ingram']);
  });

  it('has no City depot that takes tires', () => {
    expect(accepts('tires')).toEqual([]);
  });

  it('has HHW and e-waste everywhere but Dufferin', () => {
    const expected = ['bermondsey', 'commissioners', 'disco', 'ingram', 'scarborough', 'victoria-park'];
    expect(accepts('hhw')).toEqual(expected);
    expect(accepts('ewaste')).toEqual(expected);
  });

  it('takes HHW on Monday only at Bermondsey and Ingram', () => {
    const open = stations.filter((s) => isOpenFor(s, 'hhw', MONDAY)).map((s) => s.id);
    expect(open.sort()).toEqual(['bermondsey', 'ingram']);
  });

  it('models overnight hours and the 23:30 pause', () => {
    const ingram = byId('ingram');
    expect(isOpenFor(ingram, 'garbage', MONDAY, '05:59')).toBe(false);
    expect(isOpenFor(ingram, 'garbage', '2026-11-03', '03:00')).toBe(true);
    expect(isOpenFor(ingram, 'garbage', '2026-11-03', '23:45')).toBe(false);
    expect(isOpenFor(ingram, 'garbage', SATURDAY, '12:29')).toBe(true);
    expect(isOpenFor(ingram, 'garbage', SATURDAY, '12:30')).toBe(false);

    const bermondsey = byId('bermondsey');
    expect(isOpenFor(bermondsey, 'garbage', FRIDAY, '20:59')).toBe(true);
    expect(isOpenFor(bermondsey, 'garbage', FRIDAY, '21:00')).toBe(false);
  });

  it('is open for general waste on Saturday only at Bermondsey, Ingram and Scarborough', () => {
    const open = stations.filter((s) => isOpenFor(s, 'garbage', SATURDAY)).map((s) => s.id);
    expect(open.sort()).toEqual(['bermondsey', 'ingram', 'scarborough']);
  });

  it('has coordinates in the Toronto area', () => {
    for (const s of stations) {
      expect(s.lat, s.id).toBeGreaterThan(43.5);
      expect(s.lat, s.id).toBeLessThan(43.9);
      expect(s.lng, s.id).toBeGreaterThan(-79.7);
      expect(s.lng, s.id).toBeLessThan(-79.1);
    }
  });
});

describe('parseStations', () => {
  const valid = (): Record<string, unknown> => ({
    id: 'a',
    name: 'A',
    operator: 'private',
    address: 'addr',
    lat: 43.7,
    lng: -79.4,
    materials: {
      garbage: { hours: { mon: ['06:00', '18:00'], sun: null } },
      metal: { hours: 'sameAs:garbage' },
    },
    sourceUrl: 'https://example.com',
    lastVerified: '2026-11-03',
  });

  it('accepts a valid station', () => {
    expect((parseStations([valid()])[0] as Station).id).toBe('a');
  });

  it.each([
    ['non-array', null, /must be an array/],
    ['reserved id', [{ ...valid(), id: 'pickup' }], /reserved/],
    ['bad id', [{ ...valid(), id: 'A B' }], /bad id/],
    ['placeholder coordinates', [{ ...valid(), lat: 0 }], /lat/],
    ['bad operator', [{ ...valid(), operator: 'x' }], /operator/],
    ['bad lastVerified', [{ ...valid(), lastVerified: 'YYYY-MM-DD' }], /lastVerified/],
    ['unknown material', [{ ...valid(), materials: { glass: { hours: {} } } }], /unknown material/],
    ['unknown day', [{ ...valid(), materials: { garbage: { hours: { funday: null } } } }], /unknown day/],
    ['reversed hours', [{ ...valid(), materials: { garbage: { hours: { mon: ['18:00', '06:00'] } } } }], /opens at/],
    ['bad time', [{ ...valid(), materials: { garbage: { hours: { mon: ['6am', '18:00'] } } } }], /HH:MM/],
    ['dangling sameAs', [{ ...valid(), materials: { metal: { hours: 'sameAs:garbage' } } }], /must point to/],
    ['self sameAs', [{ ...valid(), materials: { metal: { hours: 'sameAs:metal' } } }], /must point to/],
    ['duplicate id', [valid(), valid()], /Duplicate/],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseStations(input)).toThrow(message);
  });

  it('rejects sameAs chains', () => {
    const materials = {
      garbage: { hours: { mon: ['06:00', '18:00'] } },
      metal: { hours: 'sameAs:garbage' },
      yard: { hours: 'sameAs:metal' },
    };
    expect(() => parseStations([{ ...valid(), materials }])).toThrow(/must point to/);
  });
});

describe('isStale', () => {
  it('warns only after 90 days', () => {
    expect(isStale('2026-08-05', '2026-11-03')).toBe(false);
    expect(isStale('2026-08-04', '2026-11-03')).toBe(true);
  });
});
