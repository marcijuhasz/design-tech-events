# Design × Tech Events

A small app that gathers upcoming **design and tech events** near any address (Budapest by default)
from **Luma**, **Meetup** and **Eventbrite**, lets you pick the ones you like, and adds them to
**Google Calendar** or **Outlook** with one click.

## Run it locally

Needs Node.js 18 or newer. There is nothing to install.

```bash
npm start
```

Then open http://localhost:4321.

- Type any address or city in the headline (“Vienna”, “Andrássy út 1, Budapest”, “Berlin Mitte”) and press **Gather events**.
  The app remembers your last location.
- Filter by **Design / Tech**, date range, distance, online vs in-person, or search text.
- **+ Pick** adds an event to the **Your picks** pane, which appears on the right once you've picked something
  (on a phone it's a sheet at the bottom; tap it to open). Picks are saved in your browser and sorted by date, with past events at the bottom.
- In the pane, every pick has **Open event ↗** (the event's page), **Map ↗**, and **Add to calendar ↗**, which opens a prefilled
  event in Google Calendar, Outlook.com or Outlook (Microsoft 365), or downloads an `.ics` file (Apple Calendar and others).
  **Copy all links** puts every pick's title, date and link on your clipboard.

Options: `PORT=5000 npm start` changes the port; `DEFAULT_LOCATION="Vienna, Austria" npm start` changes the
location used when none is given.

## Deploy to Vercel

The repository is ready for Vercel as is; `vercel.json` holds the settings.

1. Push the repository to GitHub.
2. On vercel.com: **Add New → Project**, import the repository, keep **Framework Preset: Other**, and click **Deploy**.
3. Every push to `main` then updates the live site. A bad deploy can be undone from **Deployments → Instant Rollback**.

On Vercel, `public/` is served as static files and `/api/events` runs as the serverless function in `api/events.js`
(in the Frankfurt region, up to 30 seconds). Vercel's CDN caches each location's results for 15 minutes
(2 minutes if a source failed), so many visitors at once don't each trigger requests to Luma, Meetup and Eventbrite.
Locally, `npm start` runs the same code through `server.js`.

## How it works

| File | What it does |
| --- | --- |
| `lib/events.js` | Gathers events from all sources, merges and de-duplicates cross-posted events, caching rules |
| `server.js` | Local server: serves `public/` and `/api/events` |
| `api/events.js` | The same `/api/events` endpoint as a Vercel function |
| `lib/geo.js` | Geocodes the address with OpenStreetMap Nominatim, distance maths |
| `lib/classify.js` | Keyword classifier (English + Hungarian) that tags events as design and/or tech |
| `sources/luma.js` | Luma's public discover feed around the coordinates |
| `sources/meetup.js` | Meetup's search pages (Technology category + design/UX/AI/developer/startup keywords) |
| `sources/eventbrite.js` | Eventbrite's search pages for design/UX/tech/AI/startup keywords |
| `public/` | The single-page UI; `calendar.js` builds the Google/Outlook links and `.ics` files |
| `public/fonts/` | Self-hosted Inter and Instrument Serif (SIL Open Font License), so no requests go to Google |

The sources are public web pages and feeds, not official APIs, so one of them can break if the site changes.
When that happens the app keeps working with the others and shows which source couldn't be reached.
Events the classifier doesn't tag as design or tech are hidden.
To tune what counts as design or tech, edit the keyword lists in `lib/classify.js`.

The app has no tracking, accounts or database: your location, filters and picks are stored only in your browser.
