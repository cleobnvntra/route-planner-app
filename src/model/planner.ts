import { dayOf, parseTime } from './dates.js';
import { resolveHours } from './stations.js';
import {
  DAY_LABELS,
  MATERIALS,
  MATERIAL_LABELS,
  POINT_CLIENT,
  POINT_DROPOFF,
  POINT_PICKUP,
  type CandidateRoute,
  type EligibleStation,
  type Eligibility,
  type ExcludedStation,
  type LatLng,
  type Leg,
  type Material,
  type RouteMatrix,
  type ScoredRoute,
  type ScoredRoutes,
  type Station,
  type TimeRange,
} from './types.js';

/** Google Maps directions drops waypoints beyond this limit on mobile browsers. */
const MAX_MAPS_WAYPOINTS = 3;

function requireMaterials(materials: readonly Material[]): Material[] {
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new Error('Pick at least one material');
  }
  for (const material of materials) {
    if (!MATERIALS.includes(material)) throw new Error(`Unknown material "${String(material)}"`);
  }
  return [...new Set(materials)];
}

/** Hours for a material on a date. null means closed or not accepted. */
export function hoursOn(station: Station, material: Material, date: string): TimeRange | null {
  const day = dayOf(date);
  return resolveHours(station, material)?.[day] ?? null;
}

export function isOpenFor(station: Station, material: Material, date: string, time?: string): boolean {
  const minutes = time === undefined ? undefined : parseTime(time);
  const range = hoursOn(station, material, date);
  if (!range) return false;
  if (minutes === undefined) return true;
  return minutes >= parseTime(range[0]) && minutes < parseTime(range[1]);
}

export function eligibleStations(
  stations: readonly Station[],
  materials: readonly Material[],
  date: string,
): Eligibility {
  const required = requireMaterials(materials);
  const dayLabel = DAY_LABELS[dayOf(date)];
  const eligible: EligibleStation[] = [];
  const excluded: ExcludedStation[] = [];

  for (const station of stations) {
    const usable: Material[] = [];
    const reasons: string[] = [];
    for (const material of required) {
      const label = MATERIAL_LABELS[material];
      if (!resolveHours(station, material)) reasons.push(`${label}: not accepted`);
      else if (!isOpenFor(station, material, date)) reasons.push(`${label}: closed ${dayLabel}`);
      else usable.push(material);
    }
    if (usable.length > 0) eligible.push({ station, materials: usable, reasons });
    else excluded.push({ station, reasons });
  }

  const uncovered = required.filter((m) => !eligible.some((e) => e.materials.includes(m)));
  return { eligible, excluded, uncovered };
}

/**
 * Single stations that cover everything, then ordered pairs that do. A pair
 * where one station already covers everything is skipped: the second stop would
 * have nothing to drop. Each stop takes all it can; the next takes the rest.
 */
export function candidateRoutes(
  eligible: readonly EligibleStation[],
  materials: readonly Material[],
): CandidateRoute[] {
  const required = requireMaterials(materials);
  const takes = (e: EligibleStation, m: Material) => e.materials.includes(m);
  const coversAll = (e: EligibleStation) => required.every((m) => takes(e, m));
  const routes: CandidateRoute[] = [];

  for (const e of eligible) {
    if (coversAll(e)) routes.push({ id: e.station.id, stops: [{ station: e.station, materials: required }] });
  }

  const partial = eligible.filter((e) => !coversAll(e));
  for (const first of partial) {
    for (const second of partial) {
      if (first === second) continue;
      if (!required.every((m) => takes(first, m) || takes(second, m))) continue;
      routes.push({
        id: `${first.station.id}+${second.station.id}`,
        stops: [
          { station: first.station, materials: required.filter((m) => takes(first, m)) },
          { station: second.station, materials: required.filter((m) => !takes(first, m)) },
        ],
      });
    }
  }
  return routes;
}

function requireSquareMatrix(matrix: RouteMatrix): void {
  const size = matrix?.ids?.length;
  const isSquare = (grid: unknown) =>
    Array.isArray(grid) && grid.length === size && grid.every((row) => Array.isArray(row) && row.length === size);
  if (!size || !isSquare(matrix.distancesKm) || !isSquare(matrix.durationsMin)) {
    throw new Error('Route matrix is malformed: distances and durations must match the point list');
  }
}

function isUsable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function scoreRoutes(candidates: readonly CandidateRoute[], matrix: RouteMatrix): ScoredRoutes {
  requireSquareMatrix(matrix);
  const index = new Map(matrix.ids.map((id, i) => [id, i]));
  const indexOf = (id: string) => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`Route matrix is missing point "${id}"`);
    return i;
  };

  const routes: ScoredRoute[] = [];
  const unroutable: CandidateRoute[] = [];

  for (const candidate of candidates) {
    if (candidate.stops.length === 0) throw new Error(`Route "${candidate.id}" has no stops`);
    const path = [POINT_PICKUP, POINT_CLIENT, ...candidate.stops.map((s) => s.station.id), POINT_DROPOFF];
    // Resolve every point first: a missing point is a bug, not an unroutable leg.
    const points = path.map(indexOf);
    const legs: Leg[] = [];
    let routable = true;

    for (let i = 0; i < path.length - 1; i += 1) {
      const from = path[i] as string;
      const to = path[i + 1] as string;
      const km = matrix.distancesKm[points[i] as number]?.[points[i + 1] as number];
      const min = matrix.durationsMin[points[i] as number]?.[points[i + 1] as number];
      if (!isUsable(km) || !isUsable(min)) {
        routable = false;
        break;
      }
      legs.push({ from, to, km, min });
    }

    if (!routable) {
      unroutable.push(candidate);
      continue;
    }
    routes.push({
      ...candidate,
      legs,
      totalKm: legs.reduce((sum, leg) => sum + leg.km, 0),
      totalMin: legs.reduce((sum, leg) => sum + leg.min, 0),
    });
  }

  routes.sort((a, b) => a.totalKm - b.totalKm || a.totalMin - b.totalMin || a.id.localeCompare(b.id));
  return { routes, unroutable };
}

/** Google Maps directions URL through all stops in order. Needs no API key. */
export function mapsUrl(stops: readonly LatLng[]): string {
  if (!Array.isArray(stops) || stops.length < 2) throw new Error('A route needs at least 2 stops');
  if (stops.length - 2 > MAX_MAPS_WAYPOINTS) {
    throw new Error(`Google Maps on phones allows ${MAX_MAPS_WAYPOINTS} waypoints at most`);
  }
  const coords = stops.map(({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error(`Invalid stop coordinates: ${String(lat)}, ${String(lng)}`);
    }
    return `${lat},${lng}`;
  });

  const params = [
    'api=1',
    `origin=${encodeURIComponent(coords[0] as string)}`,
    `destination=${encodeURIComponent(coords[coords.length - 1] as string)}`,
    'travelmode=driving',
  ];
  const waypoints = coords.slice(1, -1);
  if (waypoints.length > 0) params.push(`waypoints=${encodeURIComponent(waypoints.join('|'))}`);
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
