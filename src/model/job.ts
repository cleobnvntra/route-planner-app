import { isValidIsoDate, parseTime } from './dates.js';
import { holidayOn } from './holidays.js';
import { candidateRoutes, eligibleStations, scoreRoutes } from './planner.js';
import {
  POINT_CLIENT,
  POINT_DROPOFF,
  POINT_PICKUP,
  type CandidateRoute,
  type DistanceMatrix,
  type Eligibility,
  type LatLng,
  type Material,
  type Place,
  type RouteMatrix,
  type ScoredRoute,
  type Station,
} from './types.js';

export type JobForm = {
  date: string;
  startTime: string;
  materials: Material[];
  client: Place | null;
  pickup: Place | null;
  dropoff: Place | null;
  dropoffSameAsPickup: boolean;
};

export type Job = {
  date: string;
  startTime: string | null;
  materials: Material[];
  client: Place;
  pickup: Place;
  dropoff: Place;
};

export type Plan = {
  job: Job;
  holiday: string | null;
  eligibility: Eligibility;
  routes: ScoredRoute[];
  unroutable: CandidateRoute[];
};

export type JobValidation = { job: Job; errors: [] } | { job: null; errors: string[] };

export function validateJob(form: JobForm): JobValidation {
  const errors: string[] = [];
  if (!isValidIsoDate(form.date)) errors.push('Pick a job date.');
  if (form.startTime) {
    try {
      parseTime(form.startTime);
    } catch {
      errors.push('Start time is not valid.');
    }
  }
  if (form.materials.length === 0) errors.push('Pick at least one material.');
  if (!form.client) errors.push('Pick the client address from the list.');
  if (!form.pickup) errors.push('Pick the rental truck pickup address from the list.');

  const dropoff = form.dropoffSameAsPickup ? form.pickup : form.dropoff;
  if (!form.dropoffSameAsPickup && !form.dropoff) errors.push('Pick the rental truck drop-off address from the list.');

  if (errors.length > 0 || !form.client || !form.pickup || !dropoff) {
    return { job: null, errors };
  }
  return {
    job: {
      date: form.date,
      startTime: form.startTime || null,
      materials: form.materials,
      client: form.client,
      pickup: form.pickup,
      dropoff,
    },
    errors: [],
  };
}

/** Everything that can be worked out without a routing call. */
export function prepareRoutes(job: Job, stations: readonly Station[]) {
  const eligibility = eligibleStations(stations, job.materials, job.date);
  return { eligibility, candidates: candidateRoutes(eligibility.eligible, job.materials) };
}

/** The single matrix request: fixed points plus only the stations routes can use. */
export function matrixPoints(job: Job, candidates: readonly CandidateRoute[]) {
  const stations = new Map<string, Station>();
  for (const candidate of candidates) {
    for (const stop of candidate.stops) stations.set(stop.station.id, stop.station);
  }
  const ids = [POINT_PICKUP, POINT_CLIENT, POINT_DROPOFF, ...stations.keys()];
  const points: LatLng[] = [job.pickup, job.client, job.dropoff, ...stations.values()].map(({ lat, lng }) => ({
    lat,
    lng,
  }));
  return { ids, points };
}

export function buildPlan(
  job: Job,
  eligibility: Eligibility,
  candidates: readonly CandidateRoute[],
  ids: string[] | null,
  matrix: DistanceMatrix | null,
): Plan {
  const scored =
    ids && matrix
      ? scoreRoutes(candidates, { ids, ...matrix } satisfies RouteMatrix)
      : { routes: [], unroutable: [] };
  return { job, holiday: holidayOn(job.date), eligibility, ...scored };
}

/** Stops for the Navigate button, in driving order. */
export function routeStops(job: Job, route: ScoredRoute): LatLng[] {
  return [job.pickup, job.client, ...route.stops.map((stop) => stop.station), job.dropoff];
}
