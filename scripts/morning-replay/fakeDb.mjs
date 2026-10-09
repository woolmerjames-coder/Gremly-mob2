/**
 * A stand in for the database, for the morning replay (run.mjs): every read
 * the daily picture makes is answered from one sample day's rows (days.mjs).
 * It routes by table and by the filters that tell one read of a table from
 * another; the sample rows are already what those reads would return.
 */

export const REPLAY_SUPABASE_URL = 'https://morning-replay.invalid';

const OPEN_STATES = new Set(['current', 'planned', 'unconfirmed']);
const PAST_STATES = new Set(['happened', 'changed']);

/** The rows one read gets, from the day's tables. */
export function answer(day, table, search) {
  const t = day.tables || {};
  const has = (s) => search.includes(s);
  switch (table) {
    case 'synced_calendar_events':
      // the read that only asks whether any calendar is connected
      if (has('select=id&limit=1'))
        return t.calendar_connected === false ? [] : [{ id: 'connected' }];
      return t.synced_calendar_events || [];
    case 'notes': {
      const notes = t.notes || [];
      if (has('subtype=eq.event')) return notes.filter((n) => n.kind === 'event');
      if (has('journal_subtype=eq.intention')) return notes.filter((n) => n.kind === 'intention');
      if (has('subtype=eq.journal')) return notes.filter((n) => n.kind === 'journal');
      if (has('or=(subtype.is.null')) return notes.filter((n) => n.kind === 'other');
      return [];
    }
    case 'todos':
      if (has('completed_at=gte.')) return t.done_today || [];
      return t.todos || [];
    case 'life_facts_now': {
      const facts = t.life_facts_now || [];
      if (has('state=in.(happened')) return facts.filter((f) => PAST_STATES.has(f.state));
      return facts.filter((f) => OPEN_STATES.has(f.state));
    }
    case 'user_daily_state':
      return [];
    default:
      return t[table] || [];
  }
}
