import { createHash, timingSafeEqual } from 'node:crypto';
import type { LatLng } from '../src/model/types.js';
import { orsDistanceMatrix } from './ors.js';
import { photonGeocode } from './photon.js';
import { ProviderError, type RoutingProvider } from './provider.js';

export const PASSWORD_HEADER = 'x-app-password';
export const MAX_MATRIX_POINTS = 50;
export const MAX_TEXT_LENGTH = 200;

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Fails closed: with no APP_PASSWORD set, nothing gets in. */
export function checkPassword(given: string | null | undefined, expected = process.env.APP_PASSWORD): void {
  if (!expected) throw new HttpError('APP_PASSWORD is not set on the server.', 500);
  if (typeof given !== 'string' || !timingSafeEqual(sha256(given), sha256(expected))) {
    throw new HttpError('Wrong password.', 401);
  }
}

export function requireMethod(request: Request, method: string): void {
  if (request.method !== method) throw new HttpError(`Use ${method}.`, 405);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError('Body must be valid JSON.', 400);
  }
}

export function parsePoints(body: unknown): LatLng[] {
  const points = (body as { points?: unknown } | null)?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_MATRIX_POINTS) {
    throw new HttpError(`"points" must be a list of 2 to ${MAX_MATRIX_POINTS} points.`, 400);
  }
  return points.map((point, i) => {
    const { lat, lng } = (point ?? {}) as { lat?: unknown; lng?: unknown };
    if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90) {
      throw new HttpError(`Point ${i}: bad latitude.`, 400);
    }
    if (typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) {
      throw new HttpError(`Point ${i}: bad longitude.`, 400);
    }
    return { lat, lng };
  });
}

export function parseSearchText(value: string | null): string {
  const text = (value ?? '').trim();
  if (text.length < 3) throw new HttpError('Type at least 3 characters.', 400);
  if (text.length > MAX_TEXT_LENGTH) throw new HttpError(`Keep it under ${MAX_TEXT_LENGTH} characters.`, 400);
  return text;
}

export function defaultProvider(): RoutingProvider {
  return {
    geocode: photonGeocode,
    distanceMatrix: (points) => orsDistanceMatrix(process.env.ORS_API_KEY ?? '', points),
  };
}

/** Turns thrown errors into JSON. Unknown errors never expose their details. */
export function handle(run: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await run(request);
    } catch (err) {
      if (err instanceof HttpError || err instanceof ProviderError) {
        return json({ error: err.message }, err.status);
      }
      console.error('Unhandled API error', err);
      return json({ error: 'Server error.' }, 500);
    }
  };
}
