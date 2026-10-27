import { extractJsonAfter, fetchText, zonedToUtc } from '../lib/http.js';
import { slugify } from '../lib/geo.js';

// Kept short on purpose: Eventbrite rate-limits bursts of search-page requests.
const KEYWORDS = ['design', 'ux', 'tech', 'ai', 'startup'];

function eventbriteLocation(location) {
  const city = slugify(location.city);
  if (location.countryCode === 'us' && location.stateCode) return `${location.stateCode}--${city}`;
  return `${slugify(location.country)}--${city}`;
}

export async function fetchEventbrite(location) {
  const slug = eventbriteLocation(location);
  const results = await Promise.allSettled(KEYWORDS.map((kw) => fetchKeyword(slug, kw)));
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw results[0].reason;

  const byId = new Map();
  for (const r of ok) for (const e of r.value) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()];
}

async function fetchKeyword(slug, keyword) {
  const html = await fetchText(`https://www.eventbrite.com/d/${slug}/${keyword}/`);
  const data = extractJsonAfter(html, 'window.__SERVER_DATA__');
  const results = data?.search_data?.events?.results || [];

  return results
    .filter((e) => !e.is_cancelled)
    .map((e) => {
      const tz = e.timezone || 'UTC';
      const venue = e.primary_venue || {};
      const tags = (e.tags || []).map((t) => t.display_name);
      const hints = [];
      if (tags.includes('Science & Technology')) hints.push('tech');
      if (tags.includes('Design')) hints.push('design');
      return {
        id: `eventbrite:${e.id}`,
        source: 'eventbrite',
        title: e.name?.trim(),
        start: zonedToUtc(e.start_date, e.start_time, tz).toISOString(),
        end: e.end_date ? zonedToUtc(e.end_date, e.end_time, tz).toISOString() : null,
        timezone: tz,
        url: e.url,
        image: e.image?.url || null,
        organizer: e.primary_organizer?.name || '',
        description: e.summary || '',
        venue: venue.name || '',
        address: venue.address?.localized_address_display || '',
        online: Boolean(e.is_online_event),
        lat: venue.address?.latitude ? Number(venue.address.latitude) : undefined,
        lon: venue.address?.longitude ? Number(venue.address.longitude) : undefined,
        tags,
        hints,
      };
    });
}
