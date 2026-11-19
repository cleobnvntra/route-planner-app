import type { DistanceMatrix, LatLng, Place } from '../model/types.js';
import { ApiError } from './apiError.js';

/** Website version: everything goes through /api, and the secret is the shared password. */
const PASSWORD_HEADER = 'x-app-password';

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('No connection. Check your signal and try again.', 0);
  }
  let body: { error?: unknown } & Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(`Server error (${response.status}).`, response.status);
  }
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : `Server error (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function login(password: string): Promise<void> {
  await call('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function geocode(text: string, password: string, signal: AbortSignal): Promise<Place[]> {
  const { places } = await call<{ places: Place[] }>(`/api/geocode?text=${encodeURIComponent(text)}`, {
    headers: { [PASSWORD_HEADER]: password },
    signal,
  });
  return places;
}

export function distanceMatrix(points: LatLng[], password: string): Promise<DistanceMatrix> {
  return call<DistanceMatrix>('/api/matrix', {
    method: 'POST',
    headers: { [PASSWORD_HEADER]: password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
}
