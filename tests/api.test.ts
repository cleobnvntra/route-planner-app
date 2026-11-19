import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import auth from '../api/auth.js';
import geocode from '../api/geocode.js';
import matrix from '../api/matrix.js';

const PASSWORD = 'test-password';
const KEY = 'secret-ors-key';
const headers = { 'x-app-password': PASSWORD, 'Content-Type': 'application/json' };
const A = { lat: 43.7, lng: -79.4 };
const B = { lat: 43.8, lng: -79.3 };

const postMatrix = (body: unknown, init: RequestInit = { headers }) =>
  matrix.fetch(
    new Request('http://x/api/matrix', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    }),
  );
const getGeocode = (text: string) =>
  geocode.fetch(new Request(`http://x/api/geocode?text=${encodeURIComponent(text)}`, { headers }));

let upstream: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('APP_PASSWORD', PASSWORD);
  vi.stubEnv('ORS_API_KEY', KEY);
  upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('password', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const post = (password: unknown) =>
      auth.fetch(new Request('http://x/api/auth', { method: 'POST', body: JSON.stringify({ password }) }));
    expect((await post(PASSWORD)).status).toBe(200);
    expect((await post('nope')).status).toBe(401);
    expect((await post(123)).status).toBe(401);
  });

  it('fails closed when APP_PASSWORD is unset', async () => {
    vi.stubEnv('APP_PASSWORD', '');
    expect((await postMatrix({ points: [A, B] })).status).toBe(500);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('blocks routing calls without the password', async () => {
    const response = await postMatrix({ points: [A, B] }, { headers: {} });
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('/api/matrix', () => {
  it('sends all points in one driving-car request and converts seconds to minutes', async () => {
    upstream.mockResolvedValue(
      Response.json({
        distances: [
          [0, 12.5],
          [12.5, 0],
        ],
        durations: [
          [0, 600],
          [null, 0],
        ],
      }),
    );
    const response = await postMatrix({ points: [A, B] });
    expect(await response.json()).toEqual({
      distancesKm: [
        [0, 12.5],
        [12.5, 0],
      ],
      durationsMin: [
        [0, 10],
        [null, 0],
      ],
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.heigit.org/openrouteservice/v2/matrix/driving-car');
    expect((init.headers as Record<string, string>).Authorization).toBe(KEY);
    expect(JSON.parse(init.body as string)).toEqual({
      locations: [
        [-79.4, 43.7],
        [-79.3, 43.8],
      ],
      metrics: ['distance', 'duration'],
      units: 'km',
    });
  });

  it.each([
    ['bad JSON', 'not json'],
    ['no points', {}],
    ['one point', { points: [A] }],
    ['too many points', { points: Array(51).fill(A) }],
    ['bad latitude', { points: [A, { lat: 95, lng: 0 }] }],
    ['text longitude', { points: [A, { lat: 43, lng: '-79' }] }],
    ['null point', { points: [A, null] }],
  ])('rejects %s', async (_name, body) => {
    expect((await postMatrix(body)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects other methods', async () => {
    const response = await matrix.fetch(new Request('http://x/api/matrix', { headers }));
    expect(response.status).toBe(405);
  });

  it('rejects a matrix of the wrong size from upstream', async () => {
    upstream.mockResolvedValue(Response.json({ distances: [[0]], durations: [[0]] }));
    expect((await postMatrix({ points: [A, B] })).status).toBe(502);
  });

  it('passes rate limits through and never leaks the key', async () => {
    upstream.mockResolvedValueOnce(new Response(`bad key ${KEY}`, { status: 429 }));
    const limited = await postMatrix({ points: [A, B] });
    expect(limited.status).toBe(429);
    expect(JSON.stringify(await limited.json())).not.toContain(KEY);

    upstream.mockResolvedValueOnce(new Response(`bad key ${KEY}`, { status: 500 }));
    const failed = await postMatrix({ points: [A, B] });
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain(KEY);
  });

  it('reports a network failure as a timeout', async () => {
    upstream.mockRejectedValue(new Error(`failed https://x?api_key=${KEY}`));
    const response = await postMatrix({ points: [A, B] });
    expect(response.status).toBe(504);
    expect(JSON.stringify(await response.json())).not.toContain(KEY);
  });

  it('fails clearly when ORS_API_KEY is unset', async () => {
    vi.stubEnv('ORS_API_KEY', '');
    const response = await postMatrix({ points: [A, B] });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'ORS_API_KEY is not set on the server.' });
  });
});

describe('/api/geocode', () => {
  const feature = (properties: Record<string, string>, coordinates: unknown[] = [-79.3, 43.7]) => ({
    geometry: { coordinates },
    properties: { countrycode: 'CA', city: 'Toronto', state: 'Ontario', type: 'house', ...properties },
  });
  const places = async (features: unknown[]) => {
    upstream.mockResolvedValue(Response.json({ features }));
    const body = (await (await getGeocode('109 huntingdale')).json()) as { places: Record<string, unknown>[] };
    return body.places;
  };

  it('asks Photon near Toronto and never sends the routing key', async () => {
    await places([]);
    const url = new URL(upstream.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/');
    expect(url.searchParams.get('q')).toBe('109 huntingdale');
    expect(url.searchParams.get('lat')).toBe('43.7');
    expect(url.searchParams.get('lon')).toBe('-79.4');
    expect(url.searchParams.get('bbox')).toBe('-80.6,43.0,-78.3,44.6');
    const init = upstream.mock.calls[0]?.[1] as RequestInit;
    expect(url.search + JSON.stringify(init.headers)).not.toContain(KEY);
  });

  it('works without ORS_API_KEY', async () => {
    vi.stubEnv('ORS_API_KEY', '');
    upstream.mockResolvedValue(Response.json({ features: [] }));
    expect((await getGeocode('109 huntingdale')).status).toBe(200);
  });

  it('returns exact house addresses with coordinates', async () => {
    const result = await places([
      feature({ housenumber: '109', street: 'Huntingdale Boulevard', postcode: 'M1W 1R1' }, [-79.32319, 43.79538]),
    ]);
    expect(result).toEqual([
      {
        label: '109 Huntingdale Boulevard, Toronto, Ontario, M1W 1R1',
        lat: 43.79538,
        lng: -79.32319,
        approximate: false,
      },
    ]);
  });

  it('merges identical addresses and keeps different postal codes apart', async () => {
    const result = await places([
      feature({ housenumber: '1810', street: 'Pharmacy Avenue', postcode: 'M1T 1A4' }, [-79.31784, 43.77575]),
      feature({ housenumber: '1810', street: 'Pharmacy Avenue', postcode: 'M1T 1A4' }, [-79.31774, 43.77617]),
      feature({ housenumber: '109', street: 'Huntingdale Boulevard', postcode: 'M1W 1R1' }),
      feature({ housenumber: '109', street: 'Huntingdale Boulevard', postcode: 'M1W 2N9' }),
    ]);
    expect(result.map((p) => p.label)).toEqual([
      '1810 Pharmacy Avenue, Toronto, Ontario, M1T 1A4',
      '109 Huntingdale Boulevard, Toronto, Ontario, M1W 1R1',
      '109 Huntingdale Boulevard, Toronto, Ontario, M1W 2N9',
    ]);
    expect(result[0]?.lat).toBe(43.77575);
  });

  it('flags street and postal code matches, lists them last and merges street segments', async () => {
    const result = await places([
      feature({ type: 'street', name: 'Pharmacy Avenue', postcode: 'M1L 2L9', osm_key: 'highway' }),
      feature({ type: 'street', name: 'Pharmacy Avenue', postcode: 'M1R 2H3', osm_key: 'highway' }),
      feature({ type: 'other', name: 'M1T 1A4', osm_key: 'place', osm_value: 'postcode' }),
      feature({ housenumber: '1810', street: 'Pharmacy Avenue', postcode: 'M1T 1A4' }),
    ]);
    expect(result.map((p) => [p.label, p.approximate])).toEqual([
      ['1810 Pharmacy Avenue, Toronto, Ontario, M1T 1A4', false],
      ['Pharmacy Avenue, Toronto, Ontario', true],
      ['M1T 1A4, Toronto, Ontario', true],
    ]);
  });

  it('keeps named places and shows their address', async () => {
    const result = await places([
      feature({ name: 'Toronto City Hall', housenumber: '100', street: 'Queen Street West', postcode: 'M5H 2N2' }),
    ]);
    expect(result[0]?.label).toBe('Toronto City Hall, 100 Queen Street West, Toronto, Ontario, M5H 2N2');
  });

  it('drops transit stops, other countries, broad areas and malformed results', async () => {
    const result = await places([
      feature({ name: 'Pharmacy', street: 'Eglinton Avenue East', osm_key: 'railway', osm_value: 'station' }),
      feature({ name: 'Main @ Ray', street: 'Main Street West', osm_key: 'highway', osm_value: 'bus_stop' }),
      feature({ housenumber: '109', street: 'Fox Hunt Lane', countrycode: 'US' }),
      feature({ type: 'city', name: 'Toronto', osm_key: 'place', osm_value: 'city' }),
      feature({ housenumber: '1', street: 'Bad Coords' }, ['x', 43]),
      { properties: { housenumber: '2', street: 'No Geometry', countrycode: 'CA' } },
      null,
    ]);
    expect(result).toEqual([]);
  });

  it('returns at most 5 results', async () => {
    const many = Array.from({ length: 9 }, (_, i) => feature({ housenumber: String(i), street: 'Main St' }));
    expect(await places(many)).toHaveLength(5);
  });

  it('reports a bad or failed response', async () => {
    upstream.mockResolvedValueOnce(Response.json({ nope: true }));
    expect((await getGeocode('109 huntingdale')).status).toBe(502);
    upstream.mockResolvedValueOnce(new Response('busy', { status: 429 }));
    expect((await getGeocode('109 huntingdale')).status).toBe(429);
    upstream.mockRejectedValueOnce(new Error('down'));
    expect((await getGeocode('109 huntingdale')).status).toBe(504);
  });

  it('rejects text that is too short or too long', async () => {
    expect((await getGeocode(' a ')).status).toBe(400);
    expect((await getGeocode('x'.repeat(201))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
