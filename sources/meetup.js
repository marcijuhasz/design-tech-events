import { fetchText } from '../lib/http.js';

const TECHNOLOGY_CATEGORY = '546';

// Each query returns ~12 events from Meetup's server-rendered search page, so we run several.
const QUERIES = [
  { categoryId: TECHNOLOGY_CATEGORY },
  { keywords: 'design' },
  { keywords: 'ux' },
  { keywords: 'product design' },
  { keywords: 'AI' },
  { keywords: 'developer' },
  { keywords: 'startup' },
];

function meetupLocation(location) {
  const cc = location.countryCode;
  if (cc === 'us' && location.stateCode) return `us--${location.stateCode}--${location.city}`;
  return `${cc}--${location.city}`;
}

export async function fetchMeetup(location) {
  const slug = meetupLocation(location);
  const results = await Promise.allSettled(QUERIES.map((q) => fetchQuery(slug, q)));
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw results[0].reason;

  const byId = new Map();
  for (const r of ok) for (const e of r.value) if (!byId.has(e.id)) byId.set(e.id, e);

  // Meetup mixes in events from other countries; keep them only if you can join online.
  return [...byId.values()].flatMap(({ venueCountry, ...e }) => {
    if (!venueCountry || venueCountry === location.countryCode) return [e];
    if (!e.online && !e.hybrid) return [];
    return [{ ...e, online: true, hybrid: false, venue: '', address: '' }];
  });
}

async function fetchQuery(slug, query) {
  const params = new URLSearchParams({ source: 'EVENTS', location: slug, ...query });
  const html = await fetchText(`https://www.meetup.com/find/?${params}`);
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!match) return [];
  const state = JSON.parse(match[1]).props?.pageProps?.__APOLLO_STATE__ || {};
  const deref = (v) => (v && v.__ref ? state[v.__ref] : v);

  return Object.keys(state)
    .filter((k) => k.startsWith('Event:'))
    .filter((k) => state[k].title && state[k].dateTime)
    .map((k) => {
      const e = state[k];
      const group = deref(e.group) || {};
      const venue = deref(e.venue) || {};
      const photo = deref(e.displayPhoto) || deref(e.featuredEventPhoto) || {};
      return {
        id: `meetup:${e.id}`,
        source: 'meetup',
        title: e.title?.trim(),
        start: new Date(e.dateTime).toISOString(),
        end: e.endTime ? new Date(e.endTime).toISOString() : null,
        timezone: group.timezone,
        url: e.eventUrl,
        image: photo.highResUrl || null,
        organizer: group.name || '',
        description: (e.description || '').slice(0, 1200),
        venue: venue.name && venue.name !== 'Online event' ? venue.name : '',
        address: venue.address || '',
        online: e.eventType === 'ONLINE',
        hybrid: e.eventType === 'HYBRID',
        venueCountry: venue.country?.toLowerCase(),
        lat: venue.lat,
        lon: venue.lng ?? venue.lon,
        tags: [],
        hints: query.categoryId === TECHNOLOGY_CATEGORY ? ['tech'] : [],
      };
    });
}
