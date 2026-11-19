import { orsDistanceMatrix } from '../../server/ors.js';
import { photonGeocode } from '../../server/photon.js';
import { ProviderError } from '../../server/provider.js';
import type { DistanceMatrix, LatLng, Place } from '../model/types.js';
import { ApiError } from './apiError.js';

/** APK version: the phone calls the providers itself, and the secret is the routing key. */
const MAX_TEXT_LENGTH = 200;

/** Two depots, used only to prove a pasted key works before saving it. */
const KEY_CHECK_POINTS: LatLng[] = [
  { lat: 43.722038, lng: -79.318323 },
  { lat: 43.700662, lng: -79.471307 },
];

async function translateErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ProviderError) throw new ApiError(err.message, err.status);
    throw err;
  }
}

export async function login(key: string): Promise<void> {
  await translateErrors(() => orsDistanceMatrix(key, KEY_CHECK_POINTS));
}

export async function geocode(text: string, _key: string, _signal: AbortSignal): Promise<Place[]> {
  if (text.length > MAX_TEXT_LENGTH) throw new ApiError(`Keep it under ${MAX_TEXT_LENGTH} characters.`, 400);
  return translateErrors(() => photonGeocode(text));
}

export function distanceMatrix(points: LatLng[], key: string): Promise<DistanceMatrix> {
  return translateErrors(() => orsDistanceMatrix(key, points));
}
