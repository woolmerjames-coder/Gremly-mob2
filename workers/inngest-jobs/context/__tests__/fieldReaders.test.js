/**
 * @jest-environment node
 *
 * Every field has a reader (data fabric stage 4d). What the pipeline works out
 * about a person is only worth keeping when something that talks to them reads
 * it. Each field the daily picture (user_daily_state.dco) and the ledger
 * reader (life_facts) write is listed here with the code that reads it, and a
 * field nothing reads is listed with why. A new field fails this test until
 * it is given a reader or a reason, and a listed reader that stops reading
 * its field fails it too, so data is never again collected and left unused
 * without anyone deciding so.
 *
 * Code only: no records, and nothing here reads a person's words.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/**
 * The top level keys of the object literal that starts at `marker` in a
 * file: what that code writes. Strings, template literals and comments are
 * skipped, so braces inside them do not count.
 */
export function literalKeys(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`no ${marker}`);
  let i = source.indexOf('{', start);
  let depth = 0;
  const keys = [];
  let expectKey = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    const two = source.slice(i, i + 2);
    if (two === '//') {
      i = source.indexOf('\n', i);
      continue;
    }
    if (two === '/*') {
      i = source.indexOf('*/', i) + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === '\\') i++;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      if (depth === 1) expectKey = true;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1 && ch === ',') {
      expectKey = true;
      continue;
    }
    if (depth === 1 && expectKey && /[A-Za-z_$.]/.test(ch)) {
      const m = /^(\.\.\.)?([A-Za-z_$][\w$]*)/.exec(source.slice(i));
      if (m && !m[1]) keys.push(m[2]);
      i += (m?.[0].length || 1) - 1;
      expectKey = false;
    }
  }
  return keys;
}

/** Whether a file reads a field: as a property, a quoted key or a selected column. */
function reads(file, field) {
  const text = read(file);
  return new RegExp(
    `(\\.${field}\\b|['"\`]${field}['"\`]|[=,(]${field}\\b|->>?'?${field}\\b)`,
  ).test(text);
}

// ── the daily picture (workers/inngest-jobs/context/daily.js) ────────────────

const DCO_READERS = {
  day_type: ['workers/cortex/cortex-index.js'],
  tone: ['workers/cortex/context/chatProjection.js', 'workers/cortex/cortex-index.js'],
  brief_headline: [
    'workers/cortex/context/chatProjection.js',
    'workers/inngest-jobs/brief/data.js',
    'lib/store/selectors.ts',
  ],
  today_focus: ['workers/cortex/context/chatProjection.js', 'lib/store/selectors.ts'],
  lead_story: [
    'workers/cortex/context/chatProjection.js',
    'workers/inngest-jobs/brief/data.js',
    'workers/cortex/agent/brief.js',
  ],
  voice_note: [
    'workers/cortex/context/chatProjection.js',
    'workers/inngest-jobs/brief/data.js',
    'workers/cortex/agent/brief.js',
  ],
  also_matters: ['workers/cortex/context/chatProjection.js', 'workers/inngest-jobs/brief/data.js'],
  named_anchors: ['workers/inngest-jobs/brief/data.js', 'workers/cortex/agent/tools/getDay.js'],
  active_today: ['app/screens/CatchAllNotepad.tsx'],
  weekly_intention: ['workers/cortex/context/chatProjection.js'],
  daily_focus: ['workers/cortex/context/chatProjection.js'],
  brief: ['workers/inngest-jobs/brief/data.js', 'lib/brief/dco.ts'],
  absence: ['workers/inngest-jobs/brief/data.js'],
  up_next: ['workers/inngest-jobs/brief/data.js', 'workers/cortex/agent/brief.js'],
  cancelled_calendar_ids: [
    'workers/inngest-jobs/brief/data.js',
    'workers/cortex/agent/tools/getDay.js',
    'workers/cortex/context/chatProjection.js',
  ],
  day_frame: ['workers/inngest-jobs/brief/data.js', 'workers/cortex/agent/tools/getDay.js'],
};

const DCO_UNREAD = {
  worlds_summary:
    'always null on the daily picture since stage 3: the Worlds summary is the weekly pass, which writes its own',
  welcome_back:
    'points to the questions about Chapters that passed while they were away; Chapter questions are off (James, stage 4c), so it is always null and nothing shows it',
  review_flags: 'what the check sent back, for the replays and check_runs, never for the person',
};

// what the row is: its owner, its day, when and how it was made
const DCO_RECORD_KEEPING = [
  'user_id',
  'date',
  'generated_at',
  'ttl_days',
  'model_used',
  'pipeline',
  'prompt_version',
];

// ── the ledger (workers/inngest-jobs/context/reader.js) ──────────────────────

const FACT_READERS = {
  statement: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/daily.js'],
  subject: ['workers/inngest-jobs/context/daily.js', 'workers/inngest-jobs/context/weekly.js'],
  timing: [
    'workers/shared/lifePack.js',
    'workers/inngest-jobs/context/daily.js',
    'workers/inngest-jobs/context/weekly.js',
    'workers/inngest-jobs/context/story.js',
    'workers/cortex/context/lifeContext.js',
  ],
  health: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/daily.js'],
  about_date: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/daily.js'],
  about_date_end: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/daily.js'],
  date_confidence: ['workers/inngest-jobs/context/daily.js'],
  state: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/daily.js'],
  said_by: ['workers/shared/factSource.js'],
  source_quote: ['workers/shared/factSource.js', 'workers/inngest-jobs/context/people.js'],
  private: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/daily.js'],
  observed_at: ['workers/shared/lifePack.js', 'workers/inngest-jobs/context/story.js'],
  last_confirmed_at: [
    'workers/inngest-jobs/context/daily.js',
    'workers/inngest-jobs/context/weekly.js',
  ],
  // the ledger review reads it (stage 4f). The life pack does not: grouped by
  // kind, Ask Gremly's replay came out a little worse (8 October), so what
  // each kind means for the brief and chat waits for its own replay
  kind: ['workers/inngest-jobs/context/review.js'],
};

const FACT_UNREAD = {};

const FACT_RECORD_KEEPING = [
  'id',
  'user_id',
  'source_table',
  'source_id',
  'run_id',
  'model',
  'prompt_version',
];

describe('every field the daily picture writes', () => {
  const keys = literalKeys(read('workers/inngest-jobs/context/daily.js'), 'const dco = {');

  it('is found', () => {
    expect(keys).toEqual(expect.arrayContaining(['lead_story', 'brief_headline', 'voice_note']));
  });

  it.each(keys.map((k) => [k]))('%s has a reader, or a reason it has none', (k) => {
    const listed = k in DCO_READERS || k in DCO_UNREAD || DCO_RECORD_KEEPING.includes(k);
    expect(listed ? k : `${k}: no reader and no reason`).toBe(k);
  });

  it.each(Object.entries(DCO_READERS).flatMap(([k, files]) => files.map((f) => [k, f])))(
    '%s is read by %s',
    (k, f) => expect(reads(f, k)).toBe(true),
  );
});

describe('every column the ledger reader writes', () => {
  const keys = literalKeys(read('workers/inngest-jobs/context/reader.js'), 'newRows.push({');

  it('is found', () => {
    expect(keys).toEqual(expect.arrayContaining(['statement', 'timing', 'about_date']));
  });

  it.each(keys.map((k) => [k]))('%s has a reader, or a reason it has none', (k) => {
    const listed = k in FACT_READERS || k in FACT_UNREAD || FACT_RECORD_KEEPING.includes(k);
    expect(listed ? k : `${k}: no reader and no reason`).toBe(k);
  });

  it.each(Object.entries(FACT_READERS).flatMap(([k, files]) => files.map((f) => [k, f])))(
    '%s is read by %s',
    (k, f) => expect(reads(f, k)).toBe(true),
  );
});
