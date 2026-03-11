import axios from 'axios';

// ── Primary: Nominatim (OpenStreetMap) ───────────────────────────────────────
const NOM_BASE = 'https://nominatim.openstreetmap.org';
// ── Fallback: Photon (komoot.io) — same OSM data, no rate limits ─────────────
const PHOTON_BASE = 'https://photon.komoot.io';
// Maharashtra bounding box used by Photon: west,south,east,north
const MH_BBOX = '72.6,15.6,80.9,22.1';

const headers = { 'User-Agent': 'DeliveryTrackerApp/1.0' };

// ── Shared result shape ───────────────────────────────────────────────────────
export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state_district?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  boundingbox: string[];
}

// ── Photon types ──────────────────────────────────────────────────────────────
interface PhotonProps {
  osm_id?: number;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  county?: string;
  district?: string;
  suburb?: string;
  neighbourhood?: string;
}

interface PhotonFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: PhotonProps;
}

interface PhotonResponse {
  features: PhotonFeature[];
}

// ── Photon helpers ────────────────────────────────────────────────────────────
function photonFeatureToResult(f: PhotonFeature, index = 0): NominatimResult {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const city = p.city || p.town || p.village;
  const displayParts = [
    p.name,
    p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street,
    p.suburb || p.neighbourhood,
    city,
    p.state,
    p.postcode,
    p.country,
  ].filter(Boolean);

  return {
    place_id: p.osm_id ?? index,
    display_name: displayParts.join(', '),
    lat: String(lat),
    lon: String(lon),
    address: {
      house_number: p.housenumber,
      road: p.street,
      suburb: p.suburb || p.neighbourhood,
      city,
      state_district: p.county || p.district,
      state: p.state,
      postcode: p.postcode,
      country: p.country,
      country_code: p.countrycode?.toLowerCase(),
    },
    boundingbox: [],
  };
}

// ── Nominatim helpers ─────────────────────────────────────────────────────────
function isBlocked(data: unknown): boolean {
  return typeof data === 'string' && data.includes('Access denied');
}

async function nominatimGeocode(query: string): Promise<NominatimResult | null> {
  const res = await axios.get(`${NOM_BASE}/search`, {
    params: { q: query, format: 'json', addressdetails: 1, limit: 1 },
    headers,
    validateStatus: () => true,
    timeout: 5000,
  });
  if (isBlocked(res.data)) throw new Error('nominatim:blocked');
  if (!Array.isArray(res.data) || !res.data.length) return null;
  return res.data[0] as NominatimResult;
}

async function nominatimReverse(lat: number, lon: number): Promise<NominatimResult | null> {
  const res = await axios.get(`${NOM_BASE}/reverse`, {
    params: { lat, lon, format: 'json', addressdetails: 1 },
    headers,
    validateStatus: () => true,
    timeout: 5000,
  });
  if (isBlocked(res.data)) throw new Error('nominatim:blocked');
  const d = res.data as Record<string, unknown>;
  if (!d?.place_id) return null;
  return d as unknown as NominatimResult;
}

async function nominatimAutocomplete(query: string): Promise<NominatimResult[]> {
  const res = await axios.get(`${NOM_BASE}/search`, {
    params: { q: query, format: 'json', addressdetails: 1, limit: 7 },
    headers,
    validateStatus: () => true,
    timeout: 5000,
  });
  if (isBlocked(res.data)) throw new Error('nominatim:blocked');
  if (!Array.isArray(res.data)) return [];
  return res.data as NominatimResult[];
}

// ── Photon fallback helpers ───────────────────────────────────────────────────
async function photonGeocode(query: string): Promise<NominatimResult | null> {
  const res = await axios.get<PhotonResponse>(`${PHOTON_BASE}/api`, {
    params: { q: query, limit: 1, lang: 'en', bbox: MH_BBOX },
    headers,
  });
  const features = res.data.features;
  if (!features?.length) return null;
  return photonFeatureToResult(features[0]);
}

async function photonReverse(lat: number, lon: number): Promise<NominatimResult | null> {
  const res = await axios.get<PhotonResponse>(`${PHOTON_BASE}/reverse`, {
    params: { lat, lon, limit: 1 },
    headers,
  });
  const features = res.data.features;
  if (!features?.length) return null;
  return photonFeatureToResult(features[0]);
}

async function photonAutocomplete(query: string): Promise<NominatimResult[]> {
  const res = await axios.get<PhotonResponse>(`${PHOTON_BASE}/api`, {
    params: { q: query, limit: 7, lang: 'en', bbox: MH_BBOX },
    headers,
  });
  return (res.data.features ?? []).map((f, i) => photonFeatureToResult(f, i));
}

// ── Public API: Nominatim first, Photon fallback ──────────────────────────────
export async function geocode(query: string): Promise<NominatimResult | null> {
  try {
    const result = await nominatimGeocode(query);
    if (result) { console.log('[geocode] nominatim ok'); return result; }
  } catch (err) {
    console.warn('[geocode] nominatim failed, trying photon:', (err as Error).message);
  }
  return photonGeocode(query);
}

export async function reverseGeocode(lat: number, lon: number): Promise<NominatimResult | null> {
  try {
    const result = await nominatimReverse(lat, lon);
    if (result) { console.log('[reverse] nominatim ok'); return result; }
  } catch (err) {
    console.warn('[reverse] nominatim failed, trying photon:', (err as Error).message);
  }
  return photonReverse(lat, lon);
}

export async function autocomplete(query: string): Promise<NominatimResult[]> {
  try {
    const results = await nominatimAutocomplete(query);
    if (results.length) { console.log('[autocomplete] nominatim ok'); return results; }
  } catch (err) {
    console.warn('[autocomplete] nominatim failed, trying photon:', (err as Error).message);
  }
  return photonAutocomplete(query);
}
