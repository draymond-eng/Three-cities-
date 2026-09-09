// ---------------------------------------------------------------------------
// Time. Every booking is a wall-clock intention ("Tuesday at 2pm") stored as a
// real instant, so all of this reasons in the club's own timezone rather than
// the visitor's. Covered by time.test.mjs — run `node book/time.test.mjs`.
// ---------------------------------------------------------------------------
const partsCache = new Map();
function tzFormatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return partsCache.get(tz);
}

export function tzParts(date, tz) {
  const p = Object.fromEntries(
    tzFormatter(tz).formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

export function tzOffsetMs(date, tz) {
  const p = tzParts(date, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - date.getTime();
}

/** Turn a club-local wall clock time into the real instant it refers to. */
export function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  let off = tzOffsetMs(new Date(guess), tz);
  off = tzOffsetMs(new Date(guess - off), tz);   // second pass settles DST edges
  return new Date(guess - off);
}

export const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (date, tz) => { const p = tzParts(date, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
export const parseKey = (key) => { const [y, mo, d] = key.split('-').map(Number); return { y, mo, d }; };

export function addDays(key, n) {
  const { y, mo, d } = parseKey(key);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Instant for a club-local day + minutes-past-midnight. */
export function slotInstant(dayKey, minutes, tz) {
  const { y, mo, d } = parseKey(dayKey);
  return zonedToUtc(y, mo, d, Math.floor(minutes / 60), minutes % 60, tz);
}

/**
 * Wall-clock minutes past midnight of `dayKey` for an instant — the exact
 * inverse of slotInstant, and what the grid axis is drawn in. Deliberately not
 * elapsed minutes: on the two days a year the clocks move, an elapsed count
 * drifts an hour out of step with the clock on the wall, which would slide
 * every booking on screen off the row it belongs to.
 */
export function minutesInDay(date, dayKey, tz) {
  const p = tzParts(date, tz);
  const at = parseKey(dayKey);
  const dayDiff = Math.round(
    (Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(at.y, at.mo - 1, at.d)) / 86400000);
  return dayDiff * 1440 + p.h * 60 + p.mi;
}

export const timeToMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

export function fmtClock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12}${ampm}` : `${h12}:${pad(mm)}${ampm}`;
}

export function fmtInstant(date, tz) {
  const p = tzParts(date, tz);
  return fmtClock(p.h * 60 + p.mi);
}

export function fmtDayLong(key) {
  const { y, mo, d } = parseKey(key);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

export function fmtDayShort(key) {
  const { y, mo, d } = parseKey(key);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function fmtHours(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
