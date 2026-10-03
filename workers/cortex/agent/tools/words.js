// ============================================================================
// words.js: days and times as the agent's tools write them for the model.
// Plain and unambiguous: the weekday and date, today and tomorrow said as
// such, clock times with am and pm.
// ============================================================================

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function utcNoon(day) {
  return new Date(`${day}T12:00:00Z`);
}

export function addDays(day, n) {
  const d = utcNoon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((utcNoon(b) - utcNoon(a)) / 864e5);
}

/** The Monday of the week a day is in. */
export function mondayOf(day) {
  const dow = utcNoon(day).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

export function weekdayOf(day) {
  return utcNoon(day).getUTCDay();
}

/** "Fri 3 Oct", with "(today)" or "(tomorrow)" when it is. */
export function dayWords(day, today) {
  if (!day) return '';
  const s = String(day).slice(0, 10);
  const d = utcNoon(s);
  if (isNaN(d)) return s;
  const base = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (!today) return base;
  const n = daysBetween(today, s);
  if (n === 0) return `${base} (today)`;
  if (n === 1) return `${base} (tomorrow)`;
  if (n === -1) return `${base} (yesterday)`;
  return base;
}

/** "3:05pm" from minutes after midnight or from HH:MM. */
export function clock(v) {
  if (v == null || v === '') return '';
  let h;
  let m;
  if (typeof v === 'number') {
    h = Math.floor(v / 60) % 24;
    m = v % 60;
  } else {
    const r = /^(\d{1,2}):(\d{2})/.exec(String(v));
    if (!r) return String(v);
    h = Number(r[1]);
    m = Number(r[2]);
  }
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}

export function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}
