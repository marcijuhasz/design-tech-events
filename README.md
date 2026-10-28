# Design × Tech Events

A small local app that gathers upcoming **design and tech events** near any address (Budapest by default)
from **Luma**, **Meetup** and **Eventbrite**, lets you pick the ones you like, and adds them to
**Google Calendar** or **Outlook** with one click.

## Run it

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
- In the pane, every pick has **Open event ↗** (the event's page) and **Add to calendar ▾**, which opens a prefilled event in
  Google Calendar, Outlook.com or Outlook (Microsoft 365), or downloads an `.ics` file (Apple Calendar and others).
  **Copy all links** puts every pick's title, date and link on your clipboard.

Options: `PORT=5000 npm start` changes the port; `DEFAULT_LOCATION="Vienna, Austria" npm start` changes the
location used when none is given.

## How it works

| File | What it does |
| --- | --- |
| `server.js` | HTTP server, `/api/events?location=…`, merges sources, de-duplicates cross-posted events, 15-minute cache |
| `lib/geo.js` | Geocodes the address with OpenStreetMap Nominatim, distance maths |
| `lib/classify.js` | Keyword classifier (English + Hungarian) that tags events as design and/or tech |
| `sources/luma.js` | Luma's public discover feed around the coordinates |
| `sources/meetup.js` | Meetup's search pages (Technology category + design/UX/AI/developer/startup keywords) |
| `sources/eventbrite.js` | Eventbrite's search pages for design/UX/tech/AI/startup/developer/data keywords |
| `public/` | The single-page UI; `calendar.js` builds the Google/Outlook links and `.ics` files |

The sources are public web pages and feeds, not official APIs, so one of them can break if the site changes.
When that happens the app keeps working with the others and shows which source couldn't be reached.
Events the classifier doesn't tag as design or tech are hidden.
To tune what counts as design or tech, edit the keyword lists in `lib/classify.js`.
