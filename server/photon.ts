import type { Place } from '../src/model/types.js';
import { ProviderError, fetchJson } from './provider.js';

/**
 * Photon searches OpenStreetMap as you type and needs no key. ORS's geocoder has
 * no house numbers for much of Toronto, so it only finds the street's midpoint.
 * The public server has fair-use throttling and no uptime guarantee.
 */
const URL_BASE = 'https://photon.komoot.io/api/';
const SERVICE = 'Address search';
const TORONTO = { lat: 43.7, lng: -79.4 };
/** Hamilton to Oshawa and beyond. It also covers part of New York, hence the country check. */
const SEARCH_AREA = '-80.6,43.0,-78.3,44.6';
const FETCH_LIMIT = 15;
const MAX_RESULTS = 5;
/** Named stops like "Pharmacy" station match address text but are never the job site. */
const TRANSIT_KEYS = new Set(['highway', 'railway', 'public_transport']);

type PhotonProperties = {
  name?: unknown;
  housenumber?: unknown;
  street?: unknown;
  city?: unknown;
  state?: unknown;
  postcode?: unknown;
  countrycode?: unknown;
  type?: unknown;
  osm_key?: unknown;
  osm_value?: unknown;
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const join = (parts: string[]): string => parts.filter(Boolean).join(', ');

/** Returns null for results that can't be a job site. */
function toPlace(feature: unknown): Place | null {
  const { geometry, properties } = (feature ?? {}) as {
    geometry?: { coordinates?: unknown };
    properties?: PhotonProperties;
  };
  const coordinates = geometry?.coordinates;
  if (!properties || !Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as unknown[];
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (text(properties.countrycode).toUpperCase() !== 'CA') return null;

  const name = text(properties.name);
  const number = text(properties.housenumber);
  const street = text(properties.street);
  const city = text(properties.city);
  const state = text(properties.state);
  const postcode = text(properties.postcode);
  const type = text(properties.type);
  const point = { lat, lng };

  if (type === 'street') {
    // Without the postcode, segments of one street collapse into one result.
    return name ? { ...point, label: join([name, city, state]), approximate: true } : null;
  }
  if (text(properties.osm_value) === 'postcode') {
    return name ? { ...point, label: join([name, city, state]), approximate: true } : null;
  }

  const location = join([city, state, postcode]);
  if (number && street) {
    const address = `${number} ${street}`;
    const showName = name && name !== address;
    return { ...point, label: join([showName ? name : '', address, location]), approximate: false };
  }
  if (type === 'house' && name && !TRANSIT_KEYS.has(text(properties.osm_key))) {
    return { ...point, label: join([name, street, location]), approximate: false };
  }
  return null;
}

/** Exact addresses first, then street or postal code matches. Provider order is kept within each. */
export function readPlaces(body: unknown): Place[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new ProviderError('Address search sent a bad response.', 502);

  const byLabel = new Map<string, Place>();
  for (const feature of features) {
    const place = toPlace(feature);
    if (place && !byLabel.has(place.label)) byLabel.set(place.label, place);
  }
  const places = [...byLabel.values()];
  return [...places.filter((p) => !p.approximate), ...places.filter((p) => p.approximate)].slice(0, MAX_RESULTS);
}

export async function photonGeocode(query: string): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(FETCH_LIMIT),
    lat: String(TORONTO.lat),
    lon: String(TORONTO.lng),
    bbox: SEARCH_AREA,
    lang: 'en',
  });
  return readPlaces(
    await fetchJson(SERVICE, `${URL_BASE}?${params}`, {
      method: 'GET',
      // A phone's WebView sends its own User-Agent.
      ...(typeof window === 'undefined' ? { headers: { 'User-Agent': 'route-planner-app/1.0' } } : {}),
    }),
  );
}
