import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classify } from './lib/classify.js';
import { distanceKm, geocode } from './lib/geo.js';
import { fetchEventbrite } from './sources/eventbrite.js';
import { fetchLuma } from './sources/luma.js';
import { fetchMeetup } from './sources/meetup.js';

const PORT = Number(process.env.PORT) || 4321;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const CACHE_TTL_MS = 15 * 60 * 1000;

const STALE_LIMIT_MS = 24 * 3600 * 1000;

const SOURCES = { luma: fetchLuma, meetup: fetchMeetup, eventbrite: fetchEventbrite };

// Per-source cache of successful fetches only, so one blocked source (e.g. rate-limited)
// can fall back to its last good results without hiding fresh data from the others.
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

async function gatherEvents(address, { refresh = false } = {}) {
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/events') {
    const address = url.searchParams.get('location') || process.env.DEFAULT_LOCATION || 'Budapest, Hungary';
    try {
      sendJson(res, 200, await gatherEvents(address, { refresh: url.searchParams.has('refresh') }));
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  const relative = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Design & Tech Events running at http://localhost:${PORT}`);
});
