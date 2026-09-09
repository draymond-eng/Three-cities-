// Run with: node book/time.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  slotInstant, minutesInDay, keyOf, addDays, fmtClock, fmtDayShort, fmtHours, timeToMinutes,
} from './time.js';

const NY = 'America/New_York';

test('wall-clock times map to the right instant either side of DST', () => {
  assert.equal(slotInstant('2026-01-15', 9 * 60, NY).toISOString(), '2026-01-15T14:00:00.000Z');
  assert.equal(slotInstant('2026-07-15', 9 * 60, NY).toISOString(), '2026-07-15T13:00:00.000Z');
  assert.equal(slotInstant('2026-03-08', 3 * 60, NY).toISOString(), '2026-03-08T07:00:00.000Z');
  assert.equal(slotInstant('2026-11-01', 9 * 60, NY).toISOString(), '2026-11-01T14:00:00.000Z');
});

test('half-hour offset zones', () => {
  assert.equal(slotInstant('2026-06-01', 9 * 60, 'Asia/Kolkata').toISOString(), '2026-06-01T03:30:00.000Z');
});

test('minutesInDay is the exact inverse of slotInstant, DST days included', () => {
  for (const day of ['2026-01-15', '2026-07-15', '2026-03-08', '2026-11-01']) {
    for (const mins of [480, 570, 630, 780, 1290, 1320]) {
      assert.equal(minutesInDay(slotInstant(day, mins, NY), day, NY), mins, `${day} @ ${fmtClock(mins)}`);
    }
  }
});

test('an instant after midnight reads as minutes past the grid day, not a negative', () => {
  assert.equal(minutesInDay(slotInstant('2026-01-16', 60, NY), '2026-01-15', NY), 1500);
});

test('day keys follow the club, not the browser', () => {
  assert.equal(keyOf(new Date('2026-01-01T04:30:00Z'), NY), '2025-12-31');
  assert.equal(keyOf(new Date('2026-01-01T05:30:00Z'), NY), '2026-01-01');
});

test('day arithmetic crosses months and years', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');   // leap year
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('formatting', () => {
  assert.equal(fmtClock(0), '12am');
  assert.equal(fmtClock(570), '9:30am');
  assert.equal(fmtClock(720), '12pm');
  assert.equal(fmtClock(1320), '10pm');
  assert.equal(timeToMinutes('08:30:00'), 510);
  assert.equal(fmtHours(2), '2');
  assert.equal(fmtHours(1.5), '1.5');
  assert.match(fmtDayShort('2026-09-09'), /Wed/);
});
