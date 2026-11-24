import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');
const newBar = document.querySelector('[data-testid="new-bar"]');

/** id -> <li>; rows are kept, not rebuilt, so ack state and focus survive a refresh. */
const rows = new Map();
const acked = new Set();

// R5: the viewer's own zone and order. en-GB/de/fr/... give dd/mm, en-US gives mm/dd.
const timeFmt = new Intl.DateTimeFormat(navigator.languages?.[0] ?? navigator.language, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}

function rowFor(i) {
  const li = document.createElement('li');
  li.setAttribute('data-testid', 'incident-row');
  li.dataset.id = i.id;
  li.className = `row ${esc(i.severity)}`;
  li.innerHTML = `
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}" title="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
    <span class="act"></span>`;
  setAction(li, i.id);
  return li;
}

function setAction(li, id) {
  const slot = li.querySelector('.act');
  if (acked.has(id)) {
    slot.innerHTML = '<span data-testid="acked" class="acked">✓ acked</span>';
    li.classList.add('is-acked');
    return;
  }
  slot.innerHTML = '<button type="button" data-testid="ack" class="ack">Ack</button>';
}

// R2: Ack sends api.ack(id) for the row it sits in, then marks that row acked.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const li = btn.closest('[data-testid="incident-row"]');
  const id = li.dataset.id;
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    await ack(id);
    acked.add(id);
    setAction(li, id);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Retry ack';
    showStatus(`Ack failed for ${id}: ${err.message}`);
  }
});

function showStatus(msg) {
  status.textContent = msg ?? '';
  status.hidden = !msg;
}

// R1 (as product decided after step 1): the list holds still while it is on screen. Rows on the board never
// move, get inserted above, or get removed by a refresh. New incidents wait behind the "N new" bar
// (data-testid="new-bar"); clicking it brings them in at the top. Ack stays on the row it was clicked in.
let pending = []; // newest first, not on the board yet

function showRows(incidents) {
  // Insert in order above the current top row: incidents is newest first.
  const anchor = list.firstChild;
  for (const i of incidents) {
    if (rows.has(i.id)) continue;
    const li = rowFor(i);
    rows.set(i.id, li);
    list.insertBefore(li, anchor);
  }
  empty.hidden = rows.size > 0;
  list.hidden = rows.size === 0;
}

function updateBar() {
  const n = pending.length;
  newBar.textContent = n === 1 ? '1 new incident · show' : `${n} new incidents · show`;
  newBar.hidden = n === 0;
}

function render(incidents) {
  const fresh = incidents.filter((i) => !rows.has(i.id));
  // Nothing on the board yet, or the board is not on screen: nothing can move under anyone's pointer.
  if (rows.size === 0 || document.visibilityState === 'hidden') {
    pending = [];
    showRows(fresh);
  } else {
    pending = fresh;
  }
  updateBar();
  if (rows.size === 0) {
    empty.hidden = false;
    list.hidden = true;
  }
}

newBar.addEventListener('click', () => {
  showRows(pending);
  pending = [];
  updateBar();
  list.firstElementChild?.scrollIntoView({ block: 'nearest' });
});

let loaded = false;
async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    showStatus(null);
    if (!loaded) {
      loaded = true;
      loader.remove(); // R3: gone once incidents load
      board.setAttribute('aria-busy', 'false');
    }
  } catch (err) {
    console.error(err);
    showStatus(`Could not refresh: ${err.message}. Retrying…`);
  } finally {
    setTimeout(tick, REFRESH_MS); // R4: every 2 s, never overlapping
  }
}

tick();
