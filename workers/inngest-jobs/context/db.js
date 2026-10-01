/**
 * Small Supabase REST client for the context pipeline.
 * Every failure throws with the response text, so nothing fails silently.
 */
export function db(env) {
  const base = `${env.SUPABASE_URL}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  async function call(method, path, body, prefer) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Supabase ${method} ${path.split('?')[0]} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    select: (path) => call('GET', path),
    insert: (table, rows) => call('POST', table, rows, 'return=representation'),
    insertQuiet: (table, rows) => call('POST', table, rows, 'return=minimal'),
    upsert: (table, rows, onConflict) =>
      call('POST', `${table}?on_conflict=${onConflict}`, rows, 'resolution=merge-duplicates,return=representation'),
    update: (pathWithFilter, patch) => call('PATCH', pathWithFilter, patch, 'return=representation'),
    remove: (pathWithFilter) => call('DELETE', pathWithFilter, undefined, 'return=representation'),
    rpc: (fn, args = {}) => call('POST', `rpc/${fn}`, args),
  };
}

/** A user's IANA timezone, with the same fallbacks the database functions use. */
export async function userTimezone(env, userId) {
  const d = db(env);
  const rows = await d.select(`notification_preferences?user_id=eq.${userId}&select=timezone`);
  const tz = rows?.[0]?.timezone;
  if (tz) return tz;
  const prof = await d.select(`user_profiles?user_id=eq.${userId}&select=timezone`);
  const ptz = prof?.[0]?.timezone;
  return ptz && ptz !== 'UTC' ? ptz : 'America/Los_Angeles';
}

export function localDate(tz, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);
}

export function localDateTime(tz, iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date} ${time}`;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromStr, toStr) {
  return Math.round((Date.parse(`${toStr}T12:00:00Z`) - Date.parse(`${fromStr}T12:00:00Z`)) / 864e5);
}

export function weekdayName(dateStr) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${dateStr}T12:00:00Z`));
}

/** "3 days ago", "today", "in 5 days": the plain relation of a date to today. */
export function relativeDay(dateStr, todayStr) {
  if (!dateStr) return 'no date';
  const n = daysBetween(todayStr, dateStr.slice(0, 10));
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

/** First name, pronouns and the onboarding identity, for prompts. Never throws. */
export async function personIdentity(env, userId) {
  try {
    const rows = await db(env).rpc('person_identity', { p_user: userId });
    const r = Array.isArray(rows) ? rows[0] : rows;
    return { first_name: r?.first_name || null, pronouns: r?.pronouns || null, identity: r?.identity || {} };
  } catch (err) {
    console.warn(`[context] person_identity failed for ${userId}: ${err.message}`);
    return { first_name: null, pronouns: null, identity: {} };
  }
}

/**
 * The "IDENTITY: ..." line other prompts read from the top of profile_text,
 * in the format the older profile writers used.
 */
export function identityLine(person) {
  const id = person?.identity || {};
  const parts = [];
  const name = id.name || person?.first_name;
  if (name) parts.push(`Name: ${name}`);
  if (person?.pronouns) parts.push(`Pronouns: ${person.pronouns}`);
  else if (id.gender) parts.push(`Gender: ${id.gender}`);
  if (id.age) parts.push(`Age: ${id.age}`);
  if (id.location) parts.push(`Location: ${String(id.location).replace(/^live\s+/i, '')}`);
  const partner = typeof id.partner === 'object' && id.partner ? id.partner.name : id.partner;
  if (partner) parts.push(`Partner: ${partner}`);
  return parts.length ? `IDENTITY: ${parts.join('. ')}.` : '';
}
