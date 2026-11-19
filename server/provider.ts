import type { DistanceMatrix, LatLng, Place } from '../src/model/types.js';

/** Swap an implementation to move to Mapbox or Google. */
export type RoutingProvider = {
  geocode(text: string): Promise<Place[]>;
  /** Driving distances and times between all points. Never straight-line. */
  distanceMatrix(points: LatLng[]): Promise<DistanceMatrix>;
};

export class ProviderError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

const TIMEOUT_MS = 8_000;

/** Upstream error bodies and URLs are never passed on: they can contain secrets. */
export async function fetchJson(service: string, url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ProviderError(`${service} did not respond. Try again.`, 504);
  }
  if (response.status === 429) throw new ProviderError(`${service} limit reached. Try again later.`, 429);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(`${service} refused the request. Check the API key or daily limit.`, 502);
  }
  if (!response.ok) throw new ProviderError(`${service} error (${response.status}).`, 502);
  try {
    return await response.json();
  } catch {
    throw new ProviderError(`${service} sent a bad response.`, 502);
  }
}
