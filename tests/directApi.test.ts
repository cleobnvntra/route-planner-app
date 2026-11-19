import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/controller/apiError.js';
import { distanceMatrix, geocode, login } from '../src/controller/directApi.js';

const KEY = 'phone-key';
const A = { lat: 43.7, lng: -79.4 };
const B = { lat: 43.8, lng: -79.3 };
const grid = { distances: [[0, 1], [1, 0]], durations: [[0, 60], [60, 0]] };
const signal = new AbortController().signal;

let upstream: ReturnType<typeof vi.fn>;

beforeEach(() => {
  upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('APK direct calls', () => {
  it('sends the phone key to routing in the header only', async () => {
    upstream.mockResolvedValue(Response.json(grid));
    expect(await distanceMatrix([A, B], KEY)).toEqual({
      distancesKm: [[0, 1], [1, 0]],
      durationsMin: [[0, 1], [1, 0]],
    });
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.heigit.org/openrouteservice/v2/matrix/driving-car');
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>).Authorization).toBe(KEY);
  });

  it('never sends the key to address search', async () => {
    upstream.mockResolvedValue(Response.json({ features: [] }));
    expect(await geocode('109 huntingdale', KEY, signal)).toEqual([]);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('photon.komoot.io');
    expect(url + JSON.stringify(init)).not.toContain(KEY);
  });

  it('accepts a working key with one real check', async () => {
    upstream.mockResolvedValue(Response.json(grid));
    await expect(login(KEY)).resolves.toBeUndefined();
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rejected key', 403, /refused/],
    ['rate limit', 429, /limit reached/],
    ['outage', 500, /error \(500\)/],
  ])('reports a %s as an app error', async (_name, status, message) => {
    upstream.mockResolvedValue(new Response(`secret ${KEY}`, { status }));
    const failure = login(KEY);
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow(message);
    await expect(failure).rejects.not.toThrow(KEY);
  });

  it('reports no signal without exposing the request', async () => {
    upstream.mockRejectedValue(new Error('network down'));
    await expect(distanceMatrix([A, B], KEY)).rejects.toThrow(/did not respond/);
  });

  it('rejects an empty key without calling out', async () => {
    await expect(login('')).rejects.toThrow(/ORS_API_KEY|key/i);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects overly long search text without calling out', async () => {
    await expect(geocode('x'.repeat(201), KEY, signal)).rejects.toThrow(/under 200/);
    expect(upstream).not.toHaveBeenCalled();
  });
});
