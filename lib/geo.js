import { fetchJson } from './http.js';

const cache = new Map();

// Turns a free-form address into coordinates plus the city/country slugs the sources need.
export async function geocode(query) {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    'accept-language': 'en',
  });
  const [hit] = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'design-tech-events/1.0 (local event finder)' },
  });
  if (!hit) throw new Error(`Couldn't find a place called "${query}"`);

  const a = hit.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.state || a.county || hit.name;
  const location = {
    query,
    label: hit.display_name,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    city,
    country: a.country,
    countryCode: (a.country_code || '').toLowerCase(),
    stateCode: (a['ISO3166-2-lvl4'] || '').split('-')[1]?.toLowerCase(),
  };
  cache.set(key, location);
  return location;
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function slugify(text = '') {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
