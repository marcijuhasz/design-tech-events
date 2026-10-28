// Replaces a native <select> with a branded dropdown. The <select> stays in the DOM (hidden) as the
// source of truth: picking an option sets its value and fires "change", so existing listeners keep working.

let openDropdown = null;
let nextId = 0;

const CHEVRON =
  '<svg class="dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" /></svg>';
const CHECK = '<svg class="dropdown-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>';

export function enhanceSelect(select) {
  const id = `dropdown-${nextId++}`;
  const wrap = document.createElement('div');
  wrap.className = 'dropdown';
  select.before(wrap);
  select.hidden = true;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dropdown-btn';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `${id}-list`);
  button.innerHTML = `<span class="dropdown-label"></span>${CHEVRON}`;
  const label = button.querySelector('.dropdown-label');

  const list = document.createElement('ul');
  list.className = 'dropdown-menu';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', select.getAttribute('aria-label') || '');
  list.hidden = true;
  list.innerHTML = [...select.options]
    .map(
      (o, i) =>
        `<li role="option" id="${id}-${i}" tabindex="-1" data-value="${o.value}"><span>${o.textContent}</span>${CHECK}</li>`,
    )
    .join('');
  const items = [...list.children];

  wrap.append(button, list, select);

  function sync() {
    const current = select.options[select.selectedIndex];
    label.textContent = current?.textContent ?? '';
    button.setAttribute('aria-label', `${select.getAttribute('aria-label')}: ${label.textContent}`);
    for (const item of items) item.setAttribute('aria-selected', item.dataset.value === select.value);
  }

  function open() {
    if (openDropdown && openDropdown !== api) openDropdown.close(false);
    list.hidden = false;
    // Open leftwards when the button sits near the right edge (e.g. after the toolbar wraps on phones).
    list.classList.remove('align-right');
    if (list.getBoundingClientRect().right > document.documentElement.clientWidth - 8) {
      list.classList.add('align-right');
    }
    wrap.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    openDropdown = api;
    (items.find((i) => i.dataset.value === select.value) || items[0]).focus();
  }

  function close(returnFocus = true) {
    if (list.hidden) return;
    list.hidden = true;
    wrap.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    if (openDropdown === api) openDropdown = null;
    if (returnFocus) button.focus();
  }

  function choose(value) {
    if (value !== select.value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    close();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('keydown', (ev) => {
    if (['ArrowDown', 'ArrowUp'].includes(ev.key)) {
      ev.preventDefault();
      open();
    }
  });

  list.addEventListener('click', (ev) => {
    const item = ev.target.closest('[role="option"]');
    if (item) choose(item.dataset.value);
  });

  list.addEventListener('keydown', (ev) => {
    const index = items.indexOf(document.activeElement);
    const move = (to) => items[(to + items.length) % items.length].focus();
    if (ev.key === 'ArrowDown') move(index + 1);
    else if (ev.key === 'ArrowUp') move(index - 1);
    else if (ev.key === 'Home') move(0);
    else if (ev.key === 'End') move(items.length - 1);
    else if (ev.key === 'Enter' || ev.key === ' ') choose(items[index].dataset.value);
    else if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    } else if (ev.key === 'Tab') close(false);
    else return;
    if (ev.key !== 'Tab') ev.preventDefault();
  });

  const api = { sync, close };
  sync();
  return api;
}

document.addEventListener('click', (ev) => {
  if (openDropdown && !ev.target.closest('.dropdown')) openDropdown.close(false);
});
