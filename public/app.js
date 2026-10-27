import { downloadIcs, googleUrl, outlookUrl } from './calendar.js';

const $ = (sel, root = document) => root.querySelector(sel);

const SOURCE_LABELS = { luma: 'Luma', meetup: 'Meetup', eventbrite: 'Eventbrite' };
const DEFAULT_LOCATION = 'Budapest, Hungary';
const KEEP_PAST_PICKS_MS = 30 * 864e5;
const DEFAULT_DURATION_MS = 2 * 3600e3;

// localStorage can be unavailable (private mode, blocked storage); the app works without it.
const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

const savedFilters = store.get('filters', {});
const state = {
  location: store.get('location', DEFAULT_LOCATION),
  data: null,
  filters: {
    category: savedFilters.category ?? 'all',
    windowDays: savedFilters.windowDays ?? 31,
    radiusKm: savedFilters.radiusKm ?? 25,
    online: savedFilters.online ?? false,
    everything: savedFilters.everything ?? false,
    sources: new Set(savedFilters.sources ?? Object.keys(SOURCE_LABELS)),
    query: '',
  },
  picks: new Map(
    store
      .get('picks', [])
      .filter((e) => endTime(e) > Date.now() - KEEP_PAST_PICKS_MS)
      .map((e) => [e.id, e]),
  ),
};

const els = {
  page: $('#page'),
  form: $('#location-form'),
  input: $('#location-input'),
  submit: $('#location-form button[type="submit"]'),
  status: $('#status'),
  list: $('#list'),
  category: $('#category-filter'),
  search: $('#search'),
  window: $('#window-filter'),
  radius: $('#radius-filter'),
  sources: $('#source-filter'),
  online: $('#online-filter'),
  everything: $('#everything-filter'),
  picks: $('#picks'),
  picksHead: $('.picks-head'),
  picksCount: $('#picks-count'),
  picksToggle: $('#picks-toggle'),
  picksList: $('#picks-list'),
  toast: $('#toast'),
  menuTemplate: $('#calendar-menu-template'),
};

// ---------- Data ----------

async function load({ refresh = false } = {}) {
  els.submit.disabled = true;
  closeMenu();
  els.list.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  setStatus(`Gathering events near ${escapeHtml(state.location)} from Luma, Meetup and Eventbrite…`);

  try {
    const params = new URLSearchParams({ location: state.location });
    if (refresh) params.set('refresh', '1');
    const res = await fetch(`/api/events?${params}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Something went wrong');
    state.data = body;
    render();
  } catch (err) {
    state.data = null;
    els.list.innerHTML = `
      <div class="empty-state">
        <h3>Couldn't gather events</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>`;
    setStatus(`<span class="err">${escapeHtml(err.message)}</span>`);
  } finally {
    els.submit.disabled = false;
  }
}

function persistFilters() {
  const { query, sources, ...rest } = state.filters;
  store.set('filters', { ...rest, sources: [...sources] });
}

function matches(e, { ignoreSource = false } = {}) {
  const f = state.filters;
  if (!ignoreSource && !f.sources.has(e.source) && !e.alsoOn.some((a) => f.sources.has(a.source))) return false;
  if (!f.everything && e.categories.length === 0) return false;
  if (f.category !== 'all' && !e.categories.includes(f.category)) return false;
  if (!f.online && e.online && !e.hybrid) return false;
  if (f.radiusKm && e.distanceKm != null && e.distanceKm > f.radiusKm) return false;
  if (f.windowDays && Date.parse(e.start) > Date.now() + f.windowDays * 864e5) return false;
  if (f.query) {
    const haystack = `${e.title} ${e.organizer} ${e.venue} ${e.address}`.toLowerCase();
    if (!haystack.includes(f.query)) return false;
  }
  return true;
}

function endTime(e) {
  return e.end ? Date.parse(e.end) : Date.parse(e.start) + DEFAULT_DURATION_MS;
}

// ---------- Event list ----------

function render() {
  if (!state.data) return;
  const { events } = state.data;
  const visible = events.filter((e) => matches(e));
  renderSourceChips(events);
  renderStatus(visible.length);

  if (!visible.length) {
    els.list.innerHTML = `
      <div class="empty-state">
        <h3>Nothing matches</h3>
        <p>Try a wider date range or distance, include online events, or turn on “Show untagged”.</p>
      </div>`;
    return;
  }

  const days = new Map();
  for (const e of visible) {
    const key = dayKey(e.start, e.timezone);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(e);
  }

  els.list.innerHTML = [...days.entries()]
    .map(
      ([key, items]) => `
      <section class="day">
        <h2 class="day-head">${formatDay(items[0].start, items[0].timezone)}
          <small>${relativeDay(key)}${items.length} event${items.length === 1 ? '' : 's'}</small>
        </h2>
        ${items.map(cardHtml).join('')}
      </section>`,
    )
    .join('');
}

function cardHtml(e) {
  const picked = state.picks.has(e.id);
  const end = e.end ? `– ${formatTime(e.end, e.timezone)}` : '';
  const format = e.hybrid ? 'Hybrid' : e.online ? 'Online' : '';
  const meta = [
    e.organizer,
    e.venue,
    e.distanceKm != null ? `${e.distanceKm} km away` : '',
    format,
  ].filter(Boolean);
  const sources = [{ source: e.source, url: e.url }, ...e.alsoOn];

  return `
    <article class="card${picked ? ' picked' : ''}" data-id="${escapeHtml(e.id)}">
      <div class="time">${formatTime(e.start, e.timezone)}<small>${end}</small></div>
      <div class="body">
        <h3 class="title"><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a></h3>
        <p class="meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</p>
        <div class="tags">
          ${e.categories.map((c) => `<span class="tag ${c}">${c === 'design' ? 'Design' : 'Tech'}</span>`).join('')}
          ${sources
            .map(
              (s) =>
                `<span class="tag"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${SOURCE_LABELS[s.source]} ↗</a></span>`,
            )
            .join('')}
        </div>
        <div class="actions">
          <button type="button" class="btn pick" data-action="pick" aria-pressed="${picked}">
            ${picked ? '✓ Picked' : '+ Pick'}
          </button>
        </div>
      </div>
      ${
        e.image
          ? `<img class="thumb" src="${escapeHtml(e.image)}" alt="" loading="lazy" />`
          : `<div class="thumb empty" aria-hidden="true">${escapeHtml(e.title.trim()[0] || '•')}</div>`
      }
    </article>`;
}

function renderSourceChips(events) {
  const counts = Object.fromEntries(Object.keys(SOURCE_LABELS).map((s) => [s, 0]));
  for (const e of events) {
    if (!matches(e, { ignoreSource: true })) continue;
    for (const s of new Set([e.source, ...e.alsoOn.map((a) => a.source)])) counts[s]++;
  }
  els.sources.innerHTML = Object.entries(SOURCE_LABELS)
    .map(([key, label]) => {
      const failed = state.data.sources[key] && !state.data.sources[key].ok;
      return `<button type="button" class="chip" data-source="${key}" aria-pressed="${state.filters.sources.has(key)}"
        title="${failed ? escapeHtml(state.data.sources[key].error) : ''}">
        ${label}<span class="n">${failed ? '!' : counts[key]}</span></button>`;
    })
    .join('');
}

function renderStatus(visibleCount) {
  const { location, sources, fetchedAt } = state.data;
  const labelsWhere = (test) =>
    Object.entries(sources)
      .filter(([, s]) => test(s))
      .map(([k]) => SOURCE_LABELS[k])
      .join(', ');
  const failed = labelsWhere((s) => !s.ok);
  const stale = labelsWhere((s) => s.stale);
  const time = new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  setStatus(
    `${visibleCount} event${visibleCount === 1 ? '' : 's'} near ${escapeHtml(location.label)}
     · updated ${time} · <a href="#" data-action="refresh">Refresh</a>
     ${stale ? ` · ${stale} busy, showing its earlier results` : ''}
     ${failed ? `<span class="err"> · Couldn't reach ${failed}</span>` : ''}`,
  );
}

function setStatus(html) {
  els.status.innerHTML = html;
}

// ---------- Picks pane ----------

function togglePick(id) {
  const adding = !state.picks.has(id);
  if (adding) {
    const event = state.data?.events.find((e) => e.id === id);
    if (!event) return;
    state.picks.set(id, event);
  } else {
    state.picks.delete(id);
  }
  store.set('picks', [...state.picks.values()]);

  const card = els.list.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    card.classList.toggle('picked', adding);
    const btn = card.querySelector('[data-action="pick"]');
    btn.setAttribute('aria-pressed', adding);
    btn.textContent = adding ? '✓ Picked' : '+ Pick';
  }
  renderPicks(adding ? id : null);
}

// Upcoming picks first (soonest on top), then past ones (most recent first).
function sortedPicks() {
  const now = Date.now();
  const all = [...state.picks.values()];
  const upcoming = all.filter((e) => endTime(e) >= now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const past = all.filter((e) => endTime(e) < now).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  return { upcoming, past };
}

function renderPicks(justAddedId = null) {
  const count = state.picks.size;
  const wasHidden = els.picks.hidden;
  els.picks.hidden = count === 0;
  els.page.classList.toggle('has-picks', count > 0);
  if (count === 0) {
    closeMenu();
    setPicksExpanded(false);
    return;
  }

  els.picksCount.textContent = count;
  if (justAddedId && !wasHidden) {
    els.picksCount.classList.remove('bump');
    void els.picksCount.offsetWidth; // restart the animation
    els.picksCount.classList.add('bump');
  }

  const { upcoming, past } = sortedPicks();
  els.picksList.innerHTML =
    upcoming.map((e) => pickHtml(e, e.id === justAddedId)).join('') +
    (past.length ? `<li class="picks-divider">Past</li>${past.map((e) => pickHtml(e, false, true)).join('')}` : '');

  if (justAddedId) {
    els.picksList
      .querySelector(`[data-id="${CSS.escape(justAddedId)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function pickHtml(e, flash, past = false) {
  const date = new Date(e.start);
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: e.timezone, month: 'short' }).format(date);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: e.timezone, day: 'numeric' }).format(date);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: e.timezone, weekday: 'short' }).format(date);
  const end = e.end ? `–${formatTime(e.end, e.timezone)}` : '';
  const { name, detail } = locationParts(e);
  const map = mapUrl(e);

  return `
    <li class="pick-item${flash ? ' flash' : ''}${past ? ' past' : ''}" data-id="${escapeHtml(e.id)}">
      <div class="pick-date" aria-hidden="true"><span>${month}</span><strong>${day}</strong></div>
      <div class="pick-body">
        <a class="pick-title" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>
        <p class="pick-meta">${weekday} ${formatTime(e.start, e.timezone)}${end}</p>
        <p class="pick-location">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15Z" /><circle cx="8" cy="6.5" r="1.8" /></svg>
          <span>${name ? `<strong>${escapeHtml(name)}</strong>` : ''}${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</span>
        </p>
        <div class="pick-links">
          <a class="link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">Open event ↗</a>
          ${map ? `<a class="link" href="${escapeHtml(map)}" target="_blank" rel="noopener">Map ↗</a>` : ''}
          ${past ? '' : '<button type="button" class="link" data-action="calendar" aria-haspopup="menu" aria-expanded="false">Add to calendar ▾</button>'}
        </div>
      </div>
      <button type="button" class="icon-btn pick-remove" data-action="unpick" aria-label="Remove ${escapeHtml(e.title)} from picks">✕</button>
    </li>`;
}

// Venue name in bold, then the address (minus the venue name when the address repeats it).
function locationParts(e) {
  if (e.online && !e.hybrid && !e.venue) return { name: 'Online', detail: '' };
  const name = e.venue || '';
  let detail = e.address || '';
  if (name && detail.startsWith(name)) detail = detail.slice(name.length).replace(/^[\s,]+/, '');
  if (e.hybrid) detail = [detail, 'also online'].filter(Boolean).join(' · ');
  if (!name && !detail) return { name: 'Location not listed', detail: '' };
  return { name, detail };
}

function mapUrl(e) {
  if (e.online && !e.hybrid && !e.venue) return null;
  const query = [e.venue, e.address].filter(Boolean).join(', ') || (e.lat != null ? `${e.lat},${e.lon}` : '');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

// On narrow screens the pane is a bottom sheet that starts collapsed.
function setPicksExpanded(expanded) {
  els.picks.classList.toggle('expanded', expanded);
  els.picksToggle.setAttribute('aria-expanded', expanded);
  els.picksToggle.setAttribute('aria-label', expanded ? 'Hide picks' : 'Show picks');
}

async function copyAllLinks() {
  const { upcoming, past } = sortedPicks();
  const text = [...upcoming, ...past]
    .map((e) => `${e.title}\n${formatDay(e.start, e.timezone)}, ${formatTime(e.start, e.timezone)}\n${e.url}`)
    .join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast(`Copied ${state.picks.size} link${state.picks.size === 1 ? '' : 's'}`);
}

// Clearing is instant; the toast's Undo brings everything back, so no confirm dialog is needed.
function clearPicks() {
  const removed = [...state.picks.values()];
  state.picks.clear();
  store.set('picks', []);
  render();
  renderPicks();
  showToast(`Cleared ${removed.length} pick${removed.length === 1 ? '' : 's'}`, {
    label: 'Undo',
    onClick: () => {
      for (const e of removed) state.picks.set(e.id, e);
      store.set('picks', [...state.picks.values()]);
      render();
      renderPicks();
    },
  });
}

let toastTimer;
function showToast(message, action = null) {
  const text = Object.assign(document.createElement('span'), { textContent: message });
  els.toast.replaceChildren(text);
  if (action) {
    const button = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'toast-action',
      textContent: action.label,
    });
    button.addEventListener('click', () => {
      action.onClick();
      els.toast.classList.remove('show');
    });
    els.toast.append(button);
  }
  els.toast.classList.toggle('has-action', Boolean(action));
  els.toast.classList.add('show');
  toastDuration = action ? 6000 : 2200;
  scheduleToastHide();
}

let toastDuration = 2200;
function scheduleToastHide() {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), toastDuration);
}

// Hovering the toast keeps it open, so the Undo button can't vanish under the cursor.
els.toast.addEventListener('mouseenter', () => clearTimeout(toastTimer));
els.toast.addEventListener('mouseleave', () => els.toast.classList.contains('show') && scheduleToastHide());

// ---------- Calendar menu ----------

let openMenu = null;

// The menu is fixed-positioned on <body> so the scrolling picks pane can't clip it.
function toggleMenu(button, event) {
  const wasOpen = openMenu?.button === button;
  closeMenu();
  if (wasOpen) return;

  const menu = els.menuTemplate.content.firstElementChild.cloneNode(true);
  menu.querySelector('[data-cal="google"]').href = googleUrl(event);
  menu.querySelector('[data-cal="outlook"]').href = outlookUrl(event, 'outlook.live.com');
  menu.querySelector('[data-cal="office"]').href = outlookUrl(event, 'outlook.office.com');
  menu.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-cal="ics"]')) downloadIcs([event]);
    if (ev.target.closest('[data-cal]')) closeMenu();
  });
  document.body.append(menu);

  const rect = button.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = menu;
  const below = rect.bottom + 6;
  menu.style.top = `${below + h > innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - w - 8))}px`;

  button.setAttribute('aria-expanded', 'true');
  openMenu = { menu, button };
  menu.querySelector('a').focus({ preventScroll: true });
}

function closeMenu() {
  if (!openMenu) return;
  openMenu.button.setAttribute('aria-expanded', 'false');
  openMenu.menu.remove();
  openMenu = null;
}

// ---------- Formatting ----------

function dayKey(iso, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function formatDay(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(iso),
  );
}

function formatTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function relativeDay(key) {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (key === dayKey(new Date().toISOString(), localZone)) return 'Today · ';
  if (key === dayKey(new Date(Date.now() + 864e5).toISOString(), localZone)) return 'Tomorrow · ';
  return '';
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

// ---------- Wiring ----------

function syncControls() {
  const f = state.filters;
  els.input.value = state.location;
  for (const btn of els.category.querySelectorAll('button')) {
    btn.setAttribute('aria-checked', btn.dataset.value === f.category);
  }
  els.window.value = String(f.windowDays);
  els.radius.value = String(f.radiusKm);
  els.online.checked = f.online;
  els.everything.checked = f.everything;
}

els.form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  state.location = els.input.value.trim() || DEFAULT_LOCATION;
  els.input.value = state.location;
  store.set('location', state.location);
  load();
});

els.category.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  state.filters.category = btn.dataset.value;
  syncControls();
  persistFilters();
  render();
});

els.sources.addEventListener('click', (ev) => {
  const chip = ev.target.closest('[data-source]');
  if (!chip) return;
  const { sources } = state.filters;
  const key = chip.dataset.source;
  if (sources.has(key) && sources.size > 1) sources.delete(key);
  else sources.add(key);
  persistFilters();
  render();
});

els.search.addEventListener('input', () => {
  state.filters.query = els.search.value.trim().toLowerCase();
  render();
});

for (const [el, key, parse] of [
  [els.window, 'windowDays', Number],
  [els.radius, 'radiusKm', Number],
  [els.online, 'online', null],
  [els.everything, 'everything', null],
]) {
  el.addEventListener('change', () => {
    state.filters[key] = parse ? parse(el.value) : el.checked;
    persistFilters();
    render();
  });
}

els.status.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-action="refresh"]')) {
    ev.preventDefault();
    load({ refresh: true });
  }
});

els.list.addEventListener('click', (ev) => {
  const card = ev.target.closest('.card');
  if (card && ev.target.closest('[data-action="pick"]')) togglePick(card.dataset.id);
});

els.picksList.addEventListener('click', (ev) => {
  const item = ev.target.closest('.pick-item');
  if (!item) return;
  const id = item.dataset.id;
  if (ev.target.closest('[data-action="unpick"]')) togglePick(id);
  const calBtn = ev.target.closest('[data-action="calendar"]');
  if (calBtn) toggleMenu(calBtn, state.picks.get(id));
});

els.picksList.addEventListener('scroll', closeMenu);
els.picksHead.addEventListener('click', () => setPicksExpanded(!els.picks.classList.contains('expanded')));
$('#copy-links').addEventListener('click', copyAllLinks);
$('#clear-picks').addEventListener('click', clearPicks);

document.addEventListener('click', (ev) => {
  if (openMenu && !ev.target.closest('.menu') && !ev.target.closest('[data-action="calendar"]')) closeMenu();
});
window.addEventListener('scroll', closeMenu, { passive: true });
window.addEventListener('resize', closeMenu);

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (openMenu) closeMenu();
  else if (els.picks.classList.contains('expanded')) setPicksExpanded(false);
});

syncControls();
renderPicks();
load();
