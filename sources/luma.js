import { fetchJson } from '../lib/http.js';

// Luma's public discover feed (the one lu.ma/discover uses); returns events around a coordinate.
export async function fetchLuma(location) {
  const events = [];
  let cursor;
  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      pagination_limit: '50',
    });
    if (cursor) params.set('pagination_cursor', cursor);
    const data = await fetchJson(`https://api.lu.ma/discover/get-paginated-events?${params}`);

    for (const entry of data.entries || []) {
      const e = entry.event;
      const geo = e.geo_address_info || {};
      events.push({
        id: `luma:${e.api_id}`,
        source: 'luma',
        title: e.name,
        start: e.start_at,
        end: e.end_at,
        timezone: e.timezone,
        url: `https://lu.ma/${e.url}`,
        image: e.cover_url,
        organizer: entry.calendar?.name || entry.hosts?.[0]?.name || '',
        // The feed has no event description; the host's bio is too generic to classify on.
        description: '',
        venue: geo.address || '',
        address: geo.full_address || [geo.sublocality, geo.city_state].filter(Boolean).join(', '),
        online: e.location_type === 'online',
        lat: e.coordinate?.latitude,
        lon: e.coordinate?.longitude,
        tags: [],
        hints: [],
      });
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return events;
}
