/**
 * Gremly's questions about Chapters (data fabric stage 4c): whether one past
 * its dates is over, and the welcome back. Suggesting one to start moved to
 * the weekly pass on 18 Oct (context/weekly.js, chapter_forming): this daily
 * suggester saw only drops filed in no Chapter, so a launch they kept working
 * on inside one of their Worlds was never offered.
 *
 * Built and replayed here, and on since 8 Oct, when their answers came to be
 * acted on (context/chapterAnswers.js). While CHAPTER_QUESTIONS is off
 * (chapterQuestionsOn), nothing is written; the shadow runner and the replay
 * run them dry.
 *
 * They are asked by the rules every question keeps
 * (workers/shared/questionRules.js): never at the moment of dropping, in the
 * brief and the wrap up only, at most one suggestion open at a time, a no
 * never asked again, and nothing new while the person is away.
 *
 *   Closing     once a day, code finds the open Chapters whose end date has
 *               passed, and those with none and nothing filed in them for
 *               four weeks. A model writes the question for each, with its
 *               guess from the records. The classifier never closes one.
 *   Welcome     on the day they come back after WELCOME_BACK_DAYS or more
 *   back        away, code lists the Chapters whose dates passed while they
 *               were away and what is still ahead; one call guesses each from
 *               the records, and they are saved as one set. The daily picture
 *               points to the set (context/daily.js).
 *
 * Code decides which Chapters and drops by ids, phases and dates. It never
 * reads the person's words to decide anything.
 */

import { db, addDays, personIdentity, localDate, localDateTime } from './db';
import { jsonCall, modelFor, effortFor } from './llm';
import { LIFE_MAP_RULES, lifeMapSection, loadLifeMapLines } from './lifeMap';
import { CARE_RULES, PRIVATE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { readItems, readItemMarks, markItems } from './filed';
import { personToday } from './filing';
import { questionRoom } from './questionRoom';
import {
  WELCOME_BACK_DAYS,
  AWAY_AFTER_DAYS,
  CHAPTER_QUIET_DAYS,
  chapterQuestionsOn,
} from '../../shared/questionRules.js';
import { OPEN_CHAPTER_PHASES } from '../../shared/upNext.js';

export const CHAPTER_QUESTIONS_VERSION = 'chapter-questions-2026-10-18e';

/** Close questions written in a day at most. */
const MOST_CLOSE_A_DAY = 3;

const day = (v) => {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** The answers to tap: two to four, short, each once. Pure. */
export function cleanChoices(choices) {
  const out = [];
  for (const c of choices || []) {
    const s = trim(c, 40);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 4);
}

// ── when ─────────────────────────────────────────────────────────────────

/**
 * Whether the person is away, or back today after a long time away, from the
 * absence snapshot (absence_snapshot). Pure. Someone never seen is away.
 */
export function awayState(absence) {
  const since = absence?.days_since_active;
  const before = absence?.days_away_before_today;
  return {
    away: since == null || since > AWAY_AFTER_DAYS,
    welcomeBack: absence?.active_today === true && before != null && before >= WELCOME_BACK_DAYS,
    lastActiveBefore: day(absence?.last_active_day_before_today),
  };
}

const isOpen = (c) => OPEN_CHAPTER_PHASES.includes(c.phase) && !c.closed_at;

/**
 * The key a close question's no is remembered by: the Chapter and the end
 * date it had, or for one with no end date, the day something last came into
 * it, so something new coming in lets it be asked again later.
 */
export const closeNoKey = (c) =>
  c.quiet_since ? `close:${c.id}:quiet:${c.quiet_since}` : `close:${c.id}:${day(c.end_date)}`;

/**
 * The open Chapters that may be over: those whose end date has passed, and
 * those with no end date that nothing new has come into for a while, with no
 * question open about them and none answered for the same end date or the
 * same quiet. Pure.
 * @param lastSign Map Chapter id -> the day something was last filed in it
 */
export function closeCandidates({ chapters, today, asked = new Set(), noKeys = new Set(), lastSign = new Map() }) {
  const quietBefore = addDays(today, -CHAPTER_QUIET_DAYS);
  const out = [];
  for (const c of (chapters || []).filter(isOpen)) {
    if (asked.has(c.id)) continue;
    const end = day(c.end_date);
    if (end) {
      if (end < today && !noKeys.has(closeNoKey(c))) out.push({ c, since: end });
      continue;
    }
    // no end date: the latest of its start and what was last filed in it
    const last = [day(lastSign.get(c.id)), day(c.start_date)].filter(Boolean).sort().pop() || null;
    if (!last || last >= quietBefore) continue;
    const quiet = { ...c, quiet_since: last };
    if (!noKeys.has(closeNoKey(quiet))) out.push({ c: quiet, since: last });
  }
  return out.sort((a, b) => a.since.localeCompare(b.since)).map((x) => x.c);
}

/**
 * The open questions about Chapters, split into those still about an open
 * Chapter (or a suggestion) and those about one no longer open. Pure.
 */
export function staleChapterQuestions(open, chapters) {
  const openIds = new Set((chapters || []).map((c) => c.id));
  const stale = (open || []).filter(
    (q) => (q.kind === 'close_chapter' || q.kind === 'while_away') && q.record_id && !openIds.has(q.record_id),
  );
  return { live: (open || []).filter((q) => !stale.includes(q)), stale };
}

/**
 * For a welcome back: the open Chapters whose end date passed while they were
 * away, and those still ahead. Pure.
 */
export function whileAway({ chapters, today, since }) {
  const open = (chapters || []).filter(isOpen);
  const passed = open.filter((c) => {
    const end = day(c.end_date);
    return end && end < today && (!since || end >= since);
  });
  const ahead = open
    .filter(
      (c) =>
        (day(c.start_date) && day(c.start_date) >= today) ||
        (day(c.end_date) && day(c.end_date) >= today),
    )
    .sort((a, b) =>
      String(day(a.start_date) || day(a.end_date)).localeCompare(
        String(day(b.start_date) || day(b.end_date)),
      ),
    )
    .slice(0, 5);
  return { passed, ahead };
}

/**
 * Whether a suggestion rests mostly on items the person already said no to:
 * half or more of its items were in one they turned down. Pure; ids alone.
 */
export function restsOnDeclined(items, declined) {
  const mine = new Set((items || []).map((i) => `${i.table}:${i.id}`));
  if (!mine.size) return false;
  return (declined || []).some((set) => {
    const theirs = new Set((set || []).map((i) => `${i.table}:${i.id}`));
    let shared = 0;
    for (const k of mine) if (theirs.has(k)) shared++;
    return shared * 2 >= mine.size;
  });
}

/** The key a suggestion's no is remembered by: the items it rests on. */
export const startNoKey = (items) =>
  `start:${[...items]
    .map((i) => `${i.table}:${i.id}`)
    .sort()
    .join(',')}`.slice(0, 900);

// ── the records each question is written from ───────────────────────────

/** What is filed in each Chapter, newest first, and the facts dated in its span. */
/** The day something was last filed in each of these Chapters. */
async function lastFiled(d, userId, chapters) {
  const out = new Map();
  for (const c of chapters) {
    const [last] =
      (await d.select(
        `drop_chapter_links?owner_id=eq.${userId}&chapter_id=eq.${c.id}&select=created_at&order=created_at.desc&limit=1`,
      )) || [];
    if (last?.created_at) out.set(c.id, day(last.created_at));
  }
  return out;
}

async function chapterRecords(d, userId, chapters) {
  const out = new Map();
  for (const c of chapters) {
    const links =
      (await d.select(
        `drop_chapter_links?owner_id=eq.${userId}&chapter_id=eq.${c.id}&select=drop_id,drop_type&order=created_at.desc&limit=20`,
      )) || [];
    const items = (await readItems(d, userId, links)).sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')),
    );
    const marked = markItems(items, [], await readItemMarks(d, userId, items));
    const start = day(c.start_date);
    const end = day(c.end_date);
    // the facts read from what is filed in it, and for one with an end date,
    // those about its days; one with no end date has no days to bound
    const fromItems = links.length
      ? (await d.select(
          `life_facts_now?user_id=eq.${userId}&source_id=in.(${links.map((l) => l.drop_id).join(',')})&state=in.(current,planned,unconfirmed,happened,changed)&select=id,statement,about_date,state,private,health&order=about_date.desc.nullslast&limit=15`,
        )) || []
      : [];
    const ofDays = end
      ? (await d.select(
          `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed,happened,changed)${start ? `&about_date=gte.${start}` : ''}&about_date=lte.${addDays(end, 14)}&select=id,statement,about_date,state,private,health&order=about_date.asc&limit=15`,
        )) || []
      : [];
    const seen = new Set();
    const facts = [...fromItems, ...ofDays]
      .filter((f) => !seen.has(f.id) && seen.add(f.id))
      .sort((a, b) => String(a.about_date || '').localeCompare(String(b.about_date || '')));
    out.set(c.id, { items: marked, facts });
  }
  return out;
}

const itemLine = (it) =>
  `  - ${it.private || it.health ? '[private] ' : ''}${it.type}${it.done ? `, done ${it.done}` : ''} | ${it.date || 'no day'} | ${trim(it.title, 100)}${it.body && it.body !== it.title ? `: ${trim(it.body, 200)}` : ''}`;
const factLine = (f) =>
  `  - ${f.private || f.health ? '[private] ' : ''}${f.state} | ${f.about_date || 'no date'} | ${trim(f.statement, 200)}`;
const chapterLine = (ref, c, world) =>
  `${ref} | ${trim(c.title, 80)} | ${day(c.start_date) || 'no start set'} to ${day(c.end_date) || 'no end set'}${c.quiet_since ? ` | nothing new filed in it since ${c.quiet_since}` : ''}${world ? ` | in the World ${trim(world.display_name || world.name, 60)}` : ''}`;

// ── closing and the welcome back: one writer, two moments ────────────────

const CLOSE_RULES = `A QUESTION ABOUT A CHAPTER THAT MAY BE OVER
- A Chapter is something in the person's life with a shape of its own, inside a World, and it may have dates. Gremly never closes a Chapter: it asks, and the person decides.
- Each Chapter given is past its end date, or has no end date and nothing new has been filed in it for a while.
- For each Chapter given, guess from its records whether it is over, still going, or has moved to new dates: over when the records show it ended or nothing shows it going on, still going when later records show it continuing, moved when the records give it new dates, unsure when they do not say.
- Then write one short, warm question to them, as you, that offers your guess for them to confirm or change, without presuming it. It is a single sentence that says nothing of dates passing, of things going quiet, of records, or of how you came to your guess. Name the Chapter as its title does.
- Give two to four short answers they could tap, a few words each, among them that it is over and that it is still going, or for one still ahead, that it is still on and that it is not. They can always answer in their own words instead.
- A record marked private may help you understand, and is never named or hinted at in the question.`;

const WELCOME_RULES = `THE WELCOME BACK
- The person has been away from the app for a while and has just come back. Gaps in app use say nothing about how their life went.
- Some Chapters' dates passed while they were away, and some are still ahead. For each one given, guess from its records what became of it, and write the question that offers your guess, as above. For one still ahead, the guess is whether it is still on.
- The questions travel together as one welcome back, so each stands on its own and none repeats another.`;

const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapter_ref: { type: 'string' },
          guess: {
            type: 'string',
            enum: ['over', 'still_going', 'moved', 'still_ahead', 'unsure'],
          },
          new_start_date: { type: 'string', nullable: true },
          new_end_date: { type: 'string', nullable: true },
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          why: { type: 'string' },
        },
        required: [
          'chapter_ref',
          'guess',
          'new_start_date',
          'new_end_date',
          'question',
          'choices',
          'why',
        ],
      },
    },
  },
  required: ['questions'],
};

/** The close (or welcome back) writer's request, and its refs. Pure. */
export function closeRequest({ chapters, records, worlds, person, today, welcome = false, lifeMap = [] }) {
  const refs = new Map();
  const worldOf = new Map((worlds || []).map((w) => [w.id, w]));
  const blocks = chapters.map((c, i) => {
    const ref = `k${i + 1}`;
    refs.set(ref, c);
    const r = records.get(c.id) || { items: [], facts: [] };
    return `${chapterLine(ref, c, worldOf.get(c.primary_world_id))}
  what is filed in it, newest first:
${r.items.map(itemLine).join('\n') || '  (nothing filed)'}
  what Gremly holds from its days:
${r.facts.map(factLine).join('\n') || '  (nothing)'}`;
  });
  return {
    system: {
      fixed: `You write Gremly's questions about Chapters, for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${PRIVATE_RULES}

${CLOSE_RULES}${welcome ? `\n\n${WELCOME_RULES}` : ''}${lifeMap.length ? `\n\n${LIFE_MAP_RULES}` : ''}

${WRITING_RULES}`,
      varying: personBlock(person),
    },
    user: `TODAY: ${today}.

CHAPTERS (ref | title | dates | World, then its records):
${blocks.join('\n\n')}${lifeMap.length ? `\n\n${lifeMapSection(lifeMap)}` : ''}`,
    refs,
  };
}

/** The rows the close (or welcome back) writer's answer makes. Pure. */
export function closeRows({ output, refs, userId, runId, kind = 'close_chapter', setId = null }) {
  const rows = [];
  const problems = [];
  const seen = new Set();
  for (const q of output?.questions || []) {
    const c = refs.get(q?.chapter_ref);
    if (!c) {
      problems.push('a ref it was never given');
      continue;
    }
    if (seen.has(c.id)) continue;
    const question = trim(q.question, 300);
    const choices = cleanChoices(q.choices);
    if (!question || choices.length < 2) {
      problems.push(`${q.chapter_ref}: no question or fewer than two answers`);
      continue;
    }
    seen.add(c.id);
    const start = day(q.new_start_date);
    const end = day(q.new_end_date);
    rows.push({
      user_id: userId,
      kind,
      question,
      choices,
      status: 'open',
      record_table: 'chapters',
      record_id: c.id,
      proposed_change: {
        type: kind === 'while_away' ? 'while_away' : 'close',
        chapter_id: c.id,
        guess: q.guess,
        ...(q.guess === 'moved' && (start || end) ? { start_date: start, end_date: end } : {}),
        end_date_was: day(c.end_date),
      },
      no_key: kind === 'close_chapter' ? closeNoKey(c) : null,
      set_id: setId,
      run_id: runId,
      prompt_version: CHAPTER_QUESTIONS_VERSION,
    });
  }
  return { rows, problems };
}

// ── the day's run ────────────────────────────────────────────────────────

/**
 * Raise the day's Chapter questions for one person: a welcome back on the day
 * they come back after a long time away; otherwise, when they are not away,
 * the close questions due and at most one suggestion. Nothing is written while
 * the switch is off, or in a dry run; what would be is returned.
 */
export async function chapterQuestionsForDay(env, userId, { dryRun = false } = {}) {
  const write = !dryRun && chapterQuestionsOn(env);
  const d = db(env);
  const [today, absence, person, lifeMap] = await Promise.all([
    personToday(env, userId),
    d.rpc('absence_snapshot', { p_user: userId }),
    personIdentity(env, userId),
    loadLifeMapLines(env, d, userId, 'chapter_questions'),
  ]);
  const state = awayState(absence);
  const out = { today, written: write, away: state.away, welcome_back: state.welcomeBack };
  if (state.away && !state.welcomeBack) return { ...out, skipped: 'away' };
  const [chapters, worlds, open, answered] = await Promise.all([
    d.select(
      `chapters?owner_id=eq.${userId}&phase=in.(${OPEN_CHAPTER_PHASES.join(',')})&closed_at=is.null&select=id,title,phase,start_date,end_date,closed_at,primary_world_id&order=created_at.asc`,
    ),
    d.select(
      `worlds?owner_id=eq.${userId}&phase=eq.active&select=id,name,display_name&order=created_at.asc`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=in.(start_chapter,close_chapter,while_away)&status=in.(open,asked)&select=id,kind,record_id,set_id,created_at`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=in.(start_chapter,close_chapter)&status=in.(answered,dismissed)&select=kind,no_key,rests_on,proposed_change`,
    ),
  ]);
  const runId = `chapter-questions-${userId.slice(0, 8)}-${today}`;
  // only as many as there is room for (questionRoom), taken in the order asked;
  // a welcome back is one set the brief puts, and is not counted
  let room = null;
  const insert = async (rows, { counted = true } = {}) => {
    if (!write || !rows.length) return;
    if (counted && room == null) room = await questionRoom(d, userId);
    const kept = counted ? rows.slice(0, room) : rows;
    if (counted) {
      room -= kept.length;
      if (kept.length < rows.length) out.no_room = (out.no_room || 0) + rows.length - kept.length;
    }
    if (kept.length) await d.insertQuiet('gremly_questions', kept);
  };

  // a question about a Chapter that is no longer open (they closed it, or it
  // went) is put away, so they are never asked about something already settled
  const { live, stale } = staleChapterQuestions(open, chapters);
  if (stale.length) {
    out.retired = stale.map((q) => q.id);
    if (write)
      for (const q of stale)
        await d.update(`gremly_questions?id=eq.${q.id}&user_id=eq.${userId}&status=in.(open,asked)`, {
          status: 'expired',
        });
  }

  // the welcome back, once for each return
  if (state.welcomeBack) {
    const already = (live || []).some(
      (q) => q.kind === 'while_away' && String(q.created_at).slice(0, 10) >= addDays(today, -1),
    );
    const { passed, ahead } = whileAway({ chapters, today, since: state.lastActiveBefore });
    if (already || !passed.length)
      return {
        ...out,
        welcome: { skipped: already ? 'already made' : 'nothing passed while away' },
      };
    const list = [...passed, ...ahead];
    const records = await chapterRecords(d, userId, list);
    const setId = crypto.randomUUID();
    const { rows, problems, model } = await askClose(env, {
      chapters: list,
      records,
      worlds,
      person,
      today,
      welcome: true,
      userId,
      runId,
      setId,
      lifeMap,
    });
    await insert(rows, { counted: false });
    return { ...out, welcome: { set_id: setId, rows, problems, model } };
  }

  // closing: the Chapters past their end date, a few a day
  const asked = new Set(
    (live || []).filter((q) => q.kind === 'close_chapter').map((q) => q.record_id),
  );
  const noKeys = new Set(
    (answered || []).filter((q) => q.kind === 'close_chapter').map((q) => q.no_key),
  );
  const due = closeCandidates({
    chapters,
    today,
    asked,
    noKeys,
    lastSign: await lastFiled(d, userId, (chapters || []).filter((c) => !day(c.end_date))),
  }).slice(0, MOST_CLOSE_A_DAY);
  if (due.length) {
    const records = await chapterRecords(d, userId, due);
    const { rows, problems, model } = await askClose(env, {
      chapters: due,
      records,
      worlds,
      person,
      today,
      userId,
      runId,
      lifeMap,
    });
    await insert(rows);
    out.close = { rows, problems, model };
  }

  return out;
}

/**
 * Ask for the close (or welcome back) questions about these Chapters and check
 * what comes back. Writes nothing; the replay calls it as the worker does.
 */
export async function askClose(
  env,
  { chapters, records, worlds, person, today, welcome = false, userId, runId, setId = null, lifeMap = [] },
) {
  const req = closeRequest({ chapters, records, worlds, person, today, welcome, lifeMap });
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'chapterQuestion'),
    fallback: modelFor(env, 'chapterQuestionFallback'),
    system: req.system,
    user: req.user,
    schema: CLOSE_SCHEMA,
    maxTokens: welcome ? 3000 : 2000,
    ...effortFor(env, 'chapter_questions'),
  });
  return {
    ...closeRows({
      output,
      refs: req.refs,
      userId,
      runId,
      kind: welcome ? 'while_away' : 'close_chapter',
      setId,
    }),
    output,
    model,
  };
}

/** The hour of their day the day's Chapter questions are raised, before the brief. */
export const CHAPTER_QUESTIONS_HOUR = 5;

/**
 * The events for the people whose early morning hour it is, among those active
 * in the last 30 days, while the switch is on. Nothing while it is off.
 */
export async function chapterQuestionEvents(env, at = new Date()) {
  if (!chapterQuestionsOn(env)) return [];
  const people = (await db(env).rpc('get_active_people', { active_days: 30 })) || [];
  const events = [];
  for (const p of people) {
    const tz = p.timezone || 'America/Los_Angeles';
    const hour = Number(String(localDateTime(tz, at.toISOString()) || '').slice(11, 13));
    if (hour !== CHAPTER_QUESTIONS_HOUR) continue;
    events.push({
      id: `chapter-questions-${p.user_id}-${localDate(tz, at)}`,
      name: 'app/chapters.questions',
      data: { user_id: p.user_id },
    });
  }
  return events;
}
