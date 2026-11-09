// A game's start is one moment (seconds since 1970) shown on the clock of
// its venue's time zone (GameTimeZone in iOS). Changing the zone changes the
// clock it is shown on, never the moment: 2:40 PM IST reads 2:10 AM in PDT.

/** A clock reading: the date (month 1-12) and the time, to the minute. */
export type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string | undefined): Intl.DateTimeFormat {
  const key = zone ?? '';
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      ...(zone ? { timeZone: zone } : {}),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatters.set(key, f);
  }
  return f;
}

/** The device's own zone, e.g. "Asia/Kolkata". */
export const deviceZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The clock reading of a moment in a zone (the device's when none is given). */
export function wallTime(epochSeconds: number, zone?: string): WallTime {
  const parts: Record<string, number> = {};
  for (const p of formatter(zone).formatToParts(new Date(Math.floor(epochSeconds) * 1000))) {
    if (p.type !== 'literal') {
      parts[p.type] = Number(p.value);
    }
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour, // some engines write midnight as 24
    minute: parts.minute,
  };
}

/** The zone's offset from UTC at that moment, in seconds (east is positive). */
function offsetSeconds(epochSeconds: number, zone?: string): number {
  const w = wallTime(epochSeconds, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) / 1000;
  return asUtc - Math.floor(epochSeconds / 60) * 60;
}

/**
 * The moment a clock reading means in a zone. Around a daylight-saving change
 * a reading can be skipped (spring forward) or happen twice (fall back); the
 * answer is then a moment within an hour of it, never an error.
 */
export function epochFromWall(w: WallTime, zone?: string): number {
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) / 1000;
  const first = asUtc - offsetSeconds(asUtc, zone);
  const second = asUtc - offsetSeconds(first, zone);
  return second;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekday = (w: Pick<WallTime, 'year' | 'month' | 'day'>) =>
  new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const monthTitle = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

export function formatDate(w: WallTime): string {
  return `${WEEKDAYS[weekday(w)]}, ${MONTHS[w.month - 1]} ${w.day}, ${w.year}`;
}

export function formatTime(w: WallTime): string {
  const h = w.hour % 12 === 0 ? 12 : w.hour % 12;
  return `${h}:${String(w.minute).padStart(2, '0')} ${w.hour < 12 ? 'AM' : 'PM'}`;
}
