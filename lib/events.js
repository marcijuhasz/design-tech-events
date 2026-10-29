import { classify } from './classify.js';
import { distanceKm, geocode } from './geo.js';
import { fetchEventbrite } from '../sources/eventbrite.js';
import { fetchLuma } from '../sources/luma.js';
import { fetchMeetup } from '../sources/meetup.js';

// Shared by the local server (server.js) and the Vercel function (api/events.js).

const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_LIMIT_MS = 24 * 3600 * 1000;

// On Vercel the CDN caches each location's response (s-maxage), so a burst of visitors
// reaches Luma/Meetup/Eventbrite only once per window. Browsers always revalidate (max-age=0).
const CACHE_HEALTHY = 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600';
const CACHE_DEGRADED = 'public, max-age=0, s-maxage=120';

const SOURCES = { luma: fetchLuma, meetup: fetchMeetup, eventbrite: fetchEventbrite };

// Per-source cache of successful fetches only, so one blocked source (e.g. rate-limited)
// can fall back to its last good results without hiding fresh data from the others.
// It lives in memory: long-lived locally, best-effort on serverless instances.
const cache = new Map();

async function fetchSource(name, location, refresh) {
  const key = `${name}|${location.lat.toFixed(3)},${location.lon.toFixed(3)}`;
  const cached = cache.get(key);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (!refresh && age < CACHE_TTL_MS) return { events: cached.events, status: { ok: true, count: cached.events.length } };

  try {
    const events = await SOURCES[name](location);
    cache.set(key, { at: Date.now(), events });
    return { events, status: { ok: true, count: events.length } };
  } catch (err) {
    console.warn(`[${name}]`, err.message);
    const error = String(err.message || err);
    if (age < STALE_LIMIT_MS) {
      return { events: cached.events, status: { ok: true, stale: true, count: cached.events.length, error } };
    }
    return { events: [], status: { ok: false, count: 0, error } };
  }
}

export async function gatherEvents(address, { refresh = false } = {}) {
  const location = await geocode(address);
  const names = Object.keys(SOURCES);
  const results = await Promise.all(names.map((n) => fetchSource(n, location, refresh)));

  const sources = {};
  let raw = [];
  results.forEach(({ events, status }, i) => {
    sources[names[i]] = status;
    raw = raw.concat(events);
  });

  const now = Date.now();
  const events = dedupe(
    raw
      .filter((e) => e.title && e.start)
      .filter((e) => {
        const end = e.end ? Date.parse(e.end) : Date.parse(e.start) + 3 * 3600e3;
        return end > now;
      })
      .map((e) => {
        const { hints, ...rest } = e;
        const distance =
          e.lat != null && e.lon != null ? distanceKm(location.lat, location.lon, e.lat, e.lon) : null;
        return {
          ...rest,
          timezone: e.timezone || 'Europe/Budapest',
          categories: classify(e),
          distanceKm: distance == null ? null : Math.round(distance * 10) / 10,
        };
      }),
  ).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  return { location, sources, events, fetchedAt: new Date().toISOString() };
}

// The same meetup is often cross-posted (e.g. Meetup + Eventbrite); keep one card with links to both.
function dedupe(events) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 32);
  const byKey = new Map();
  for (const e of events) {
    const key = `${norm(e.title)}|${e.start.slice(0, 10)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...e, alsoOn: [] });
      continue;
    }
    if (e.source !== existing.source && !existing.alsoOn.some((a) => a.source === e.source)) {
      existing.alsoOn.push({ source: e.source, url: e.url });
    }
    existing.categories = [...new Set([...existing.categories, ...e.categories])];
    for (const field of ['end', 'image', 'description', 'venue', 'address', 'lat', 'lon', 'distanceKm']) {
      if (existing[field] == null || existing[field] === '') existing[field] = e[field];
    }
  }
  return [...byKey.values()];
}

// Handles GET /api/events?location=…[&refresh] and returns what to send back.
// Results are cached for less time when a source failed, so they recover quickly.
export async function eventsResponse(searchParams) {
  const address = searchParams.get('location') || process.env.DEFAULT_LOCATION || 'Budapest, Hungary';
  try {
    const body = await gatherEvents(address, { refresh: searchParams.has('refresh') });
    const healthy = Object.values(body.sources).every((s) => s.ok && !s.stale);
    return { status: 200, cacheControl: healthy ? CACHE_HEALTHY : CACHE_DEGRADED, body };
  } catch (err) {
    return { status: 400, cacheControl: 'no-store', body: { error: err.message } };
  }
}
