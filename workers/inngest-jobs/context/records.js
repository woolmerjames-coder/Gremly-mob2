/**
 * What the reader is shown: each thing a person gave, turned into one line of
 * words for the model. Pure: rows in, records out. reader.js loads the rows.
 *
 * A record is { table, id, at, text } plus, where they apply:
 *   private   the person marked the item private: every fact from it is private
 *   factIds   ledger facts already taken from it, listed beside it
 *   kind      'new' (default), 'changed' or 'deleted'
 *
 * Nothing the person wrote is cut. A record longer than one call can carry is
 * split at its own boundaries: a journal page's cards, then its paragraphs,
 * then its lines. Code never reads the words to decide where.
 */

import { localDateTime, weekdayName } from './db';

/** The most one record's words may take; longer ones are split into parts. */
export const MAX_RECORD_CHARS = 12000;

const oneLine = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Rich text from the journal editor as plain words, paragraphs kept. */
export function htmlText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A journal page's cards, each with the app's prompt marked as the app's, when
 * the page it was saved with still matches its words (lib/journal/page.ts).
 * Otherwise null, and the entry's body is read as it stands.
 */
export function journalCards(note) {
  const layout = note?.views?.journal_page;
  if (!layout || layout.v !== 1 || !Array.isArray(layout.cards)) return null;
  if (String(layout.text || '').trim() !== String(note.body || '').trim()) return null;
  const cards = layout.cards
    .map((c) => {
      const words = htmlText(c?.html);
      if (!words) return null;
      return c?.q ? `[The page asked: "${oneLine(c.q)}"]\n${words}` : words;
    })
    .filter(Boolean);
  return cards.length ? cards : null;
}

/**
 * The moods the person chose themselves. A wrap up entry keeps theirs in
 * views.sweep_moods; elsewhere a mood that is the one Gremly read from their
 * words (views.ai_mood) was his pick, not theirs (lib/wrapup/journal.ts).
 */
export function personMoods(note) {
  const v = note?.views || {};
  const list = (m) => (Array.isArray(m) ? m : m ? [m] : []).map(String).filter(Boolean);
  if (v.sweep_origin) return list(v.sweep_moods);
  const moods = list(note?.mood);
  const ai = list(v.ai_mood);
  if (ai.length && moods.length === ai.length && moods.every((m) => ai.includes(m))) return [];
  return moods;
}

function listItems(items) {
  if (!Array.isArray(items) || !items.length) return '';
  const lines = items
    .filter((i) => i && oneLine(i.text))
    .map((i) => `${i.checked ? '[done] ' : ''}${oneLine(i.text)}`);
  return lines.length ? ` List: ${lines.join('; ')}.` : '';
}

/**
 * The reminders the person set on an item (reminders_json), as words: a
 * reminder is when they mean to be told about it, which says when they mean
 * to deal with it. Times are as they set them, in their own day.
 */
export function reminderWords(reminders) {
  if (!Array.isArray(reminders)) return '';
  const said = reminders
    .filter((r) => r && (r.date || r.time))
    .map((r) => {
      const at = r.time ? ` at ${String(r.time).slice(0, 5)}` : '';
      if (r.frequency && r.frequency !== 'once') return `${r.frequency}${at}`;
      return `${r.date ? `${weekdayName(String(r.date).slice(0, 10))} ${String(r.date).slice(0, 10)}` : 'a day not set'}${at}`;
    });
  if (!said.length) return '';
  return ` They set ${said.length === 1 ? 'a reminder' : 'reminders'} for it: ${said.join('; ')}.`;
}

const NOTE_KIND = {
  journal: 'a journal entry',
  event: 'an event',
  idea: 'an idea',
};
const noteKind = (n) => NOTE_KIND[n?.subtype] || 'a note';

function dueOf(t) {
  return (
    t?.due_day ||
    t?.scheduled_date ||
    t?.target_date ||
    (t?.due_date ? String(t.due_date).slice(0, 10) : null)
  );
}

/** The words of a note: a journal page by its cards, anything else as written. */
export function noteWords(n) {
  const cards = n?.subtype === 'journal' || n?.views?.journal_page ? journalCards(n) : null;
  return cards ? cards.join('\n\n') : String(n?.body || '').trim();
}

function noteHead(n, verb) {
  const v = n.views || {};
  const when =
    n.subtype === 'event' && (n.target_date || n.date)
      ? ` (on ${n.target_date || n.date}${n.end_date ? ` to ${n.end_date}` : ''}${n.event_time ? ` at ${String(n.event_time).slice(0, 5)}` : ''})`
      : '';
  const forDay =
    v.sweep_date && typeof v.sweep_date === 'string'
      ? `, for ${weekdayName(v.sweep_date)} ${v.sweep_date}`
      : '';
  const goal = v.goal_checkin?.goal_name
    ? `, a check in on their goal "${oneLine(v.goal_checkin.goal_name)}"`
    : '';
  const priv = v.private_journal === true ? ' [they marked it private]' : '';
  return `${verb} ${noteKind(n)}${when}${forDay}${goal}${priv}: "${oneLine(n.title)}"`;
}

export function noteRecord(n) {
  const words = noteWords(n);
  const moods = personMoods(n);
  return {
    table: 'notes',
    id: n.id,
    at: n.created_at,
    private: n.views?.private_journal === true,
    text: `${noteHead(n, 'Wrote')}${words ? `. ${words}` : ''}${listItems(n.list_items)}${moods.length ? ` Mood they chose: ${moods.join(', ')}.` : ''}${reminderWords(n.reminders_json)}`,
  };
}

export function todoRecord(t) {
  const due = dueOf(t);
  const extra = [t.body, t.notes].filter((x) => String(x || '').trim()).join('\n');
  return {
    table: 'todos',
    id: t.id,
    at: t.created_at,
    private: t.views?.private_journal === true,
    text: `Added a todo: "${oneLine(t.title)}"${due ? ` (due ${due})` : ''}${extra ? `. Details: ${extra}` : ''}${listItems(t.list_items)}${reminderWords(t.reminders_json)}`,
  };
}

export function completedRecord(t) {
  return {
    table: 'todos',
    // marked apart from the record of the todo being made (reader.js markTable)
    mark: 'completed',
    id: t.id,
    at: t.completed_at,
    private: t.views?.private_journal === true,
    text: `Completed the todo: "${oneLine(t.title)}"`,
  };
}

export function habitRecord(h) {
  const notes = String(h.notes || '').trim();
  const span =
    h.start_date || h.end_date
      ? ` It runs ${h.start_date ? `from ${String(h.start_date).slice(0, 10)}` : ''}${h.end_date ? ` until ${String(h.end_date).slice(0, 10)}` : ''}.`
      : '';
  return {
    table: 'habits',
    id: h.id,
    at: h.created_at,
    text: `Started tracking a habit: "${oneLine(h.name || h.title)}"${h.frequency ? ` (${h.frequency})` : ''}${h.why_string ? `. Why: ${h.why_string}` : ''}${notes ? `. Their notes on it: ${notes}` : ''}.${span}${reminderWords(h.reminders_json)}`,
  };
}

export function milestoneRecord(m) {
  return {
    table: 'space_milestones',
    id: m.id,
    at: m.created_at,
    text: `Set a milestone: "${oneLine(m.title || m.name)}"${m.date ? ` dated ${m.date}` : ''}${m.completed ? ' (marked done)' : ''}${m.note ? `. ${m.note}` : ''}`,
  };
}

function calendarWhen(c, tz) {
  const start = c.is_all_day
    ? String(c.start_at || '').slice(0, 10)
    : localDateTime(tz, c.start_at);
  const end = c.is_all_day ? String(c.end_at || '').slice(0, 10) : localDateTime(tz, c.end_at);
  return `from ${start} to ${end}`;
}

export function calendarRecord(c, tz) {
  return {
    table: 'synced_calendar_events',
    id: c.id,
    at: c.created_at,
    text: `Calendar entry: "${oneLine(c.title)}" ${calendarWhen(c, tz)}${c.location ? ` at ${oneLine(c.location)}` : ''}`,
  };
}

export function overrideRecord(o) {
  return {
    table: 'user_profile_overrides',
    id: o.id,
    at: o.created_at,
    text: `Told Gremly about themselves (${o.action}): "${String(o.fact_text || '').trim()}"`,
  };
}

export function answerRecord(a) {
  return {
    table: 'gremly_questions',
    id: a.id,
    at: a.answered_at,
    text: `Answered Gremly's question "${oneLine(a.question)}" with: "${String(a.answer || '').trim()}"`,
  };
}

export function chatRecord(m, gremlyBefore) {
  return {
    table: 'scope_chat_messages',
    id: m.id,
    at: m.created_at,
    text: `${gremlyBefore ? `[Gremly had said, context only: "${oneLine(gremlyBefore)}"] ` : ''}Said in chat: "${String(m.content || '').trim()}"`,
  };
}

// ── changes ──────────────────────────────────────────────────────────────────

/**
 * What an archive was, from the reason the app saved with it. The app's own
 * tidying (an item turned into another, split, or moved to the calendar table)
 * is not something the person decided about the thing itself: those are left
 * out, since what it became is read in its own right.
 */
const ARCHIVE_WORDS = {
  swept: 'let it go in the evening wrap up',
  mini_sweep: 'let it go while tidying their list',
  weekly_cleanup: 'let it go in a weekly tidy up',
  dismissed_by_user: 'dismissed it',
  user_deleted: 'took it off the wrap up deck',
  user_deleted_drop: 'removed it',
  user_requested: 'removed it',
  manual: 'archived it',
  'cancelled in chat': 'cancelled it, accepting a change in chat',
  'stopped in chat': 'stopped it, accepting a change in chat',
  'archived in chat': 'archived it, accepting a change in chat',
  calendar_deleted: 'it was removed from their calendar',
};
export const MECHANICAL_ARCHIVES = new Set([
  'converted',
  'converted_to_todo',
  'converted_to_habit',
  'split',
  'split_completed',
  'sweep-conversion',
  'type_conversion',
  'migrated_to_calendar_events',
  'minddrop_relation',
  'outside_window',
]);

const was = (dates, f) => (Array.isArray(dates?.[f]) ? dates[f] : null);
const dayOf = (v) => (v == null ? null : String(v).slice(0, 10));

/**
 * One change to an item made before the read began: the item as it stands
 * now, what changed, and the facts already taken from it. Returns null when
 * there is nothing for the reader in it (the app's own tidying).
 *
 * change: { table, row_id, at, fields: Set|array, dates: { field: [before, after] } }
 */
export function changeRecord(change, row, tz) {
  const fields = new Set(change.fields || []);
  const dates = change.dates || {};
  const base = { table: change.table, id: change.row_id, at: change.at, kind: 'changed' };
  const archivedNow = fields.has('archived') && row?.archived === true;
  if (archivedNow && MECHANICAL_ARCHIVES.has(row.archived_reason)) return null;
  const archiveWords = archivedNow
    ? ARCHIVE_WORDS[row.archived_reason] || 'archived it'
    : fields.has('archived')
      ? 'brought it back from the archive'
      : null;

  if (change.table === 'todos') {
    const parts = [];
    if (archiveWords) parts.push(archiveWords);
    const moved = ['due_day', 'scheduled_date', 'target_date']
      .map((f) => was(dates, f))
      .find(Boolean);
    if (moved && dayOf(moved[0]) !== dayOf(moved[1])) {
      parts.push(
        moved[1]
          ? `moved it from ${dayOf(moved[0]) || 'no day'} to ${dayOf(moved[1])}`
          : `took its day off (it was ${dayOf(moved[0])})`,
      );
    }
    if (fields.has('resurface_at') && row?.resurface_at)
      parts.push(`put it off until ${dayOf(row.resurface_at)}`);
    if (fields.has('completed_at') && !row?.completed_at) parts.push('marked it not done again');
    if (['title', 'body', 'notes', 'list_items'].some((f) => fields.has(f)))
      parts.push('changed its words');
    if (!parts.length) return null;
    const moves = Number(row?.sweep_reschedule_count || 0);
    const due = dueOf(row);
    const extra = [row?.body, row?.notes].filter((x) => String(x || '').trim()).join('\n');
    return {
      ...base,
      private: row?.views?.private_journal === true,
      text: `Changed the todo "${oneLine(row?.title)}": ${parts.join('; ')}${moves > 1 ? ` (moved ${moves} times in all)` : ''}. It now stands: "${oneLine(row?.title)}"${due ? `, due ${due}` : ', no day'}${row?.completed_at ? ', done' : ''}${row?.archived ? ', archived' : ''}${extra ? `. Details: ${extra}` : ''}${listItems(row?.list_items)}${row?.completed_at || row?.archived ? '' : reminderWords(row?.reminders_json)}`,
    };
  }

  if (change.table === 'notes') {
    const parts = [];
    if (archiveWords) parts.push(archiveWords);
    const moved = ['target_date', 'date', 'end_date'].map((f) => was(dates, f)).find(Boolean);
    if (moved && dayOf(moved[0]) !== dayOf(moved[1])) {
      parts.push(
        `changed its date from ${dayOf(moved[0]) || 'none'} to ${dayOf(moved[1]) || 'none'}`,
      );
    }
    if (['event_time', 'end_time'].some((f) => fields.has(f))) parts.push('changed its time');
    if (['title', 'body', 'list_items', 'views.journal_page'].some((f) => fields.has(f)))
      parts.push('changed its words');
    if (fields.has('views.private_journal')) {
      parts.push(
        row?.views?.private_journal === true ? 'marked it private' : 'marked it not private',
      );
    }
    if (fields.has('mood') && personMoods(row).length) parts.push('changed the mood they chose');
    if (!parts.length) return null;
    const words = noteWords(row);
    const moods = personMoods(row);
    return {
      ...base,
      private: row?.views?.private_journal === true,
      text: `${noteHead(row, 'Changed')}: ${parts.join('; ')}. Written ${localDateTime(tz, row?.created_at)}. It now reads: ${words ? `"${words}"` : '(no words)'}${listItems(row?.list_items)}${moods.length ? ` Mood they chose: ${moods.join(', ')}.` : ''}`,
    };
  }

  if (change.table === 'habits') {
    const parts = [];
    if (archiveWords)
      parts.push(archiveWords === 'archived it' ? 'stopped tracking it' : archiveWords);
    if (['name', 'title', 'why_string', 'notes'].some((f) => fields.has(f)))
      parts.push('changed its words');
    if (fields.has('frequency')) parts.push(`changed how often, now ${row?.frequency || 'unset'}`);
    if (['start_date', 'end_date'].some((f) => fields.has(f))) parts.push('changed its dates');
    if (!parts.length) return null;
    const notes = String(row?.notes || '').trim();
    return {
      ...base,
      text: `Changed the habit "${oneLine(row?.name || row?.title)}": ${parts.join('; ')}.${row?.why_string ? ` Why: ${row.why_string}` : ''}${notes ? ` Their notes on it: ${notes}` : ''}${row?.archived ? '' : reminderWords(row?.reminders_json)}`,
    };
  }

  if (change.table === 'synced_calendar_events') {
    if (archivedNow) {
      return {
        ...base,
        text: `Calendar entry no longer on their calendar: "${oneLine(row?.title)}" ${calendarWhen(row, tz)}`,
      };
    }
    const parts = [];
    const start = was(dates, 'start_at');
    const end = was(dates, 'end_at');
    if (start || end) {
      const before = {
        ...row,
        start_at: start ? start[0] : row?.start_at,
        end_at: end ? end[0] : row?.end_at,
      };
      parts.push(`moved, it was ${calendarWhen(before, tz)}`);
    }
    if (fields.has('title')) parts.push('its title changed');
    if (fields.has('location')) parts.push('its place changed');
    if (!parts.length) return null;
    return {
      ...base,
      text: `Calendar entry changed (${parts.join('; ')}): now "${oneLine(row?.title)}" ${calendarWhen(row, tz)}${row?.location ? ` at ${oneLine(row.location)}` : ''}`,
    };
  }

  return null;
}

/** A row deleted before the read began: only the facts from it can be shown. */
export function deletedRecord(change) {
  const kind =
    { notes: 'a note or journal entry', todos: 'a todo', habits: 'a habit' }[change.table] ||
    'an item';
  return {
    table: change.table,
    id: change.row_id,
    at: change.at,
    kind: 'deleted',
    text: `Deleted ${kind}. Its words are gone; the ledger facts taken from it are listed.`,
  };
}

// ── the weekly review ────────────────────────────────────────────────────────

/**
 * The person's answers in a weekly review, with what Gremly put to them marked
 * as his. titles: item id → title, for the todos and habits they named.
 */
export function reviewRecord(row, titles = new Map(), at) {
  const a = row?.answers || {};
  const read = row?.read || {};
  const name = (id) => titles.get(id) || null;
  const lines = [];
  if (read.challenge?.headline && a.challenge) {
    lines.push(
      `[Gremly's read of what could make the week go wrong, context only: "${oneLine(read.challenge.headline)}"] They said he ${a.challenge.agreed ? 'had it about right' : 'had it wrong'}${a.challenge.note ? `: "${String(a.challenge.note).trim()}"` : ''}`,
    );
  }
  for (const p of a.priorities || []) {
    const items = (p.item_ids || []).map(name).filter(Boolean);
    lines.push(
      `Chose as a priority (Gremly's wording, their choice): "${oneLine(p.text)}"${items.length ? `, meaning: ${items.map((t) => `"${t}"`).join(', ')}` : ''}`,
    );
  }
  if (a.intention) {
    const drafted = (read.intention_drafts || []).some((d) => oneLine(d) === oneLine(a.intention));
    lines.push(
      `Their intention for the week${drafted ? " (a draft of Gremly's they chose)" : ', in their words'}: "${String(a.intention).trim()}"`,
    );
  }
  const out = (a.dates_out || [])
    .map((key) => {
      const [type, rest] = String(key).split(':');
      if (type === 'when') return (read.coming_up || [])[Number(rest)]?.what || null;
      return name(rest);
    })
    .filter(Boolean);
  if (out.length)
    lines.push(
      `Took these off the week's list of what is coming: ${out.map((t) => `"${oneLine(t)}"`).join(', ')}`,
    );
  for (const m of a.milestones || []) {
    lines.push(
      `Set up ${m.steps || 'some'} steps towards "${oneLine(m.goal)}"${m.about ? ` (leading up to ${oneLine(m.about)})` : ''}`,
    );
  }
  for (const n of a.needs_you || []) {
    if (n.decision) lines.push(`On "${oneLine(n.title)}" they decided: ${oneLine(n.decision)}`);
  }
  if (Array.isArray(a.busy_days) && a.busy_days.length)
    lines.push(`Marked these days busy: ${a.busy_days.join(', ')}`);
  for (const s of a.said || [])
    if (String(s?.text || '').trim()) lines.push(`Typed to Gremly: "${String(s.text).trim()}"`);
  if (!lines.length) return null;
  const span =
    read.first && read.last
      ? ` for ${read.first} to ${read.last}`
      : row?.week_start
        ? ` for the week of ${row.week_start}`
        : '';
  return {
    table: 'weekly_reviews',
    id: row.id,
    at: at || row.updated_at || row.created_at,
    kind: 'changed',
    text: `Their weekly review${span} (${row.status === 'done' ? 'finished' : 'in progress'}):\n${lines.map((l) => `- ${l}`).join('\n')}`,
  };
}

// ── splitting ────────────────────────────────────────────────────────────────

function pieces(text) {
  // its own boundaries, coarsest first: cards and paragraphs, then lines
  for (const sep of ['\n\n', '\n']) {
    const parts = text.split(sep);
    if (parts.length > 1) return parts.map((p, i) => (i < parts.length - 1 ? p + sep : p));
  }
  return null;
}

/** A record too long for one call, split at its own boundaries into parts. */
export function splitRecord(rec, max = MAX_RECORD_CHARS) {
  if (rec.text.length <= max) return [rec];
  const out = [];
  let cur = '';
  const pushCur = () => {
    if (cur.trim()) out.push(cur);
    cur = '';
  };
  const add = (piece) => {
    if (piece.length > max) {
      const inner = pieces(piece);
      if (inner) {
        for (const p of inner) add(p);
        return;
      }
      // one line longer than a call can carry, with no break in it: cut by length
      pushCur();
      for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max));
      return;
    }
    if (cur.length + piece.length > max) pushCur();
    cur += piece;
  };
  for (const p of pieces(rec.text) || [rec.text]) add(p);
  pushCur();
  return out.map((t, i) => ({
    ...rec,
    part: i + 1,
    parts: out.length,
    text:
      i === 0
        ? `${t} (part 1 of ${out.length})`
        : `(part ${i + 1} of ${out.length} of the same record) ${t}`,
  }));
}
