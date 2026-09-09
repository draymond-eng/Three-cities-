import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import {
  keyOf, parseKey, addDays, slotInstant, minutesInDay, timeToMinutes,
  fmtClock, fmtInstant, fmtDayLong, fmtDayShort, fmtHours,
} from './time.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, REDIRECT_URL, CLUB_NAME } from './config.js';

clearTimeout(window.__bookLoadTimer);   // the library loaded; cancel the fallback notice

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  session: null,
  allowance: null,      // row from my_allowance()
  tz: 'America/New_York',
  rooms: [],
  dayKey: null,         // 'YYYY-MM-DD' in club time
  weekStart: null,      // 'YYYY-MM-DD', first chip in the date strip
  events: [],           // rows from availability()
  tab: 'book',
};

const ROW_H = 26;

// ---------------------------------------------------------------------------
// Tiny DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function banner(host, kind, text) {
  const el = typeof host === 'string' ? $(host) : host;
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner banner-${kind}">${esc(text)}</div>`;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function friendlyError(error) {
  if (!error) return 'Something went wrong.';
  const msg = error.message || String(error);
  // The exclusion constraint fired: two people went for the same slot.
  if (error.code === '23P01' || /bookings_no_overlap|conflicting key value/i.test(msg)) {
    return 'Someone just booked that slot. Pick another time.';
  }
  if (/bookings_during_check|blackouts_during_check/i.test(msg)) return 'A booking has to end after it starts.';
  if (/row-level security/i.test(msg)) return 'You do not have permission to do that.';
  return msg.replace(/^new row for relation.*?:\s*/i, '');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const btn = $('authBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: REDIRECT_URL },
  });
  btn.disabled = false; btn.textContent = 'Send me a sign-in link';
  if (error) { banner('authMsg', 'err', friendlyError(error)); return; }
  banner('authMsg', 'ok', `Check ${email} — the sign-in link is on its way. It expires in an hour.`);
  $('authForm').reset();
});

$('signOut').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;

  if (!session) {
    $('viewAuth').hidden = false;
    $('viewApp').hidden = true;
    $('signOut').hidden = true;
    if (SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
      banner('authMsg', 'info', 'Setup needed: add your Supabase URL and anon key in book/config.js.');
    }
    return;
  }

  $('viewAuth').hidden = true;
  $('viewApp').hidden = false;
  $('signOut').hidden = false;
  $('who').textContent = session.user.email;

  const { data: allowance, error } = await sb.rpc('my_allowance').maybeSingle();
  if (error) { banner('globalMsg', 'err', friendlyError(error)); return; }
  state.allowance = allowance;
  state.tz = allowance?.timezone || state.tz;

  const today = keyOf(new Date(), state.tz);
  state.dayKey = today;
  state.weekStart = today;

  if (allowance?.is_admin) document.querySelector('[data-tab="admin"]').hidden = false;

  $('appLede').textContent = allowance?.can_book
    ? `${CLUB_NAME} clubhouse. Tap any open slot to book it.`
    : 'Your membership does not currently include room booking — get in touch and we will sort it.';

  await loadRooms();
  renderAllowance();
  renderDays();
  await refreshGrid();
  watchLive();
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' && !state.session) location.reload();
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadRooms() {
  const { data, error } = await sb.from('rooms').select('*').order('sort_order').order('name');
  if (error) { banner('globalMsg', 'err', friendlyError(error)); return; }
  state.rooms = data || [];
}

function visibleRooms() {
  return state.allowance?.is_admin ? state.rooms : state.rooms.filter((r) => r.is_active);
}

async function loadDayEvents(dayKey) {
  const from = slotInstant(dayKey, 0, state.tz);
  const to = slotInstant(addDays(dayKey, 1), 0, state.tz);
  const { data, error } = await sb.rpc('availability', {
    p_from: from.toISOString(), p_to: to.toISOString(),
  });
  if (error) { banner('globalMsg', 'err', friendlyError(error)); return []; }
  return (data || []).map((e) => ({
    ...e, start: new Date(e.starts_at), end: new Date(e.ends_at),
  }));
}

let liveChannel = null;
function watchLive() {
  if (liveChannel) return;
  liveChannel = sb.channel('bookings-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
      if (state.tab === 'book') refreshGrid();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blackouts' }, () => {
      if (state.tab === 'book') refreshGrid();
    })
    .subscribe();
}

// ---------------------------------------------------------------------------
// Allowance summary — the rules, visible before anyone hits them
// ---------------------------------------------------------------------------
function renderAllowance() {
  const a = state.allowance;
  const host = $('allowance');
  if (!a) { host.innerHTML = ''; return; }
  const cards = [`<div><b>${esc(a.tier_name)}</b>your membership</div>`];
  if (a.can_book) {
    cards.push(`<div><b>${fmtHours(a.max_hours_per_booking)} hrs</b>max per booking</div>`);
    cards.push(`<div><b>${a.max_advance_days} days</b>how far ahead</div>`);
    cards.push(`<div><b>${a.active_bookings} / ${a.max_active_bookings}</b>upcoming bookings</div>`);
    if (a.max_hours_per_month != null) {
      cards.push(`<div><b>${fmtHours(a.hours_used_this_month)} / ${fmtHours(a.max_hours_per_month)} hrs</b>used this month</div>`);
    }
  }
  host.innerHTML = cards.join('');
}

// ---------------------------------------------------------------------------
// Date strip
// ---------------------------------------------------------------------------
function renderDays() {
  const today = keyOf(new Date(), state.tz);
  const maxKey = addDays(today, state.allowance?.max_advance_days ?? 30);
  const host = $('days');
  host.innerHTML = '';
  for (let i = 0; i < 14; i++) {
    const key = addDays(state.weekStart, i);
    const { y, mo, d } = parseKey(key);
    const dow = new Date(Date.UTC(y, mo - 1, d))
      .toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    const btn = document.createElement('button');
    btn.className = 'day' + (key === today ? ' is-today' : '');
    btn.setAttribute('aria-pressed', String(key === state.dayKey));
    btn.disabled = key < today || (!state.allowance?.is_admin && key > maxKey);
    btn.innerHTML = `<span class="dow">${esc(dow)}</span><span class="dnum">${d}</span>`;
    btn.addEventListener('click', () => { state.dayKey = key; renderDays(); refreshGrid(); });
    host.appendChild(btn);
  }
  $('dayPrev').disabled = state.weekStart <= today;
}

$('dayPrev').addEventListener('click', () => {
  const today = keyOf(new Date(), state.tz);
  state.weekStart = addDays(state.weekStart, -7);
  if (state.weekStart < today) state.weekStart = today;
  renderDays();
});
$('dayNext').addEventListener('click', () => {
  state.weekStart = addDays(state.weekStart, 7);
  renderDays();
});

// ---------------------------------------------------------------------------
// Availability grid
// ---------------------------------------------------------------------------
function gridSpan(rooms) {
  const opens = rooms.map((r) => timeToMinutes(r.opens_at));
  const closes = rooms.map((r) => timeToMinutes(r.closes_at));
  const steps = rooms.map((r) => r.slot_minutes || 30);
  return {
    start: Math.min(...opens),
    end: Math.max(...closes),
    step: Math.min(...steps),
  };
}

function eventsFor(roomId) {
  return state.events.filter((e) => e.room_id === roomId);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function refreshGrid() {
  const host = $('gridHost');
  const rooms = visibleRooms();
  if (!rooms.length) {
    host.innerHTML = '<div class="card"><div class="empty">No rooms are set up yet.</div></div>';
    return;
  }
  host.innerHTML = '<div class="spinner"></div>';
  state.events = await loadDayEvents(state.dayKey);
  renderGrid();
}

function renderGrid() {
  const rooms = visibleRooms();
  const { start, end, step } = gridSpan(rooms);
  const rows = Math.max(1, Math.round((end - start) / step));
  const now = Date.now();

  const wrap = document.createElement('div');
  wrap.className = 'gridwrap';
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = `62px repeat(${rooms.length}, minmax(122px, 1fr))`;
  grid.style.gridTemplateRows = `auto repeat(${rows}, ${ROW_H}px)`;

  // Corner + room headers
  const corner = document.createElement('div');
  corner.className = 'ghead';
  corner.innerHTML = `<div class="rmeta">${esc(fmtDayShort(state.dayKey))}</div>`;
  corner.style.gridArea = '1 / 1';
  grid.appendChild(corner);

  rooms.forEach((room, c) => {
    const h = document.createElement('div');
    h.className = 'ghead';
    h.style.gridArea = `1 / ${c + 2}`;
    const meta = [`Seats ${room.capacity}`, `${fmtClock(timeToMinutes(room.opens_at))}–${fmtClock(timeToMinutes(room.closes_at))}`];
    if (!room.is_active) meta.push('hidden from members');
    h.innerHTML =
      `<div class="rname"><span class="swatch" style="background:${esc(room.color)}"></span>${esc(room.name)}</div>` +
      `<div class="rmeta">${esc(meta.join(' · '))}</div>`;
    grid.appendChild(h);
  });

  // Time gutter
  for (let i = 0; i < rows; i++) {
    const minute = start + i * step;
    const t = document.createElement('div');
    t.className = 'gtime' + (minute % 60 === 0 ? '' : ' minor');
    t.style.gridArea = `${i + 2} / 1`;
    t.textContent = fmtClock(minute);
    grid.appendChild(t);
  }

  // Slots. Each room is drawn at its own slot size, so a room that books by
  // the hour shows hour-long cells rather than half-hour cells where every
  // other one is dead.
  rooms.forEach((room, c) => {
    const opens = timeToMinutes(room.opens_at);
    const closes = timeToMinutes(room.closes_at);
    const roomStep = Math.max(step, room.slot_minutes || step);
    const span = Math.max(1, Math.round(roomStep / step));
    const evs = eventsFor(room.id);
    const covered = new Array(rows).fill(false);

    for (let m = opens; m + roomStep <= closes; m += roomStep) {
      const row = Math.round((m - start) / step);
      if (row < 0 || row + span > rows) continue;
      for (let k = 0; k < span; k++) covered[row + k] = true;

      const slotStart = slotInstant(state.dayKey, m, state.tz);
      const slotEnd = slotInstant(state.dayKey, m + roomStep, state.tz);

      const cell = document.createElement('button');
      cell.className = 'gcell slot';
      cell.style.gridArea = `${row + 2} / ${c + 2} / span ${span} / span 1`;

      // Already started counts as past — the database refuses a booking whose
      // start is behind now(), so never offer one.
      if (slotStart.getTime() <= now) {
        cell.classList.add('past');
        cell.disabled = true;
      } else if (evs.some((e) => overlaps(slotStart, slotEnd, e.start, e.end))) {
        cell.disabled = true;
      } else if (!state.allowance?.can_book) {
        cell.disabled = true;
      } else {
        cell.setAttribute('aria-label', `Book ${room.name} at ${fmtClock(m)}`);
        cell.addEventListener('click', () => openBookingSheet(room, m));
      }
      grid.appendChild(cell);
    }

    // Anything the room is not open for.
    for (let i = 0; i < rows; i++) {
      if (covered[i]) continue;
      const off = document.createElement('div');
      off.className = 'gcell off';
      off.style.gridArea = `${i + 2} / ${c + 2}`;
      off.title = `${room.name} is open ${fmtClock(opens)}\u2013${fmtClock(closes)}`;
      grid.appendChild(off);
    }

    // Event overlay for this room
    const layer = document.createElement('div');
    layer.style.cssText = 'position:relative; pointer-events:none;';
    layer.style.gridArea = `2 / ${c + 2} / span ${rows} / span 1`;
    evs.forEach((e) => {
      const s = Math.max(start, minutesInDay(e.start, state.dayKey, state.tz));
      const en = Math.min(end, minutesInDay(e.end, state.dayKey, state.tz));
      if (en <= s) return;
      const el = document.createElement('div');
      el.className = `ev ev-${e.kind}`;
      el.style.top = `${((s - start) / step) * ROW_H + 1}px`;
      el.style.height = `${((en - s) / step) * ROW_H - 3}px`;
      el.innerHTML = `<div class="evt">${esc(fmtClock(s))}\u2013${esc(fmtClock(en))}</div>${esc(e.label || '')}`;
      if (e.kind === 'mine' || (state.allowance?.is_admin && e.booking_id)) {
        el.addEventListener('click', () => openBookingDetail(e, room));
      }
      layer.appendChild(el);
    });
    grid.appendChild(layer);
  });

  wrap.appendChild(grid);
  const host = $('gridHost');
  host.innerHTML = '';
  host.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
function closeSheet() { $('sheetHost').innerHTML = ''; }

function openSheet(title, bodyHtml) {
  const host = $('sheetHost');
  host.innerHTML =
    `<div class="scrim" role="dialog" aria-modal="true">
       <div class="sheet">
         <div class="sheet-head">
           <h2>${esc(title)}</h2>
           <button class="x" data-close aria-label="Close">&times;</button>
         </div>
         <div id="sheetMsg"></div>
         ${bodyHtml}
       </div>
     </div>`;
  host.querySelector('.scrim').addEventListener('click', (e) => {
    if (e.target.classList.contains('scrim') || e.target.hasAttribute('data-close')) closeSheet();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { closeSheet(); document.removeEventListener('keydown', onEsc); }
  });
  return host.querySelector('.sheet');
}

// ---------------------------------------------------------------------------
// Make a booking
// ---------------------------------------------------------------------------
function durationOptions(room, startMinute) {
  const closes = timeToMinutes(room.closes_at);
  const roomStep = room.slot_minutes || 30;
  const tierMax = state.allowance?.is_admin
    ? 12 * 60
    : Math.round((state.allowance?.max_hours_per_booking || 0) * 60);

  let limit = Math.min(closes, startMinute + tierMax);
  for (const e of eventsFor(room.id)) {
    const es = minutesInDay(e.start, state.dayKey, state.tz);
    if (es >= startMinute && es < limit) limit = es;
  }

  const min = Math.max(room.min_minutes || roomStep, roomStep);
  const out = [];
  for (let d = min; startMinute + d <= limit; d += roomStep) out.push(d);
  return out;
}

function fmtDuration(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hour${h > 1 ? 's' : ''}`;
  return `${m} minutes`;
}

function openBookingSheet(room, startMinute) {
  const options = durationOptions(room, startMinute);
  if (!options.length) {
    openSheet('Not quite', `<p class="muted">There isn't a long enough gap starting at ${esc(fmtClock(startMinute))} in ${esc(room.name)}. Try an earlier slot.</p>
      <div class="sheet-actions"><button class="btn btn-line" data-close>Close</button></div>`);
    return;
  }

  const sheet = openSheet('Book ' + room.name,
    `<p class="muted" style="margin-bottom:16px;">${esc(fmtDayLong(state.dayKey))} · starting ${esc(fmtClock(startMinute))} · seats ${room.capacity}</p>
     <div class="field">
       <label for="bkDuration">How long</label>
       <select id="bkDuration">
         ${options.map((d) => `<option value="${d}">${esc(fmtDuration(d))} — until ${esc(fmtClock(startMinute + d))}</option>`).join('')}
       </select>
     </div>
     <div class="field">
       <label for="bkTitle">What for <span style="text-transform:none; letter-spacing:0; font-weight:400;">(optional)</span></label>
       <input id="bkTitle" maxlength="80" placeholder="Client call, team catch-up…">
     </div>
     <div class="sheet-actions">
       <button class="btn btn-line" data-close type="button">Cancel</button>
       <button class="btn btn-solid" id="bkConfirm" type="button">Confirm booking</button>
     </div>`);

  sheet.querySelector('#bkConfirm').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const mins = Number(sheet.querySelector('#bkDuration').value);
    const title = sheet.querySelector('#bkTitle').value.trim();
    btn.disabled = true; btn.textContent = 'Booking…';

    const startsAt = slotInstant(state.dayKey, startMinute, state.tz);
    const endsAt = slotInstant(state.dayKey, startMinute + mins, state.tz);

    const { error } = await sb.from('bookings').insert({
      room_id: room.id,
      user_id: state.session.user.id,
      during: `[${startsAt.toISOString()},${endsAt.toISOString()})`,
      title: title || null,
    });

    if (error) {
      btn.disabled = false; btn.textContent = 'Confirm booking';
      banner('sheetMsg', 'err', friendlyError(error));
      await refreshGrid();
      return;
    }

    closeSheet();
    banner('globalMsg', 'ok',
      `Booked — ${room.name}, ${fmtDayLong(state.dayKey)}, ${fmtClock(startMinute)} to ${fmtClock(startMinute + mins)}. A confirmation is on its way.`);
    await Promise.all([refreshAllowance(), refreshGrid()]);
  });
}

async function refreshAllowance() {
  const { data } = await sb.rpc('my_allowance').maybeSingle();
  if (data) { state.allowance = data; renderAllowance(); }
}

// ---------------------------------------------------------------------------
// View / cancel an existing booking
// ---------------------------------------------------------------------------
function openBookingDetail(ev, room) {
  const mine = ev.kind === 'mine';
  const sheet = openSheet(mine ? 'Your booking' : 'Booking',
    `<p class="muted">${esc(room.name)}<br>${esc(fmtDayLong(state.dayKey))}<br>
      ${esc(fmtInstant(ev.start, state.tz))} – ${esc(fmtInstant(ev.end, state.tz))}
      ${ev.label ? '<br>' + esc(ev.label) : ''}</p>
     <div class="sheet-actions">
       <button class="btn btn-line" data-close type="button">Close</button>
       ${ev.booking_id ? '<button class="btn btn-danger" id="bkCancel" type="button">Cancel booking</button>' : ''}
     </div>`);

  const cancelBtn = sheet.querySelector('#bkCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      cancelBtn.disabled = true; cancelBtn.textContent = 'Cancelling…';
      const { error } = await cancelBooking(ev.booking_id);
      if (error) {
        cancelBtn.disabled = false; cancelBtn.textContent = 'Cancel booking';
        banner('sheetMsg', 'err', friendlyError(error));
        return;
      }
      closeSheet();
      banner('globalMsg', 'ok', 'Booking cancelled. The room is free again.');
      await Promise.all([refreshAllowance(), refreshGrid()]);
    });
  }
}

async function cancelBooking(id) {
  return sb.from('bookings').update({ status: 'cancelled' }).eq('id', id);
}

// ---------------------------------------------------------------------------
// My bookings
// ---------------------------------------------------------------------------
async function renderMine() {
  const host = $('paneMine');
  host.innerHTML = '<div class="spinner"></div>';

  const { data, error } = await sb
    .from('bookings_detailed')
    .select('*')
    .eq('user_id', state.session.user.id)
    .order('starts_at', { ascending: false })
    .limit(200);

  if (error) { host.innerHTML = ''; banner(host, 'err', friendlyError(error)); return; }

  const now = Date.now();
  const rows = data || [];
  const upcoming = rows.filter((b) => b.status === 'confirmed' && new Date(b.ends_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = rows.filter((b) => !(b.status === 'confirmed' && new Date(b.ends_at).getTime() > now));

  host.innerHTML =
    `<h2 style="margin-bottom:12px;">Upcoming</h2>
     <div class="blist" id="mineUpcoming">${upcoming.length ? upcoming.map((b) => bookingRow(b, true)).join('')
       : '<div class="card"><div class="empty">Nothing booked yet. Head to <b>Rooms &amp; availability</b> and tap an open slot.</div></div>'}</div>
     <h2 style="margin:26px 0 12px;">Earlier</h2>
     <div class="blist">${past.length ? past.slice(0, 30).map((b) => bookingRow(b, false)).join('')
       : '<div class="card"><div class="empty">No past bookings.</div></div>'}</div>`;

  host.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Cancelling…';
      const { error } = await cancelBooking(btn.dataset.cancel);
      if (error) { btn.disabled = false; btn.textContent = 'Cancel'; banner('globalMsg', 'err', friendlyError(error)); return; }
      await Promise.all([refreshAllowance(), renderMine()]);
      if (state.tab === 'book') refreshGrid();
    });
  });
}

function bookingRow(b, isUpcoming) {
  const start = new Date(b.starts_at), end = new Date(b.ends_at);
  const dayKey = keyOf(start, state.tz);
  const cancelled = b.status === 'cancelled';
  return `<div class="bitem ${cancelled ? 'is-cancelled' : isUpcoming ? '' : 'is-past'}"
               style="border-left-color:${esc(b.room_color)}">
    <div>
      <div class="bwhen">${esc(fmtDayShort(dayKey))} · ${esc(fmtInstant(start, state.tz))}–${esc(fmtInstant(end, state.tz))}</div>
      <div class="bwhere">${esc(b.room_name)}${b.title ? ' · ' + esc(b.title) : ''}</div>
    </div>
    <div style="display:flex; gap:10px; align-items:center;">
      ${cancelled ? '<span class="pill pill-cancelled">Cancelled</span>' : ''}
      ${isUpcoming && !cancelled ? `<button class="btn btn-danger" data-cancel="${esc(b.id)}">Cancel</button>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    state.tab = name;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    $('paneBook').hidden = name !== 'book';
    $('paneMine').hidden = name !== 'mine';
    $('paneAdmin').hidden = name !== 'admin';
    banner('globalMsg', 'ok', '');
    if (name === 'mine') renderMine();
    if (name === 'admin') renderAdmin();
    if (name === 'book') refreshGrid();
  });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
async function renderAdmin() {
  const host = $('paneAdmin');
  if (!state.allowance?.is_admin) { host.innerHTML = '<div class="card"><div class="empty">Admins only.</div></div>'; return; }
  host.innerHTML = '<div class="spinner"></div>';

  const nowIso = new Date().toISOString();
  const [rooms, blackouts, bookings, members, tiers] = await Promise.all([
    sb.from('rooms').select('*').order('sort_order').order('name'),
    sb.from('blackouts').select('*').order('during', { ascending: true }).limit(100),
    sb.from('bookings_detailed').select('*').gte('ends_at', nowIso).order('starts_at').limit(200),
    sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(300),
    sb.from('membership_tiers').select('*').order('sort_order'),
  ]);

  const err = [rooms, blackouts, bookings, members, tiers].find((r) => r.error);
  if (err) { host.innerHTML = ''; banner(host, 'err', friendlyError(err.error)); return; }

  state.rooms = rooms.data || [];
  const tierList = tiers.data || [];

  host.innerHTML = `
    <div id="adminMsg"></div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div><h2>Rooms</h2><p class="muted">What members can book, and when each room is open.</p></div>
        <button class="btn btn-line btn-sm" id="roomAdd">Add a room</button>
      </div>
      <div class="tblwrap" style="margin-top:14px;">
        <table class="tbl">
          <thead><tr><th>Room</th><th>Seats</th><th>Open</th><th>Slots</th><th>Status</th><th></th></tr></thead>
          <tbody>${state.rooms.map((r) => `
            <tr>
              <td><span class="swatch" style="background:${esc(r.color)}; display:inline-block; margin-right:7px;"></span>${esc(r.name)}
                  ${r.description ? `<div class="tiny">${esc(r.description)}</div>` : ''}</td>
              <td>${r.capacity}</td>
              <td>${esc(fmtClock(timeToMinutes(r.opens_at)))}–${esc(fmtClock(timeToMinutes(r.closes_at)))}</td>
              <td>${r.slot_minutes} min</td>
              <td>${r.is_active ? '<span class="pill">Bookable</span>' : '<span class="pill pill-cancelled">Hidden</span>'}</td>
              <td style="text-align:right;"><button class="btn btn-quiet btn-sm" data-room-edit="${esc(r.id)}">Edit</button></td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">No rooms yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Block out time</h2>
      <p class="muted">Private events, maintenance, staff holds. Anything already booked inside the window is cancelled.</p>
      <div class="row" style="margin-top:14px;">
        <div class="field"><label for="boRoom">Room</label>
          <select id="boRoom"><option value="">Every room</option>
            ${state.rooms.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="boDate">Date</label><input type="date" id="boDate" value="${esc(state.dayKey)}"></div>
        <div class="field"><label for="boStart">From</label><input type="time" id="boStart" value="09:00" step="900"></div>
        <div class="field"><label for="boEnd">To</label><input type="time" id="boEnd" value="17:00" step="900"></div>
      </div>
      <div class="field"><label for="boReason">Reason (members see this)</label>
        <input id="boReason" maxlength="60" placeholder="Private event"></div>
      <button class="btn btn-solid btn-sm" id="boAdd" style="margin-top:14px;">Block it out</button>

      <div class="tblwrap" style="margin-top:20px;">
        <table class="tbl">
          <thead><tr><th>When</th><th>Room</th><th>Reason</th><th></th></tr></thead>
          <tbody>${(blackouts.data || []).map((b) => {
            const [s, e] = parseRange(b.during);
            const roomName = b.room_id ? (state.rooms.find((r) => r.id === b.room_id)?.name ?? '—') : 'Every room';
            return `<tr>
              <td>${esc(fmtDayShort(keyOf(s, state.tz)))} ${esc(fmtInstant(s, state.tz))}–${esc(fmtInstant(e, state.tz))}</td>
              <td>${esc(roomName)}</td><td>${esc(b.reason)}</td>
              <td style="text-align:right;"><button class="btn btn-quiet btn-sm" data-bo-del="${esc(b.id)}">Remove</button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Nothing blocked out.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Every upcoming booking</h2>
      <p class="muted">${(bookings.data || []).filter((b) => b.status === 'confirmed').length} confirmed from here on.</p>
      <div class="tblwrap" style="margin-top:14px;">
        <table class="tbl">
          <thead><tr><th>When</th><th>Room</th><th>Member</th><th>For</th><th></th></tr></thead>
          <tbody>${(bookings.data || []).map((b) => {
            const s = new Date(b.starts_at), e = new Date(b.ends_at);
            return `<tr${b.status === 'cancelled' ? ' style="opacity:.5"' : ''}>
              <td>${esc(fmtDayShort(keyOf(s, state.tz)))} ${esc(fmtInstant(s, state.tz))}–${esc(fmtInstant(e, state.tz))}</td>
              <td>${esc(b.room_name)}</td>
              <td>${esc(b.member_name || b.member_email)}<div class="tiny">${esc(b.member_tier)}</div></td>
              <td>${esc(b.title || '—')}</td>
              <td style="text-align:right;">${b.status === 'confirmed'
                ? `<button class="btn btn-danger btn-sm" data-admin-cancel="${esc(b.id)}">Cancel</button>`
                : '<span class="pill pill-cancelled">Cancelled</span>'}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="muted">Nothing booked.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Members</h2>
      <p class="muted">Tier decides the booking rules. Anyone who signs in lands on Member until you move them.</p>
      <div class="tblwrap" style="margin-top:14px;">
        <table class="tbl">
          <thead><tr><th>Member</th><th>Tier</th><th>Admin</th></tr></thead>
          <tbody>${(members.data || []).map((m) => `
            <tr>
              <td>${esc(m.full_name || '—')}<div class="tiny">${esc(m.email)}</div></td>
              <td><select data-member-tier="${esc(m.id)}" style="max-width:190px;">
                ${tierList.map((t) => `<option value="${esc(t.slug)}"${t.slug === m.tier ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
              </select></td>
              <td><input type="checkbox" data-member-admin="${esc(m.id)}" ${m.is_admin ? 'checked' : ''}
                     style="width:auto;" ${m.id === state.session.user.id ? 'disabled title="You cannot remove your own admin access"' : ''}></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  wireAdmin();
}

/** Postgres range literal -> [Date, Date] */
function parseRange(range) {
  const m = String(range).match(/^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/);
  if (!m) return [new Date(NaN), new Date(NaN)];
  const iso = (v) => new Date(v.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return [iso(m[1]), iso(m[2])];
}

function wireAdmin() {
  const host = $('paneAdmin');

  host.querySelectorAll('[data-room-edit]').forEach((b) =>
    b.addEventListener('click', () => openRoomSheet(state.rooms.find((r) => r.id === b.dataset.roomEdit))));
  $('roomAdd').addEventListener('click', () => openRoomSheet(null));

  $('boAdd').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const roomId = $('boRoom').value || null;
    const date = $('boDate').value;
    const from = $('boStart').value;
    const to = $('boEnd').value;
    const reason = $('boReason').value.trim() || 'Closed';
    if (!date || !from || !to) { banner('adminMsg', 'err', 'Pick a date and a start and end time.'); return; }
    if (to <= from) { banner('adminMsg', 'err', 'The end time has to be after the start time.'); return; }

    btn.disabled = true;
    const starts = slotInstant(date, timeToMinutes(from), state.tz);
    const ends = slotInstant(date, timeToMinutes(to), state.tz);
    const { error } = await sb.from('blackouts').insert({
      room_id: roomId,
      during: `[${starts.toISOString()},${ends.toISOString()})`,
      reason,
      created_by: state.session.user.id,
    });
    btn.disabled = false;
    if (error) { banner('adminMsg', 'err', friendlyError(error)); return; }
    await renderAdmin();
    banner('adminMsg', 'ok', 'Blocked out. Any bookings inside that window were cancelled.');
  });

  host.querySelectorAll('[data-bo-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      const { error } = await sb.from('blackouts').delete().eq('id', b.dataset.boDel);
      if (error) { b.disabled = false; banner('adminMsg', 'err', friendlyError(error)); return; }
      await renderAdmin();
      banner('adminMsg', 'ok', 'Block removed — the room is bookable again.');
    }));

  host.querySelectorAll('[data-admin-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Cancelling…';
      const { error } = await cancelBooking(b.dataset.adminCancel);
      if (error) { b.disabled = false; b.textContent = 'Cancel'; banner('adminMsg', 'err', friendlyError(error)); return; }
      await renderAdmin();
      banner('adminMsg', 'ok', 'Booking cancelled.');
    }));

  host.querySelectorAll('[data-member-tier]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      const { error } = await sb.from('profiles').update({ tier: sel.value }).eq('id', sel.dataset.memberTier);
      banner('adminMsg', error ? 'err' : 'ok', error ? friendlyError(error) : 'Membership tier updated.');
    }));

  host.querySelectorAll('[data-member-admin]').forEach((box) =>
    box.addEventListener('change', async () => {
      const { error } = await sb.from('profiles').update({ is_admin: box.checked }).eq('id', box.dataset.memberAdmin);
      if (error) { box.checked = !box.checked; banner('adminMsg', 'err', friendlyError(error)); return; }
      banner('adminMsg', 'ok', box.checked ? 'Admin access granted.' : 'Admin access removed.');
    }));
}

function openRoomSheet(room) {
  const r = room || {
    name: '', description: '', capacity: 4, color: '#427179',
    opens_at: '09:00', closes_at: '21:00', slot_minutes: 30, min_minutes: 30,
    is_active: true, sort_order: state.rooms.length + 1,
  };
  const sheet = openSheet(room ? `Edit ${r.name}` : 'Add a room', `
    <div class="field"><label for="rmName">Name</label><input id="rmName" value="${esc(r.name)}" maxlength="60"></div>
    <div class="field"><label for="rmDesc">Description</label><textarea id="rmDesc" rows="2" maxlength="200">${esc(r.description || '')}</textarea></div>
    <div class="row" style="margin-top:14px;">
      <div class="field"><label for="rmCap">Seats</label><input id="rmCap" type="number" min="1" max="200" value="${r.capacity}"></div>
      <div class="field"><label for="rmColor">Colour</label><input id="rmColor" type="color" value="${esc(r.color)}" style="height:42px; padding:4px;"></div>
    </div>
    <div class="row" style="margin-top:14px;">
      <div class="field"><label for="rmOpen">Opens</label><input id="rmOpen" type="time" value="${esc(String(r.opens_at).slice(0, 5))}" step="900"></div>
      <div class="field"><label for="rmClose">Closes</label><input id="rmClose" type="time" value="${esc(String(r.closes_at).slice(0, 5))}" step="900"></div>
    </div>
    <div class="row" style="margin-top:14px;">
      <div class="field"><label for="rmSlot">Slot size</label><select id="rmSlot">
        ${[15, 30, 60].map((v) => `<option value="${v}"${v === r.slot_minutes ? ' selected' : ''}>${v} minutes</option>`).join('')}
      </select></div>
      <div class="field"><label for="rmMin">Shortest booking</label><input id="rmMin" type="number" min="15" max="480" step="15" value="${r.min_minutes}"></div>
    </div>
    <div class="field" style="margin-top:14px;">
      <label style="display:flex; align-items:center; gap:9px; text-transform:none; letter-spacing:0; font-size:.9rem;">
        <input type="checkbox" id="rmActive" ${r.is_active ? 'checked' : ''} style="width:auto;"> Members can book this room
      </label>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-line" data-close type="button">Cancel</button>
      <button class="btn btn-solid" id="rmSave" type="button">${room ? 'Save changes' : 'Add room'}</button>
    </div>
    ${room ? '<button class="btn btn-danger" id="rmDelete" type="button" style="width:100%; margin-top:12px;">Delete this room</button>' : ''}`);

  sheet.querySelector('#rmSave').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: sheet.querySelector('#rmName').value.trim(),
      description: sheet.querySelector('#rmDesc').value.trim() || null,
      capacity: Number(sheet.querySelector('#rmCap').value) || 1,
      color: sheet.querySelector('#rmColor').value,
      opens_at: sheet.querySelector('#rmOpen').value,
      closes_at: sheet.querySelector('#rmClose').value,
      slot_minutes: Number(sheet.querySelector('#rmSlot').value),
      min_minutes: Number(sheet.querySelector('#rmMin').value) || 30,
      is_active: sheet.querySelector('#rmActive').checked,
    };
    if (!payload.name) { banner('sheetMsg', 'err', 'Give the room a name.'); return; }
    if (payload.closes_at <= payload.opens_at) { banner('sheetMsg', 'err', 'Closing time has to be after opening time.'); return; }

    btn.disabled = true; btn.textContent = 'Saving…';
    const { error } = room
      ? await sb.from('rooms').update(payload).eq('id', room.id)
      : await sb.from('rooms').insert({ ...payload, sort_order: r.sort_order });
    if (error) { btn.disabled = false; btn.textContent = 'Save changes'; banner('sheetMsg', 'err', friendlyError(error)); return; }
    closeSheet();
    await loadRooms();
    await renderAdmin();
    banner('adminMsg', 'ok', room ? 'Room updated.' : 'Room added.');
  });

  const del = sheet.querySelector('#rmDelete');
  if (del) {
    del.addEventListener('click', async () => {
      if (del.dataset.armed !== '1') {
        del.dataset.armed = '1';
        del.textContent = 'Really delete? This removes its bookings too.';
        return;
      }
      del.disabled = true;
      const { error } = await sb.from('rooms').delete().eq('id', room.id);
      if (error) { del.disabled = false; banner('sheetMsg', 'err', friendlyError(error)); return; }
      closeSheet();
      await loadRooms();
      await renderAdmin();
      banner('adminMsg', 'ok', 'Room deleted.');
    });
  }
}

// ---------------------------------------------------------------------------
boot();
