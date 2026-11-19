import type { DistanceMatrix, LatLng } from '../src/model/types.js';
import { ProviderError, fetchJson } from './provider.js';

// api.openrouteservice.org is deprecated and shuts down in November 2026.
const MATRIX_URL = 'https://api.heigit.org/openrouteservice/v2/matrix/driving-car';
const SERVICE = 'Routing service';

function isCell(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function readGrid(value: unknown, size: number): (number | null)[][] {
  const valid =
    Array.isArray(value) &&
    value.length === size &&
    value.every((row) => Array.isArray(row) && row.length === size && row.every(isCell));
  if (!valid) throw new ProviderError('Routing service sent a bad matrix.', 502);
  return value as (number | null)[][];
}

export async function orsDistanceMatrix(apiKey: string, points: LatLng[]): Promise<DistanceMatrix> {
  if (!apiKey) throw new ProviderError('ORS_API_KEY is not set on the server.', 500);

  const body = await fetchJson(SERVICE, MATRIX_URL, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: points.map(({ lat, lng }) => [lng, lat]),
      metrics: ['distance', 'duration'],
      units: 'km',
    }),
  });
  const { distances, durations } = (body ?? {}) as { distances?: unknown; durations?: unknown };
  const distancesKm = readGrid(distances, points.length);
  const durationSeconds = readGrid(durations, points.length);
  return {
    distancesKm,
    durationsMin: durationSeconds.map((row) => row.map((s) => (s === null ? null : s / 60))),
  };
}
