import { describe, expect, it } from 'vitest';
import {
  candidateRoutes,
  eligibleStations,
  isOpenFor,
  mapsUrl,
  scoreRoutes,
} from '../src/model/planner.js';
import type { Material, RouteMatrix, Station } from '../src/model/types.js';

const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const SUNDAY = '2026-11-08';

const WEEKDAYS = {
  mon: ['06:00', '18:00'],
  tue: ['06:00', '18:00'],
  wed: ['06:00', '18:00'],
  thu: ['06:00', '18:00'],
  fri: ['06:00', '18:00'],
  sat: null,
  sun: null,
} as const;

function station(id: string, materials: Station['materials']): Station {
  return {
    id,
    name: id.toUpperCase(),
    operator: 'city',
    address: `${id} address`,
    lat: 43.7,
    lng: -79.4,
    materials,
    sourceUrl: 'https://example.com',
    lastVerified: '2026-11-03',
  };
}

const hours = { hours: { ...WEEKDAYS } } as unknown as Station['materials'][Material];

/** Builds a symmetric matrix from a list of [a, b, km] edges. Minutes = km * 2. */
function matrixFrom(ids: string[], edges: [string, string, number][]): RouteMatrix {
  const size = ids.length;
  const distancesKm = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
  ids.forEach((_, i) => {
    (distancesKm[i] as (number | null)[])[i] = 0;
  });
  for (const [a, b, km] of edges) {
    const [i, j] = [ids.indexOf(a), ids.indexOf(b)];
    (distancesKm[i] as (number | null)[])[j] = km;
    (distancesKm[j] as (number | null)[])[i] = km;
  }
  const durationsMin = distancesKm.map((row) => row.map((km) => (km === null ? null : km * 2)));
  return { ids, distancesKm, durationsMin };
}

describe('isOpenFor', () => {
  const depot = station('a', {
    garbage: hours,
    hhw: { hours: { mon: null, tue: ['10:00', '18:00'], sun: null } },
    metal: { hours: 'sameAs:garbage' },
  });

  it('is closed on Sunday', () => {
    expect(isOpenFor(depot, 'garbage', SUNDAY)).toBe(false);
  });

  it('is closed for HHW on Monday but open for garbage', () => {
    expect(isOpenFor(depot, 'hhw', MONDAY)).toBe(false);
    expect(isOpenFor(depot, 'garbage', MONDAY)).toBe(true);
    expect(isOpenFor(depot, 'hhw', TUESDAY)).toBe(true);
  });

  it('treats a missing day as closed', () => {
    expect(isOpenFor(depot, 'hhw', '2026-11-04')).toBe(false);
  });

  it('treats a missing material as not accepted', () => {
    expect(isOpenFor(depot, 'tires', MONDAY)).toBe(false);
  });

  it('follows sameAs references', () => {
    expect(isOpenFor(depot, 'metal', MONDAY)).toBe(true);
    expect(isOpenFor(depot, 'metal', SUNDAY)).toBe(false);
  });

  it('includes opening time and excludes closing time', () => {
    expect(isOpenFor(depot, 'garbage', MONDAY, '05:59')).toBe(false);
    expect(isOpenFor(depot, 'garbage', MONDAY, '06:00')).toBe(true);
    expect(isOpenFor(depot, 'garbage', MONDAY, '17:59')).toBe(true);
    expect(isOpenFor(depot, 'garbage', MONDAY, '18:00')).toBe(false);
  });

  it('rejects invalid dates and times', () => {
    expect(() => isOpenFor(depot, 'garbage', '2026-02-30')).toThrow(/no such calendar day/);
    expect(() => isOpenFor(depot, 'garbage', 'tomorrow')).toThrow(/YYYY-MM-DD/);
    expect(() => isOpenFor(depot, 'garbage', MONDAY, '25:00')).toThrow(/between/);
    expect(() => isOpenFor(depot, 'garbage', MONDAY, '9am')).toThrow(/HH:MM/);
    expect(() => isOpenFor(depot, 'garbage', SUNDAY, 'bad')).toThrow(/HH:MM/);
  });

  it('gets the weekday right regardless of time zone', () => {
    // 2026-11-08 parsed as local midnight in a zone west of UTC would be Saturday.
    expect(isOpenFor(station('s', { garbage: { hours: { sun: ['06:00', '18:00'] } } }), 'garbage', SUNDAY)).toBe(true);
  });
});

describe('eligibleStations', () => {
  it('excludes everything on a Sunday and says why', () => {
    const result = eligibleStations([station('a', { garbage: hours })], ['garbage'], SUNDAY);
    expect(result.eligible).toEqual([]);
    expect(result.excluded[0]?.reasons).toEqual(['Garbage: closed Sunday']);
    expect(result.uncovered).toEqual(['garbage']);
  });

  it('keeps a station open for only some materials and explains the rest', () => {
    const depot = station('a', { garbage: hours, hhw: { hours: { mon: null, tue: ['10:00', '18:00'] } } });
    const result = eligibleStations([depot], ['garbage', 'hhw'], MONDAY);
    expect(result.eligible[0]?.materials).toEqual(['garbage']);
    expect(result.eligible[0]?.reasons).toEqual(['HHW: closed Monday']);
    expect(result.uncovered).toEqual(['hhw']);
  });

  it('explains a station that does not take metal', () => {
    const result = eligibleStations([station('a', { garbage: hours })], ['metal'], MONDAY);
    expect(result.excluded[0]?.reasons).toEqual(['Scrap metal: not accepted']);
  });

  it('rejects empty and unknown materials, and ignores duplicates', () => {
    expect(() => eligibleStations([], [], MONDAY)).toThrow(/at least one/);
    expect(() => eligibleStations([], ['glass' as Material], MONDAY)).toThrow(/Unknown material/);
    const result = eligibleStations([station('a', { garbage: hours })], ['garbage', 'garbage'], MONDAY);
    expect(result.eligible[0]?.materials).toEqual(['garbage']);
  });
});

describe('candidateRoutes', () => {
  const required: Material[] = ['garbage', 'hhw'];
  const all = station('all', { garbage: hours, hhw: hours });
  const g = station('g', { garbage: hours });
  const h = station('h', { hhw: hours });
  const gh = (materials: Material[], s: Station) => ({ station: s, materials, reasons: [] });

  it('returns a single station that covers everything', () => {
    const routes = candidateRoutes([gh(required, all)], required);
    expect(routes.map((r) => r.id)).toEqual(['all']);
  });

  it('tries both visit orders of a pair and assigns materials per stop', () => {
    const routes = candidateRoutes([gh(['garbage'], g), gh(['hhw'], h)], required);
    expect(routes.map((r) => r.id)).toEqual(['g+h', 'h+g']);
    expect(routes[0]?.stops.map((s) => s.materials)).toEqual([['garbage'], ['hhw']]);
    expect(routes[1]?.stops.map((s) => s.materials)).toEqual([['hhw'], ['garbage']]);
  });

  it('skips a pair when one station already covers everything', () => {
    const routes = candidateRoutes([gh(required, all), gh(['garbage'], g)], required);
    expect(routes.map((r) => r.id)).toEqual(['all']);
  });

  it('drops pairs that still miss a material and never exceeds 2 stops', () => {
    const three: Material[] = ['garbage', 'hhw', 'metal'];
    const m = station('m', { metal: hours });
    const routes = candidateRoutes([gh(['garbage'], g), gh(['hhw'], h), gh(['metal'], m)], three);
    expect(routes).toEqual([]);
  });

  it('assigns overlapping materials to the first stop only', () => {
    const three: Material[] = ['garbage', 'hhw', 'metal'];
    const a = station('a', { garbage: hours, hhw: hours });
    const b = station('b', { hhw: hours, metal: hours });
    const routes = candidateRoutes([gh(['garbage', 'hhw'], a), gh(['hhw', 'metal'], b)], three);
    expect(routes[0]?.stops.map((s) => s.materials)).toEqual([['garbage', 'hhw'], ['metal']]);
    expect(routes[1]?.stops.map((s) => s.materials)).toEqual([['hhw', 'metal'], ['garbage']]);
  });
});

describe('scoreRoutes', () => {
  const far = station('far', { garbage: hours, hhw: hours });
  const g = station('g', { garbage: hours });
  const h = station('h', { hhw: hours });
  const required: Material[] = ['garbage', 'hhw'];
  const candidates = candidateRoutes(
    [
      { station: far, materials: required, reasons: [] },
      { station: g, materials: ['garbage'], reasons: [] },
      { station: h, materials: ['hhw'], reasons: [] },
    ],
    required,
  );
  const ids = ['pickup', 'client', 'dropoff', 'far', 'g', 'h'];

  it('ranks a two-station combo above a far single station', () => {
    const matrix = matrixFrom(ids, [
      ['pickup', 'client', 10],
      ['client', 'far', 40],
      ['far', 'dropoff', 40],
      ['client', 'g', 5],
      ['g', 'h', 3],
      ['h', 'dropoff', 8],
      ['client', 'h', 20],
      ['g', 'dropoff', 20],
    ]);
    const { routes } = scoreRoutes(candidates, matrix);
    expect(routes.map((r) => r.id)).toEqual(['g+h', 'h+g', 'far']);
    expect(routes[0]?.totalKm).toBe(26);
    expect(routes[0]?.totalMin).toBe(52);
    expect(routes[0]?.legs.map((l) => [l.from, l.to, l.km])).toEqual([
      ['pickup', 'client', 10],
      ['client', 'g', 5],
      ['g', 'h', 3],
      ['h', 'dropoff', 8],
    ]);
  });

  it('uses a drop-off that differs from the pickup', () => {
    const single = candidates.filter((c) => c.id === 'far');
    const matrix = matrixFrom(ids, [
      ['pickup', 'client', 10],
      ['client', 'far', 5],
      ['far', 'dropoff', 7],
      ['far', 'pickup', 99],
    ]);
    const { routes } = scoreRoutes(single, matrix);
    expect(routes[0]?.legs.at(-1)).toMatchObject({ from: 'far', to: 'dropoff', km: 7 });
    expect(routes[0]?.totalKm).toBe(22);
  });

  it('reports candidates with no road path instead of hiding or zeroing them', () => {
    const single = candidates.filter((c) => c.id === 'far');
    const matrix = matrixFrom(ids, [['pickup', 'client', 10]]);
    const { routes, unroutable } = scoreRoutes(single, matrix);
    expect(routes).toEqual([]);
    expect(unroutable.map((c) => c.id)).toEqual(['far']);
  });

  it('rejects a malformed matrix or a missing point', () => {
    expect(() => scoreRoutes(candidates, { ids, distancesKm: [], durationsMin: [] })).toThrow(/malformed/);
    const noFar = matrixFrom(['pickup', 'client', 'dropoff'], []);
    expect(() => scoreRoutes(candidates, noFar)).toThrow(/missing point "far"/);
  });
});

describe('mapsUrl', () => {
  const a = { lat: 43.1, lng: -79.1 };
  const b = { lat: 43.2, lng: -79.2 };
  const c = { lat: 43.3, lng: -79.3 };
  const d = { lat: 43.4, lng: -79.4 };
  const e = { lat: 43.5, lng: -79.5 };

  it('builds origin, destination and ordered encoded waypoints', () => {
    const url = new URL(mapsUrl([a, b, c, d, e]));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('43.1,-79.1');
    expect(url.searchParams.get('destination')).toBe('43.5,-79.5');
    expect(url.searchParams.get('waypoints')).toBe('43.2,-79.2|43.3,-79.3|43.4,-79.4');
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.search).toContain('%7C');
  });

  it('leaves out waypoints for a two-stop route', () => {
    expect(mapsUrl([a, b])).not.toContain('waypoints');
  });

  it('rejects too few stops, too many waypoints and bad coordinates', () => {
    expect(() => mapsUrl([a])).toThrow(/at least 2/);
    expect(() => mapsUrl([a, b, c, d, e, a])).toThrow(/waypoints/);
    expect(() => mapsUrl([a, { lat: 91, lng: 0 }])).toThrow(/Invalid stop/);
    expect(() => mapsUrl([a, { lat: Number.NaN, lng: 0 }])).toThrow(/Invalid stop/);
  });
});
