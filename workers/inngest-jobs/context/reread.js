/**
 * The catch up (data fabric stage 4d): everything a person made before the
 * reader's current rules is read again under them, so a better rule reaches
 * all they ever said, not only what comes next.
 *
 * Each record the reader reads is marked with the rules that read it
 * (ledger_reads, reader.js markRead). The catch up reads, oldest first, every
 * record up to the reader's cursor that carries no mark of the current
 * rules. It shows each one as read before, beside the ledger facts already
 * taken from it, and keeps only what was missed: the ledger already holds
 * what came after these records, so it adds facts and changes none (what it
 * would change is counted and left, reader.js readChunk). The records are
 * those the person made (what was made, done, said and answered); changes
 * and deletes are already in the ledger as they stand.
 *
 * Run it in shadow first (scripts/shadow/run.sh reread), then live with the
 * event app/ledger.read { user_id, reread: true } (context/functions.js),
 * which never runs beside a read for the same person.
 */

import { db, userTimezone } from './db';
import {
  READER_PROMPT_VERSION,
  buildRecordList,
  chunkRecords,
  chunkRunId,
  factsFrom,
  loadRecords,
  markTable,
  readChunk,
  readCursor,
  rollbackRun,
} from './reader';

/** Where history starts, for the catch up: before anyone's first record. */
export const HISTORY_START = '2025-01-01T00:00:00Z';
/** The catch up loads history a season at a time, so no load is too long. */
const SEASON_DAYS = 92;

/** What a person made in a window, without the changes and deletes. */
export function madeOnly(rows) {
  return { ...rows, changed: [], deleted: [], reviews: [] };
}

/**
 * The records in a list already read under the current rules, as "table:id".
 * Read in parts by id. A mark that cannot be read is said loudly, and the
 * record is taken as not read (it is read again, never skipped).
 */
export async function readMarks(d, userId, items) {
  const ids = [...new Set(items.map((i) => String(i.id)))];
  const fresh = new Set();
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    try {
      const rows = await d.select(
        `ledger_reads?user_id=eq.${userId}&reader_version=eq.${encodeURIComponent(READER_PROMPT_VERSION)}&source_id=in.(${part.join(',')})&select=source_table,source_id&limit=1000`,
      );
      for (const r of rows || []) fresh.add(`${r.source_table}:${r.source_id}`);
    } catch (err) {
      console.warn(
        `[ALERT][Reread] could not read the marks for ${userId}: ${err?.message || err}`,
      );
    }
  }
  return fresh;
}

/** The records in a window not yet read under the current rules, as the reader shows them. */
async function staleIn(env, d, userId, tz, fromIso, toIso) {
  // what was made in the window, each record once: a save that reached the
  // server late is read in the window of when it was made
  const rows = await loadRecords(env, userId, fromIso, toIso, { runSince: fromIso, late: false });
  const items = await buildRecordList(env, tz, madeOnly(rows));
  const fresh = await readMarks(d, userId, items);
  return items.filter((i) => !fresh.has(`${markTable(i)}:${i.id}`));
}

/**
 * Plan a person's catch up: the windows of their history, up to the reader's
 * cursor, that hold records not yet read under the current rules, each the
 * size of one read (as reader.js planWindows). Only the window bounds are
 * returned, so the plan passes between Inngest steps; each window is loaded
 * again when it is read.
 */
export async function planReread(env, userId, { untilIso = null } = {}) {
  const d = db(env);
  const tz = await userTimezone(env, userId);
  const cursor = await readCursor(env, userId);
  const until = untilIso || cursor?.read_through || null;
  if (!until) return { tz, until: null, windows: [], total: 0 };
  const stale = [];
  let from = HISTORY_START;
  while (from < until) {
    const next = new Date(Date.parse(from) + SEASON_DAYS * 864e5).toISOString();
    const to = next < until ? next : until;
    stale.push(...(await staleIn(env, d, userId, tz, from, to)));
    from = to;
  }
  const windows = [];
  let start = HISTORY_START;
  for (const c of chunkRecords(stale)) {
    const to = c[c.length - 1].at;
    // a record split in parts keeps its parts in one window
    if (windows.length && to === windows[windows.length - 1].to) {
      windows[windows.length - 1].n += c.length;
      continue;
    }
    windows.push({ from: start, to, n: c.length });
    start = to;
  }
  return { tz, until, windows, total: stale.length, version: READER_PROMPT_VERSION };
}

/**
 * Read one window of the catch up, (from, to]: the records in it not yet read
 * under the current rules, each shown as read before with the ledger facts
 * taken from it. A retry starts clean, as reader.js readWindow does.
 */
export async function rereadWindow(env, userId, tz, fromIso, toIso, runId) {
  const d = db(env);
  const stale = await staleIn(env, d, userId, tz, fromIso, toIso);
  const totals = { records: 0, facts_added: 0, confirmed: 0, rejected: 0, marked: 0 };
  if (!stale.length) return totals;
  const facts = await factsFrom(
    d,
    userId,
    stale.map((i) => ({ id: i.id })),
    { all: true },
  );
  for (const i of stale) {
    i.kind = 'read_before';
    i.factIds = facts.get(`${i.table}:${i.id}`) || [];
  }
  const chunks = chunkRecords(stale);
  for (const chunk of chunks) await rollbackRun(d, userId, chunkRunId(runId, chunk));
  for (const chunk of chunks) {
    const c = await readChunk(env, userId, tz, chunk, runId, { reread: true });
    for (const k of Object.keys(c)) totals[k] = (totals[k] || 0) + (c[k] || 0);
  }
  return totals;
}
