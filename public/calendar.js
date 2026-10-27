// Builds "add to calendar" links for Google and Outlook, plus .ics files for everything else.
// No sign-in needed: the links open a prefilled event in the user's own calendar to save.

const DEFAULT_DURATION_MS = 2 * 3600e3;

function times(e) {
  const start = new Date(e.start);
  const end = e.end ? new Date(e.end) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  return { start, end };
}

function details(e) {
  const description = e.description?.length > 700 ? `${e.description.slice(0, 700)}…` : e.description;
  return [description, `Event page: ${e.url}`].filter(Boolean).join('\n\n');
}

function where(e) {
  const place = [e.venue, e.address].filter(Boolean).join(', ');
  return place || (e.online ? 'Online' : '');
}

// URLSearchParams encodes spaces as "+", which Outlook shows literally, so encode by hand.
function query(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

const compactUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleUrl(e) {
  const { start, end } = times(e);
  return `https://calendar.google.com/calendar/render?${query({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${compactUtc(start)}/${compactUtc(end)}`,
    details: details(e),
    location: where(e),
  })}`;
}

// host: "outlook.live.com" for personal accounts, "outlook.office.com" for work/school (Microsoft 365).
export function outlookUrl(e, host) {
  const { start, end } = times(e);
  return `https://${host}/calendar/0/action/compose?${query({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: details(e),
    location: where(e),
    allday: 'false',
  })}`;
}

function icsText(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 wants lines of at most 75 octets, continued with a leading space.
function fold(line) {
  const bytes = new TextEncoder();
  const out = [];
  let current = '';
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
    }
    current += ch;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function toIcs(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Design x Tech Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  const stamp = compactUtc(new Date());
  for (const e of events) {
    const { start, end } = times(e);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id.replace(/[^a-z0-9]/gi, '-')}@design-tech-events`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${compactUtc(start)}`,
      `DTEND:${compactUtc(end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText(details(e))}`,
      `LOCATION:${icsText(where(e))}`,
      `URL:${e.url}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function downloadIcs(events) {
  const blob = new Blob([toIcs(events)], { type: 'text/calendar;charset=utf-8' });
  const name =
    events.length === 1
      ? events[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event'
      : `design-tech-events-${events.length}`;
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}.ics` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
