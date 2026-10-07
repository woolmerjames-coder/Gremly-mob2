// ============================================================================
// factSource.js: how Gremly knows a fact, in plain words for the model.
//
// Every fact in the ledger keeps the record it came from, when, and the
// person's own words (life_facts: said_by, source_table, source_quote,
// observed_at). The database adds the kind of record and, for an answer to
// one of Gremly's questions, the question itself (public.fact_sources, which
// recall_life reads too). This says all of that in words, so when a person
// asks how Gremly knows something, the true answer is in front of the model.
//
// A row with no source says nothing: a story item or a Chapter, which are
// Gremly's own writing, or a database that does not send sources yet.
// ============================================================================

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clean(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** The date a moment fell on where they are (YYYY-MM-DD), or '' when it cannot be read. */
export function localDay(iso, timezone) {
  if (!iso) return '';
  const at = new Date(iso);
  if (isNaN(at)) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // a timezone the runtime does not know: the date by the clock in UTC
    return at.toISOString().slice(0, 10);
  }
}

/** "Thu 1 Oct 2026", with "(today)" or "(yesterday)" when it is. */
function dayWords(day, today) {
  const d = new Date(`${day}T12:00:00Z`);
  if (isNaN(d)) return day;
  const base = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!today) return base;
  const n = Math.round((new Date(`${today}T12:00:00Z`) - d) / 864e5);
  if (n === 0) return `${base} (today)`;
  if (n === 1) return `${base} (yesterday)`;
  return base;
}

/** What kind of note it was (notes.subtype). */
const NOTES = { journal: 'their journal', event: 'an event they saved' };
/** What kind of chat it was (scope_chats.chat_type). */
const CHATS = { daily: 'their thread for the day with Gremly' };

function answerTo(question) {
  const q = clean(question, 200);
  return q ? `their answer when Gremly asked "${q}"` : "their answer to one of Gremly's questions";
}

/** The kind of record a fact came from, in words. '' when it is not known. */
export function sourcePlace(src) {
  switch (src?.source_table) {
    case 'notes':
      return NOTES[src.source_kind] || 'a note they saved';
    case 'scope_chat_messages':
      return CHATS[src.source_kind] || 'a chat with Gremly';
    case 'todos':
      return 'a todo they added';
    case 'habits':
      return 'a habit they set up';
    case 'space_milestones':
      return 'a milestone they set';
    case 'synced_calendar_events':
      return 'their calendar';
    case 'user_profile_overrides':
      return 'what they told Gremly about themselves';
    case 'gremly_questions':
      return answerTo(src.source_question);
    case 'user_corrections':
      // an answer to Gremly's question, a "Not right?" they tapped, or said in a chat
      if (src.source_kind === 'question') return answerTo(src.source_question);
      if (src.source_kind === 'not_right') return 'something they put right in what Gremly had';
      return 'something they told Gremly in a chat';
    default:
      return '';
  }
}

/**
 * How Gremly knows a fact: where it came from, the day where they are, and
 * what was said. Their own words are marked as theirs; the words of an item
 * they keep (a todo's name, a calendar entry) are marked as what it reads.
 * @param {object} src a row with said_by, source_table, source_kind,
 *   source_question, source_quote and observed_at
 * @param {{today?: string|null, timezone?: string, quote?: number}} [o]
 * @returns {string} '' when the row carries no source
 */
export function sourceWords(src, { today = null, timezone = 'UTC', quote = 160 } = {}) {
  const place = sourcePlace(src);
  if (!place) return '';
  const day = localDay(src.observed_at, timezone);
  const said = clean(src.source_quote, quote);
  const label = src.said_by === 'user' ? 'their words' : 'it reads';
  return `${place}${day ? `, on ${dayWords(day, today)}` : ''}${said ? `; ${label}: "${said}"` : ''}`;
}
