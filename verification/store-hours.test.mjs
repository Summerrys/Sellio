// Storefront open/closed from posted business hours (src/lib/storeHours.js).
// Found 12 Nov 2026: Xie Lao Ma posted Mon – Sun 1PM – 12AM (13:00 – 00:00) and its storefront
// said "We're closed right now" all day, because a closing time of 00:00 was compared as
// "before 00:00". Closing at or before the opening time now runs past midnight.
// Run from the app root (no install needed): node verification/store-hours.test.mjs
import assert from 'node:assert/strict';
import { computeStoreOpenState, minutesOfDay } from '../src/lib/storeHours.js';

let passes = 0;
const passed = (name) => { passes += 1; console.log('ok - ' + name); };

// The week of 8 – 14 Nov 2026 (Sunday 8 … Saturday 14), in the machine's own time zone,
// which is the clock the storefront reads.
const DATES = { sunday: 8, monday: 9, tuesday: 10, wednesday: 11, thursday: 12, friday: 13, saturday: 14 };
const at = (day, hh, mm = 0) => new Date(2026, 10, DATES[day], hh, mm);
const open = (rows, day, hh, mm) => computeStoreOpenState(rows, at(day, hh, mm)).isOpen;
const week = (open_time, close_time, overrides = {}) => Object.keys(DATES).map((day_of_week) => ({
  day_of_week, open_time, close_time, is_closed: false, ...(overrides[day_of_week] || {}),
}));

for (const [day, hh, mm] of [['thursday', 12], ['sunday', 8], ['wednesday', 11], ['saturday', 14]]) {
  assert.equal(at(day, hh, mm).getDay(), ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day));
}

// Times
assert.equal(minutesOfDay('13:00'), 780);
assert.equal(minutesOfDay('00:00'), 0);
assert.equal(minutesOfDay('7:05'), 425);
assert.equal(minutesOfDay('13:00:00'), 780, 'a time with seconds');
assert.equal(minutesOfDay('24:00'), 1440);
assert.equal(minutesOfDay('24:30'), null);
assert.equal(minutesOfDay('25:00'), null);
assert.equal(minutesOfDay('12:60'), null);
assert.equal(minutesOfDay(''), null);
assert.equal(minutesOfDay(null), null);
assert.equal(minutesOfDay('noon'), null);
passed('times read as minutes of the day');

// Xie Lao Ma's rows as saved: every day 13:00 – 00:00.
const xieLaoMa = week('13:00', '00:00');
assert.equal(open(xieLaoMa, 'thursday', 15, 47), true, 'Thursday 3:47 PM is inside 1PM – 12AM');
assert.equal(open(xieLaoMa, 'thursday', 13, 0), true, 'opens at 1 PM');
assert.equal(open(xieLaoMa, 'thursday', 23, 59), true, 'still open at 11:59 PM');
assert.equal(open(xieLaoMa, 'thursday', 12, 59), false, 'closed at 12:59 PM');
assert.equal(open(xieLaoMa, 'friday', 0, 0), false, 'closed from midnight');
assert.equal(open(xieLaoMa, 'friday', 0, 30), false, 'closed after midnight (00:00 closes at midnight, nothing carries over)');
assert.equal(open(xieLaoMa, 'friday', 9, 0), false, 'closed in the morning');
assert.equal(open(xieLaoMa, 'sunday', 20, 0), true, 'Sunday evening (day index 0)');
passed('1PM – 12AM is open from 1 PM until midnight, every day');

// Ordinary hours behave as before.
const ordinary = week('10:00', '22:00');
assert.equal(open(ordinary, 'monday', 9, 59), false);
assert.equal(open(ordinary, 'monday', 10, 0), true);
assert.equal(open(ordinary, 'monday', 21, 59), true);
assert.equal(open(ordinary, 'monday', 22, 0), false);
assert.equal(open(ordinary, 'tuesday', 1, 0), false);
passed('10AM – 10PM is open from 10 AM until 10 PM');

// Past midnight: Friday 6PM – 2AM with Saturday closed.
const lateFriday = week('10:00', '22:00', { friday: { open_time: '18:00', close_time: '02:00' }, saturday: { is_closed: true, open_time: null, close_time: null } });
assert.equal(open(lateFriday, 'friday', 17, 59), false);
assert.equal(open(lateFriday, 'friday', 18, 0), true);
assert.equal(open(lateFriday, 'friday', 23, 59), true);
assert.equal(open(lateFriday, 'saturday', 0, 0), true, "Friday's hours carry past midnight");
assert.equal(open(lateFriday, 'saturday', 1, 59), true);
assert.equal(open(lateFriday, 'saturday', 2, 0), false, 'closes at 2 AM');
assert.equal(open(lateFriday, 'saturday', 19, 0), false, 'Saturday itself stays closed');
assert.equal(open(lateFriday, 'friday', 1, 0), false, "Thursday closed at 10 PM, so nothing carries into Friday's small hours");
passed("6PM – 2AM carries into the next morning, even when the next day is closed");

// The carry-over wraps from Saturday into Sunday, and a closed day carries nothing.
const lateSaturday = week('09:00', '17:00', { saturday: { open_time: '20:00', close_time: '03:00' } });
assert.equal(open(lateSaturday, 'sunday', 2, 30), true, "Saturday's hours carry into Sunday");
assert.equal(open(lateSaturday, 'sunday', 3, 0), false);
const closedSunday = week('18:00', '02:00', { sunday: { is_closed: true, open_time: null, close_time: null } });
assert.equal(open(closedSunday, 'monday', 1, 0), false, 'Sunday was closed, so Monday 1 AM is closed');
assert.equal(open(closedSunday, 'monday', 18, 0), true);
assert.equal(open(closedSunday, 'tuesday', 1, 0), true, "Monday's hours carry into Tuesday");
passed('carry-over wraps the week and ignores closed days');

// Other edges.
assert.equal(open(week('00:00', '00:00'), 'wednesday', 3, 0), true, 'same opening and closing time is open all day');
assert.equal(open(week('09:00', '24:00'), 'wednesday', 23, 59), true, '24:00 closes at midnight');
assert.equal(open(week('09:00', '24:00'), 'thursday', 0, 30), false);
assert.equal(open(week(null, null), 'wednesday', 3, 0), true, 'no times posted: open, as before');
const closedToday = week('10:00', '22:00', { wednesday: { is_closed: true } });
assert.deepEqual(computeStoreOpenState(closedToday, at('wednesday', 12)), { todayHours: closedToday.find((h) => h.day_of_week === 'wednesday'), isOpen: false });
assert.deepEqual(computeStoreOpenState([], at('wednesday', 12)), { todayHours: null, isOpen: true }, 'no hours: open');
assert.deepEqual(computeStoreOpenState(null, at('wednesday', 12)), { todayHours: null, isOpen: true });
assert.deepEqual(computeStoreOpenState(week('10:00', '22:00').filter((h) => h.day_of_week !== 'wednesday'), at('wednesday', 12)),
  { todayHours: null, isOpen: true }, 'no row for today: open, as before');
passed('same times, 24:00, missing times, closed days and missing rows');

console.log(passes + ' store-hours checks passed.');
