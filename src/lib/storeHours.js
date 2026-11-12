// Is a shop open right now, going by its posted hours (business_hours rows:
// day_of_week, open_time / close_time as "HH:MM" 24-hour, is_closed)?
//
// A closing time at or before the opening time runs past midnight:
//   13:00 – 00:00 is open from 1 PM until midnight;
//   18:00 – 02:00 is open from 6 PM until 2 AM, and the hours after midnight
//   count under the day it opened (Friday 18:00 – 02:00 is still open at
//   1 AM on Saturday, even if Saturday itself is closed).
// The same opening and closing time means open all day.
//
// Pure (no component state), so the storefront's first load, its 30-second
// re-check and its Realtime handler all share it, and the tests can call it
// with a fixed clock.

export const STORE_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "13:00" -> 780, "00:00" -> 0, "24:00" -> 1440; anything else -> null.
export function minutesOfDay(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

// A day's posted hours in minutes, or null when the day is missing, closed or has no usable times.
function postedHours(row) {
  if (!row || row.is_closed) return null;
  const open = minutesOfDay(row.open_time);
  const close = minutesOfDay(row.close_time);
  if (open == null || close == null) return null;
  return { open, close };
}

export function computeStoreOpenState(hoursData, now = new Date()) {
  if (!hoursData?.length) return { todayHours: null, isOpen: true };
  const day = now.getDay();
  const today = hoursData.find((h) => h.day_of_week === STORE_DAYS[day]);
  if (!today) return { todayHours: null, isOpen: true };
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Still inside last night's hours that ran past midnight.
  const lastNight = postedHours(hoursData.find((h) => h.day_of_week === STORE_DAYS[(day + 6) % 7]));
  if (lastNight && lastNight.close < lastNight.open && minutes < lastNight.close) {
    return { todayHours: today, isOpen: true };
  }

  if (today.is_closed) return { todayHours: today, isOpen: false };
  const hours = postedHours(today);
  // No usable times: treated as no hours posted, as before.
  if (!hours) return { todayHours: today, isOpen: true };

  let isOpen;
  if (hours.close === hours.open) isOpen = true;
  else if (hours.close > hours.open) isOpen = minutes >= hours.open && minutes < hours.close;
  else isOpen = minutes >= hours.open; // runs past midnight: open until the day ends (after midnight is handled above)
  return { todayHours: today, isOpen };
}
