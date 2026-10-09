/**
 * Corrections: when a person says something Gremly holds is wrong, the fact is
 * marked corrected with their words, and every place that repeated it is
 * rewritten straight away. Later runs see the correction and cannot bring the
 * old claim back.
 *
 * Three steps (data fabric stage 6). First a model works out what they put
 * right and what is true instead, from the ledger and their words alone, and
 * code changes the facts and people as it says. Then code finds, in
 * passage_refs, every stored sentence that rests on what changed, and each
 * goes back to its own writer's one sentence path with the records it rests on
 * as they now stand (correctionPassages.js). The profile, which no writer
 * records yet, is read once beside them. Code applies exactly what is
 * returned, to the ids it was shown, and nothing else.
 *
 * An answer to one of Gremly's questions arrives the same way. The model also
 * says whether their words answer the question at all: when they ask something
 * back, or speak of something else, the question stays open for another day
 * instead of being closed with words that were never its answer.
 */

import { CARE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { db, userTimezone, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { refreshLifeMapStory } from './story';
import { invalidateChatCache } from './cache';
import { peopleAfterCorrection, undoMerge } from './people';
import { answerPersonQuestion, settleGuess } from './peopleQuestions';
import { answerChapterQuestion, CHAPTER_QUESTION_KINDS } from './chapterAnswers';
import { personNow } from '../../shared/day.js';
import { FACT_TIMINGS, TIMING_RULES, validTiming } from '../../shared/factTiming.js';
import { restingPassages, rewritePassages, glanceable, tidyDay, moveDayRefs } from './correctionPassages';

export const CORRECTION_PROMPT_VERSION = 'correction-2026-10-18f';

const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    understood: { type: 'string' },
    answers_question: { type: 'boolean' },
    corrected_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact_ref: { type: 'string' }, why: { type: 'string' } },
        required: ['fact_ref', 'why'],
      },
    },
    changed_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact_ref: { type: 'string' }, why: { type: 'string' } },
        required: ['fact_ref', 'why'],
      },
    },
    happened_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact_ref: { type: 'string' }, why: { type: 'string' } },
        required: ['fact_ref', 'why'],
      },
    },
    private_fact_refs: { type: 'array', items: { type: 'string' } },
    // what they want Gremly to stop holding as part of their life
    set_aside_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact_ref: { type: 'string' }, why: { type: 'string' } },
        required: ['fact_ref', 'why'],
      },
    },
    new_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          subject: { type: 'string' },
          timing: { type: 'string', enum: FACT_TIMINGS, nullable: true },
          about_date: { type: 'string', nullable: true },
          about_date_end: { type: 'string', nullable: true },
          state: { type: 'string', enum: ['current', 'planned', 'happened'] },
        },
        required: ['statement', 'subject', 'timing', 'about_date', 'about_date_end', 'state'],
      },
    },
    retire_anchor_refs: { type: 'array', items: { type: 'string' } },
    line_refs: { type: 'array', items: { type: 'string' } },
    // who Gremly understood someone to be, without being told, that they say is not so
    understood_wrong: { type: 'array', items: { type: 'string' } },
    // two records Gremly joined as one person, without being told, that they say are two (peopleJoin.js)
    joined_wrong: { type: 'array', items: { type: 'string' } },
    // whether their answer says what Gremly thought is so (context/unsure.js)
    guess_holds: { type: 'string', enum: ['yes', 'no', 'unsure'], nullable: true },
  },
  required: ['understood', 'answers_question', 'corrected_facts', 'changed_facts', 'happened_facts', 'private_fact_refs', 'set_aside_facts', 'new_facts', 'retire_anchor_refs', 'line_refs', 'understood_wrong', 'joined_wrong', 'guess_holds'],
};

/**
 * What their words do to the question of Gremly's they were a reply to:
 * 'answered' when the model read them as its answer, 'open' when it did not,
 * so the question can be asked another day. Null when there is no question, or
 * it is already answered.
 */
export function questionOutcome(question, output) {
  if (!question || question.status === 'answered') return null;
  return output?.answers_question === false ? 'open' : 'answered';
}

function systemPrompt(today, person) {
  return `The person has told Gremly something that changes what it holds about their life: that something is wrong, that something has changed or already happened, an answer to one of Gremly's questions, or that something should be kept private. Your job is to work out exactly what it changes in the ledger, and only that. Every sentence Gremly wrote from what changes is written again afterwards by the writer that wrote it.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

WHAT TO DO
- Read what the person said, and the conversation around it when given. Work out precisely what they say is wrong and, if they say it, what is true instead.
- Mark every fact in the ledger that their correction contradicts as corrected. Do not mark facts it does not touch.
- When they say something has changed rather than that it was wrong, mark the old fact as changed instead, so it stays in their history as what was planned, and record the new version as a new fact.
- When they say something has happened or is done, mark that fact as happened.
- When what they said is given as their answer to one of Gremly's questions, first decide whether it answers it, and say so in answers_question. It answers the question when it tells Gremly what the question was asking, in whole or in part, or tells Gremly the question is wrong, no longer applies or is not one they want to be asked. It does not answer the question when it only asks Gremly something back, or speaks of something else and leaves what was asked as unknown as it was. When there is no question, answers_question is true.
- When it answers the question, apply the answer the same way: confirm, change, correct or add facts as the answer says. When it does not, the question tells you nothing new about their life: apply only what their own words say, which may be nothing.
- When the question asked about something Gremly thought but was not sure of, say in guess_holds whether their answer says it is so: yes, no, or unsure when it does not say. When it is so, record it as a new fact, as their answer and the question together say it, in their words wherever they gave any, unless the ledger already holds it. Otherwise guess_holds is null.
- When they ask Gremly to delete something, forget it or stop holding it, set aside every fact it concerns: Gremly stops holding them, and never takes them up again. Nothing about them was wrong, so mark nothing corrected for it. Saying how much something matters to them is never that ask.
- When what they say shows that who Gremly understood someone to be, without being told, is not so, give its ref in understood_wrong. When they also say who that person is, record it as a new fact.
- When what they say shows that people Gremly joined as one person, without being told, are two different people, give its ref in joined_wrong.
- When they ask for something to be kept private, mark the facts it concerns as private. Private things stay off notifications, headlines and card lines, and appear only where the person opens things on purpose, in their own words. Nothing about it was wrong, so mark nothing corrected for it.
- If they stated what is true, record it as a new fact in their words, with the day it is about whenever it has one: for something that comes round every year, the date of one of its days; for a stretch of time, its first day, and its last day in about_date_end. When the ledger already holds what they say, as they say it, add nothing beside it.
- Give each new fact its state as of today: planned when it is still ahead, current when it holds now or is under way today, and happened when it has happened.
- Retire any date anchor that only exists because of the wrong claim.
- When you are shown lines Gremly showed them, of their day or of a World or Chapter, and what they said is about those lines, name in line_refs each line that says something they have just said is not so, and each line seen at a glance that shows something they asked to keep private. Name none when what they said is about something else.
- Never argue with the correction and never keep the old claim in softened form.

${TIMING_RULES}

${WRITING_RULES}`;
}

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * A World's or Chapter's field the person wrote themselves. A correction never
 * writes over it: their words stay theirs, and they can change them on the
 * screen.
 */
export function isTheirs(row, field) {
  return row?.[`${field}_source`] === 'user';
}

/**
 * What a correction writes into a World's or Chapter's field: the new words and
 * when. Who wrote the field is left as it was, so Gremly's words stay marked as
 * his and the next writer can refresh them.
 */
export function correctedField(field, text, nowIso) {
  return { [field]: text, [`${field}_updated_at`]: nowIso };
}

/**
 * What a correction tidies besides the sentences resting on what changed: the
 * day's structured parts (its anchors, claims and reach), the Life Map's
 * evidence, story items wholly resting on corrected facts, the profile and the
 * live date anchors.
 */
async function loadAround(env, userId, today) {
  const d = db(env);
  const [dcoRows, lifeMapRows, profileRows, anchors, storyItems] = await Promise.all([
    d.select(`user_daily_state?user_id=eq.${userId}&date=gte.${today}&select=id,date,dco`),
    d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`),
    d.select(`user_profiles?user_id=eq.${userId}&select=user_id,profile_text`),
    d.select(`user_temporal_anchors?user_id=eq.${userId}&status=eq.active&select=id,title,description,resolved_date,source_message`),
    d.select(`story_items?user_id=eq.${userId}&state=eq.current&select=id,kind,title,body,fact_ids&limit=200`),
  ]);
  const anchorRefs = new Map();
  const anchorLines = (anchors || []).map((a, i) => {
    const ref = `a${i + 1}`;
    anchorRefs.set(ref, a);
    return `${ref} | ${a.resolved_date || 'no date'} | ${a.title}${a.description ? `: ${a.description}` : ''}`;
  });
  return {
    anchorRefs,
    anchorLines,
    lifeMap: lifeMapRows?.[0] || null,
    profile: profileRows?.[0] || null,
    dcoRows: dcoRows || [],
    storyItems: storyItems || [],
  };
}

/** The lines of a day Gremly showed them, by the field that holds each (daily.js). Pure. */
export function dayLinesOf(dco) {
  const lines = [];
  const add = (field, text) => {
    if (typeof text === 'string' && text.trim()) lines.push({ ref: `d${lines.length + 1}`, field, text });
  };
  if (!dco) return lines;
  add('brief_headline', dco.brief_headline);
  add('brief.day_shape', dco.brief?.day_shape);
  add('lead_story.what', dco.lead_story?.what);
  add('lead_story.why_today', dco.lead_story?.why_today);
  (dco.today_focus || []).forEach((t, i) => add(`today_focus.${i}`, t));
  (dco.also_matters || []).forEach((t, i) => add(`also_matters.${i}`, t));
  (dco.brief?.claims || []).forEach((c, i) => add(`brief.claims.${i}.why`, c?.why));
  add('brief.reach.why', dco.brief?.reach?.why);
  add('brief.return.note', dco.brief?.return?.note);
  return lines;
}

// The lines of a World or Chapter Gremly wrote, and the writer of each
// (data fabric stage 4b): the words under it, Gremly's notes on it and, for a
// Chapter that has ended, its memory.
const CARD_FIELDS = {
  worlds: [
    ['card_subtitle', 'words', 'the words under it'],
    ['summary', 'weekly', "Gremly's notes on it"],
  ],
  chapters: [
    ['card_subtitle', 'words', 'the words under it'],
    ['summary', 'weekly', "Gremly's notes on it"],
    ['epigraph', 'memory', 'its memory'],
  ],
};

/**
 * The lines of Worlds or Chapters Gremly showed them, by the field and writer
 * of each. A line they wrote themselves is theirs and is not among them: no
 * writer writes it again. Pure.
 */
export function cardLinesOf(rows, table) {
  const lines = [];
  for (const r of rows || []) {
    const name = table === 'worlds' ? r.display_name || r.name : r.title;
    for (const [field, writer, what] of CARD_FIELDS[table] || []) {
      const text = r[field];
      if (typeof text !== 'string' || !text.trim() || r[`${field}_source`] === 'user') continue;
      lines.push({
        ref: `c${lines.length + 1}`,
        field,
        text,
        where: `${table === 'worlds' ? 'World' : 'Chapter'} "${trim(name || 'unnamed', 80)}", ${what}`,
        row_table: table,
        row_id: r.id,
        writer,
        surface: table === 'worlds' ? 'world' : 'chapter',
        glance: glanceable({ writer, field }),
      });
    }
  }
  return lines;
}

/**
 * The lines Gremly showed them that what they said may be about: today's,
 * when it came from their day, or a World's or Chapter's, when it came from
 * one (all of that kind when the app did not say which).
 */
async function shownLines(d, userId, correction, dcoRows, today) {
  if (correction.surface === 'brief' || correction.target_kind === 'chat') {
    const day = dcoRows.find((r) => r.date === today);
    return day
      ? dayLinesOf(day.dco).map((l) => ({
          ...l,
          where: 'today',
          row_table: 'user_daily_state',
          row_id: day.id,
          writer: 'daily',
          surface: 'daily',
          glance: glanceable({ writer: 'daily', field: l.field }),
        }))
      : [];
  }
  const table = { chapter: 'chapters', world: 'worlds' }[correction.target_kind];
  if (!table) return [];
  const id = /^[0-9a-f-]{36}$/i.test(String(correction.target_ref?.id || '')) ? correction.target_ref.id : null;
  const cols =
    table === 'chapters'
      ? 'id,title,card_subtitle,card_subtitle_source,summary,summary_source,epigraph,epigraph_source'
      : 'id,name,display_name,card_subtitle,card_subtitle_source,summary,summary_source';
  const rows = await d.select(`${table}?owner_id=eq.${userId}${id ? `&id=eq.${id}` : ''}&select=${cols}&order=created_at.desc&limit=40`);
  return cardLinesOf(rows, table);
}

const PROFILE_SCHEMA = {
  type: 'object',
  properties: { same: { type: 'boolean' }, text: { type: 'string' } },
  required: ['same', 'text'],
};

/**
 * The profile every conversation reads, read once against what they put
 * right: returned with only what is now wrong changed, or as it was. No
 * writer records what the profile rests on, so it is the one text a
 * correction still reads whole.
 */
export async function profileAfterCorrection(env, { profileText, person, said, put, added }) {
  if (!profileText || !put.length) return null;
  const { output } = await jsonCall(env, {
    primary: modelFor(env, 'rewrite'),
    fallback: modelFor(env, 'rewriteFallback'),
    system: `You keep the short profile Gremly reads before every conversation with one person. They have just put something right about their life.

${personBlock(person)}

${CARE_RULES}

- When the profile says anything that is now wrong or out of date because of what they put right, return it with only that changed, so it reads naturally and keeps everything else exactly as it was. Never keep the old claim in a softened form.
- When it says nothing about what they put right, return same as true and the text as it was.

${WRITING_RULES}`,
    user: `WHAT THEY SAID: "${trim(said, 1200)}"

WHAT THEY PUT RIGHT (as the ledger now holds it):
${put.map((f) => `- ${f.statement} (${f.state === 'corrected' ? 'wrong, they said' : f.state === 'changed' ? 'it has changed' : 'it has happened'})`).join('\n')}
${added.length ? `\nWHAT IS TRUE INSTEAD, IN THEIR WORDS:\n${added.map((f) => `- ${f.statement}`).join('\n')}\n` : ''}
THE PROFILE:
${trim(profileText, 6000)}`,
    schema: PROFILE_SCHEMA,
    maxTokens: 4000,
    thinking: 'low',
    effort: 'low',
  });
  if (!output || output.same || typeof output.text !== 'string' || !output.text.trim()) return null;
  return output.text.trim();
}

/**
 * Apply one correction. Returns a summary of what changed.
 */
export async function applyCorrection(env, correctionId, runId) {
  const d = db(env);
  const [correction] = await d.select(`user_corrections?id=eq.${correctionId}&select=*`);
  if (!correction) throw new Error(`Correction ${correctionId} not found`);
  if (correction.status === 'applied') return { skipped: 'already_applied' };
  const userId = correction.user_id;
  // A retry after a partial failure starts clean: facts this correction added
  // are removed (states it set to corrected stay corrected, which is right).
  await d.remove(`life_facts?user_id=eq.${userId}&run_id=eq.${encodeURIComponent(runId)}`);
  await d.remove(`life_fact_changes?user_id=eq.${userId}&run_id=eq.${encodeURIComponent(runId)}`);
  // An answer to a question about someone in their life is read on its own:
  // it merges, declines or fills in a person, and changes nothing else
  // (context/peopleQuestions.js, data fabric stage 4c)
  // The same for a tidy up (data fabric stage 4f): the answer that says yes
  // does what was proposed to the facts it names, the answer that says no
  // leaves them, and anything else is read below like any answer.
  let restsOn = [];
  if (correction.surface === 'question' && /^[0-9a-f-]{36}$/i.test(correction.target_ref?.id || '')) {
    const [asked] = await d.select(
      `gremly_questions?id=eq.${correction.target_ref.id}&user_id=eq.${userId}&select=id,question,status,kind,proposed_change,rests_on,record_id,created_at`,
    );
    if (asked?.kind === 'person') return applyPersonAnswer(env, { correction, question: asked });
    // a Chapter started, closed or moved on their answer (context/chapterAnswers.js)
    if (CHAPTER_QUESTION_KINDS.includes(asked?.kind)) return applyChapterAnswer(env, { correction, question: asked });
    if (asked?.kind === 'tidy') {
      const done = await applyTidyAnswer(env, { correction, question: asked });
      if (done) return done;
    }
    // the facts a question rests on are read with the answer, whatever their age
    restsOn = (Array.isArray(asked?.rests_on) ? asked.rests_on : [])
      .filter((r) => r?.table === 'life_facts' && /^[0-9a-f-]{36}$/i.test(String(r.id || '')))
      .map((r) => r.id);
  }
  const tz = await userTimezone(env, userId);
  // their day, so a correction after midnight still reaches the day they are in
  const { today } = await personNow(env, userId, tz);

  // Context: the chat around the correction, when it came from a chat.
  let conversation = '';
  if (correction.chat_id) {
    const msgs = await d.select(
      `scope_chat_messages?chat_id=eq.${correction.chat_id}&created_at=lte.${encodeURIComponent(correction.created_at)}&select=role,content,created_at&order=created_at.desc&limit=8`,
    );
    conversation = msgs
      .reverse()
      .map((m) => `${m.role === 'user' ? 'Person' : 'Gremly'}: ${trim(m.content, 500)}`)
      .join('\n');
  }

  const facts = correction.fact_ids?.length
    ? await d.select(`life_facts_now?id=in.(${correction.fact_ids.join(',')})&user_id=eq.${userId}&select=id,statement,about_date,about_date_end,timing,state,private`)
    : await d.select(`life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed,happened)&select=id,statement,about_date,about_date_end,timing,state,private&order=last_confirmed_at.desc&limit=300`);
  // what the question was about comes first, wherever it stands
  if (restsOn.length) {
    const about = await d.select(
      `life_facts_now?id=in.(${restsOn.join(',')})&user_id=eq.${userId}&select=id,statement,about_date,about_date_end,timing,state,private`,
    );
    const seen = new Set(about.map((f) => f.id));
    facts.splice(0, facts.length, ...about, ...facts.filter((f) => !seen.has(f.id)));
  }
  // An answer to one of Gremly's questions arrives as a correction about that question.
  const [question] = correction.surface === 'question' && correction.target_ref?.id && /^[0-9a-f-]{36}$/i.test(correction.target_ref.id)
    ? await d.select(`gremly_questions?id=eq.${correction.target_ref.id}&user_id=eq.${userId}&select=id,question,status,kind,proposed_change`)
    : [];
  // what Gremly thought but was not sure of, when the question asked about it
  const unsureId = question?.kind === 'unsure' ? question.proposed_change?.unsure_id : null;
  const [thought] = unsureId
    ? await d.select(`life_unsure?id=eq.${unsureId}&user_id=eq.${userId}&select=id,thinks,status`)
    : [];
  const CHOICES = { wrong: 'It is wrong', changed: 'It has changed', done: 'It is done or has happened', private: 'Keep it private' };
  const choice = CHOICES[correction.target_ref?.kind] || null;
  const factRefs = new Map();
  const factLines = facts.map((f, i) => {
    const ref = `f${i + 1}`;
    factRefs.set(ref, f);
    // a day that comes round every year is shown as that, so its year is never read as the point
    const when =
      f.timing === 'yearly' && f.about_date
        ? `every year on ${String(f.about_date).slice(5, 10)}`
        : f.about_date
          ? `${f.about_date}${f.about_date_end && f.about_date_end !== f.about_date ? ` to ${f.about_date_end}` : ''}`
          : 'no date';
    return `${ref} | ${f.state}${f.private ? ' [private]' : ''} | ${when} | ${f.statement}`;
  });

  // who Gremly understood someone to be from the records, never told, which
  // what they say may put right (context/unsure.js)
  const understoodRows =
    (await d.select(
      `life_people?user_id=eq.${userId}&relationship_by=eq.understood&merged_into=is.null&select=id,name,relationship&order=updated_at.desc&limit=40`,
    )) || [];
  const understoodRefs = new Map(understoodRows.map((p, i) => [`u${i + 1}`, p]));
  const understoodLines = [...understoodRefs].map(([ref, p]) => `${ref} | ${trim(p.name, 60)} | ${trim(p.relationship, 60)}`);
  // people Gremly joined as one from the records, never told (peopleJoin.js)
  const joinRows = ((await d.select(
    `person_merges?user_id=eq.${userId}&status=eq.merged&select=id,kept_id,merged_id,moved&order=decided_at.desc&limit=40`,
  )) || []).filter((m) => m.moved?.by === 'understood');
  const joinPeople = joinRows.length
    ? new Map(
        ((await d.select(
          `life_people?user_id=eq.${userId}&id=in.(${[...new Set(joinRows.flatMap((m) => [m.kept_id, m.merged_id]))].join(',')})&select=id,name,relationship`,
        )) || []).map((p) => [p.id, p]),
      )
    : new Map();
  const joinRefs = new Map(joinRows.map((m, i) => [`j${i + 1}`, m]));
  const joinLines = [...joinRefs].map(([ref, m]) => {
    const who = (id) => {
      const p = joinPeople.get(id);
      return p ? `${trim(p.name || '(no name)', 60)}${p.relationship ? `, ${trim(p.relationship, 60)}` : ''}` : '(gone)';
    };
    return `${ref} | ${who(m.kept_id)} and ${who(m.merged_id)} | ${trim(m.moved?.why, 200)}`;
  });
  const { anchorRefs, anchorLines, profile, dcoRows, storyItems } = await loadAround(env, userId, today);
  const person = await personIdentity(env, userId);
  // what they said about lines Gremly showed them reaches those lines even
  // when it changes nothing in the ledger: step one names the lines it is about
  const shown = await shownLines(d, userId, correction, dcoRows, today);

  const user = `WHAT THE PERSON SAID (${correction.surface}${correction.target_kind ? `, about ${correction.target_kind}` : ''}):
"${trim(correction.said, 1500)}"
${question ? `\nTHIS IS THEIR ANSWER TO GREMLY'S QUESTION:\n"${trim(question.question, 400)}"\n` : ''}${thought ? `WHAT GREMLY THOUGHT BUT WAS NOT SURE OF, WHICH THE QUESTION ASKED ABOUT:\n"${trim(thought.thinks, 300)}"\n` : ''}${correction.target_ref?.text ? `\nTHE TEXT THEY MARKED AS NOT RIGHT:\n"${trim(correction.target_ref.text, 800)}"\n` : ''}${choice ? `WHAT THEY CHOSE: ${choice}\n` : ''}
${conversation ? `CONVERSATION AROUND IT:\n${conversation}\n` : ''}
LEDGER FACTS (ref | state | date, or its day each year | statement):
${factLines.join('\n') || '(none)'}

LIVE DATE ANCHORS (ref | date | title):
${anchorLines.join('\n') || '(none)'}${understoodLines.length ? `\n\nWHO GREMLY UNDERSTOOD SOMEONE TO BE FROM THE RECORDS, WITHOUT BEING TOLD (ref | name | who):\n${understoodLines.join('\n')}` : ''}${joinLines.length ? `\n\nPEOPLE GREMLY JOINED AS ONE FROM THE RECORDS, WITHOUT BEING TOLD (ref | the records joined | why):\n${joinLines.join('\n')}` : ''}${shown.length ? `\n\nTHE LINES GREMLY SHOWED THEM THAT THIS MAY BE ABOUT (ref | where | how it is seen | line):\n${shown.map((l) => `${l.ref} | ${l.where} | ${l.glance ? 'seen at a glance' : 'seen when they open it'} | ${trim(l.text, 300)}`).join('\n')}` : ''}`;

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'rewrite'),
    fallback: modelFor(env, 'rewriteFallback'),
    system: systemPrompt(today, person),
    user,
    schema: CORRECTION_SCHEMA,
    maxTokens: 8000,
    // low: the same calls on the replay and on real corrections, at a third
    // of the cost (scripts/corrections-replay, data fabric stage 6)
    thinking: 'low',
    effort: 'low',
  });

  const nowIso = new Date().toISOString();
  const result = { understood: output.understood, model, facts_corrected: 0, facts_changed: 0, facts_happened: 0, facts_made_private: 0, facts_set_aside: 0, facts_added: 0, passages_rewritten: 0, anchors_retired: 0 };
  const happenedFacts = [];
  const correctedIds = [];
  const correctedFacts = [];

  for (const c of output.corrected_facts || []) {
    const f = factRefs.get(c.fact_ref);
    if (!f || correctedIds.includes(f.id)) continue;
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, {
      state: 'corrected',
      correction_text: trim(correction.said, 600),
      corrected_at: nowIso,
      state_reason: trim(c.why, 400),
      updated_at: nowIso,
    });
    await d.insertQuiet('life_fact_changes', [
      { fact_id: f.id, user_id: userId, from_state: f.state, to_state: 'corrected', reason: trim(c.why, 400), source_table: 'user_corrections', source_id: correction.id, run_id: runId },
    ]);
    correctedIds.push(f.id);
    correctedFacts.push(f);
    result.facts_corrected++;
  }

  // Who someone is, when it came from a fact now corrected, is cleared:
  // blank is better than wrong (context/people.js)
  result.people = await peopleAfterCorrection(d, userId, correctedIds);
  // who Gremly understood someone to be, which they say is not so: blank, and
  // never understood again from the same records; what they say they are is a fact
  const unheld = [];
  for (const ref of output.understood_wrong || []) {
    const p = understoodRefs.get(ref);
    if (!p || unheld.includes(p.id)) continue;
    await d.update(`life_people?id=eq.${p.id}&user_id=eq.${userId}&relationship_by=eq.understood&name=not.is.null`, {
      relationship: null,
      relationship_by: 'gremly',
      updated_at: nowIso,
    });
    await d.update(`life_unsure?user_id=eq.${userId}&person_id=eq.${p.id}&kind=eq.who&status=in.(open,understood)`, {
      status: 'said_no',
      updated_at: nowIso,
    });
    unheld.push(p.id);
  }
  result.understood_put_right = unheld.length;
  // people Gremly joined as one, which they say are two: apart again, as they were
  let unjoined = 0;
  for (const ref of [...new Set(output.joined_wrong || [])]) {
    const m = joinRefs.get(ref);
    if (!m) continue;
    const r = await undoMerge(d, userId, m.id);
    if (r.undone) unjoined += 1;
  }
  result.joins_undone = unjoined;

  // Changed: the old version stays in their history as what was planned.
  const changedFacts = [];
  for (const c of output.changed_facts || []) {
    const f = factRefs.get(c.fact_ref);
    if (!f || correctedIds.includes(f.id) || changedFacts.some((x) => x.id === f.id)) continue;
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, { state: 'changed', state_reason: trim(c.why, 400), updated_at: nowIso });
    await d.insertQuiet('life_fact_changes', [
      { fact_id: f.id, user_id: userId, from_state: f.state, to_state: 'changed', reason: trim(c.why, 400), source_table: 'user_corrections', source_id: correction.id, run_id: runId },
    ]);
    changedFacts.push(f);
    result.facts_changed++;
  }
  // Happened or done, in the person's own word.
  const touched = new Set([...correctedIds, ...changedFacts.map((f) => f.id)]);
  for (const c of output.happened_facts || []) {
    const f = factRefs.get(c.fact_ref);
    if (!f || touched.has(f.id) || f.state === 'happened') continue;
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, { state: 'happened', state_reason: trim(c.why, 400), last_confirmed_at: nowIso, updated_at: nowIso });
    await d.insertQuiet('life_fact_changes', [
      { fact_id: f.id, user_id: userId, from_state: f.state, to_state: 'happened', reason: trim(c.why, 400), source_table: 'user_corrections', source_id: correction.id, run_id: runId },
    ]);
    touched.add(f.id);
    happenedFacts.push(f);
    result.facts_happened++;
  }
  // Keep it private: nothing was wrong, it just stays off glanceable places from now on.
  const privateFacts = [];
  for (const ref of output.private_fact_refs || []) {
    const f = factRefs.get(ref);
    if (!f || f.private || privateFacts.some((x) => x.id === f.id)) continue;
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, { private: true, updated_at: nowIso });
    privateFacts.push(f);
    result.facts_made_private++;
  }

  // Set aside: they asked Gremly to stop holding it, so it leaves every
  // writer's view and every sentence resting on it is written again.
  const setAsideFacts = [];
  for (const c of output.set_aside_facts || []) {
    const f = factRefs.get(c.fact_ref);
    if (!f || touched.has(f.id) || f.state === 'set_aside') continue;
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, { state: 'set_aside', state_reason: trim(c.why, 400), updated_at: nowIso });
    await d.insertQuiet('life_fact_changes', [
      { fact_id: f.id, user_id: userId, from_state: f.state, to_state: 'set_aside', reason: trim(c.why, 400), source_table: 'user_corrections', source_id: correction.id, run_id: runId },
    ]);
    touched.add(f.id);
    setAsideFacts.push(f);
    result.facts_set_aside++;
  }

  const newFactRows = (output.new_facts || [])
    .filter((f) => f.statement)
    .map((f) => ({
      // its id is given here, so a sentence written again can rest on it
      id: crypto.randomUUID(),
      user_id: userId,
      statement: trim(f.statement, 400),
      subject: f.subject ? trim(f.subject, 80) : null,
      about_date: /^\d{4}-\d{2}-\d{2}$/.test(f.about_date || '') ? f.about_date : null,
      // a stretch keeps its last day, never one before its first
      about_date_end:
        /^\d{4}-\d{2}-\d{2}$/.test(f.about_date || '') &&
        /^\d{4}-\d{2}-\d{2}$/.test(f.about_date_end || '') &&
        f.about_date_end > f.about_date
          ? f.about_date_end
          : null,
      timing: validTiming(f.timing),
      date_confidence: /^\d{4}-\d{2}-\d{2}$/.test(f.about_date || '') ? 'exact' : 'unknown',
      state: ['current', 'planned', 'happened'].includes(f.state) ? f.state : 'current',
      said_by: 'user',
      source_table: 'user_corrections',
      source_id: correction.id,
      source_quote: trim(correction.said, 300),
      observed_at: correction.created_at,
      run_id: runId,
      model,
    }));
  if (newFactRows.length) {
    await d.insertQuiet('life_facts', newFactRows);
    result.facts_added = newFactRows.length;
  }

  // The sentences resting on what changed, each sent back to its own writer
  // with the records it rests on as they now stand (correctionPassages.js).
  // Someone in a fact that changed is part of what changed.
  const changedIds = [
    ...correctedIds,
    ...changedFacts.map((f) => f.id),
    ...happenedFacts.map((f) => f.id),
    ...setAsideFacts.map((f) => f.id),
  ];
  const privateIds = privateFacts.map((f) => f.id);
  const personIds = [
    ...(changedIds.length
      ? ((await d.select(`life_fact_people?user_id=eq.${userId}&fact_id=in.(${changedIds.join(',')})&select=person_id`)) || []).map((x) => x.person_id)
      : []),
    // someone Gremly understood wrongly is part of what changed
    ...unheld,
  ];
  const resting = await restingPassages(d, userId, { changedIds, privateIds, personIds });
  // the lines they said are not so, or show what they keep private, sent
  // back to their writers whether or not anything in the ledger changed under them
  const named = new Set(output.line_refs || []);
  for (const l of shown.filter((x) => named.has(x.ref))) {
    const known = resting.find((r) => r.row_table === l.row_table && r.row_id === l.row_id && r.field === l.field);
    if (known) known.pointed = true;
    else {
      const [rec] =
        (await d.select(
          `passage_refs?user_id=eq.${userId}&row_table=eq.${l.row_table}&row_id=eq.${l.row_id}&field=eq.${encodeURIComponent(l.field)}&select=id,surface,row_table,row_id,field,fact_ids,person_ids,items,writer`,
        )) || [];
      resting.push({
        ...(rec || { surface: l.surface, row_table: l.row_table, row_id: l.row_id, field: l.field, fact_ids: [], person_ids: [], items: [], writer: l.writer }),
        why: 'pointed',
        pointed: true,
      });
    }
  }
  result.lines_named = shown.filter((x) => named.has(x.ref)).length;
  const added = newFactRows.map((f) => ({ id: f.id, statement: f.statement, about_date: f.about_date }));
  const rewrote = await rewritePassages(env, { userId, person, today, said: correction.said, added, rows: resting, nowIso });
  result.passages = { found: resting.length, ...rewrote, details: undefined };
  result.passages_rewritten = rewrote.rewritten + rewrote.cleared + rewrote.words + rewrote.memories;
  // what happened to each, by table, field and outcome; never the words
  result.passage_outcomes = rewrote.details.map((x) => ({ table: x.table, field: x.field, writer: x.writer, outcome: x.outcome, steps: x.steps || [] }));

  // Story items wholly resting on corrected facts are retired, and an item
  // resting on a fact now kept private becomes private too.
  let storyChanged = rewrote.details.some((x) => x.table === 'story_items' && x.outcome !== 'kept');
  // a fact they asked Gremly to stop holding goes as a corrected one does
  const corrected = new Set([...correctedIds, ...setAsideFacts.map((f) => f.id)]);
  const nowPrivate = new Set(privateIds);
  // an item its writer wrote again rests on what it now cites (correctionPassages.js)
  const rewritten = new Set(rewrote.details.filter((x) => x.table === 'story_items' && x.outcome === 'rewritten').map((x) => x.id));
  for (const it of storyItems) {
    if (nowPrivate.size && Array.isArray(it.fact_ids) && it.fact_ids.some((id) => nowPrivate.has(id))) {
      await d.update(`story_items?id=eq.${it.id}&user_id=eq.${userId}`, { private: true, updated_at: nowIso });
      storyChanged = true;
    }
    const allCorrected = Array.isArray(it.fact_ids) && it.fact_ids.length > 0 && it.fact_ids.every((id) => corrected.has(id));
    if (allCorrected && !rewritten.has(it.id)) {
      await d.update(`story_items?id=eq.${it.id}&user_id=eq.${userId}`, { state: 'corrected', correction_text: trim(correction.said, 600), updated_at: nowIso });
      storyChanged = true;
    }
  }

  const retiredTitles = [];
  for (const ref of output.retire_anchor_refs || []) {
    const a = anchorRefs.get(ref);
    if (!a) continue;
    await d.update(`user_temporal_anchors?id=eq.${a.id}&user_id=eq.${userId}`, { status: 'resolved', updated_at: nowIso });
    retiredTitles.push(a.title);
    result.anchors_retired++;
  }

  // Claims, the reach and date anchors drop anything corrected, changed or now
  // private. Read again, after the lines resting on them were written again.
  const scrubbed = [...correctedFacts, ...changedFacts, ...privateFacts, ...setAsideFacts];
  if (scrubbed.length || retiredTitles.length)
    for (const { id: rowId } of dcoRows) {
      const [row] = await d.select(`user_daily_state?id=eq.${rowId}&select=dco,dco_shadow`);
      if (!row) continue;
      const dco = row.dco || {};
      const moves = tidyDay(dco, scrubbed, retiredTitles);
      dco.corrections_applied = [...(dco.corrections_applied || []), { correction_id: correction.id, at: nowIso }];
      const patch = { dco, updated_at: nowIso };
      // The shadow DCO is scrubbed of corrected facts too, so comparisons stay fair.
      if (row.dco_shadow) {
        const sh = row.dco_shadow;
        tidyDay(sh, scrubbed, retiredTitles);
        patch.dco_shadow = sh;
      }
      await d.update(`user_daily_state?id=eq.${rowId}`, patch);
      // what each line rests on follows it to where it now is
      await moveDayRefs(d, userId, rowId, moves);
    }
  // Life Map evidence that rests on a corrected fact goes too, from the map as
  // it stands after its threads were written again.
  if (correctedFacts.length || setAsideFacts.length) {
    const [lm] = (await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`)) || [];
    if (lm?.life_map) {
      const ids = new Set([...correctedIds, ...setAsideFacts.map((f) => f.id)]);
      let changed = false;
      for (const dom of lm.life_map.domains || [])
        for (const t of dom?.threads || []) {
          if (!Array.isArray(t?.evidence)) continue;
          const kept = t.evidence.filter((e) => !ids.has(e?.fact_id));
          if (kept.length !== t.evidence.length) {
            t.evidence = kept;
            changed = true;
          }
        }
      if (changed) {
        lm.life_map.updated_at = nowIso;
        await d.update(`user_life_map?id=eq.${lm.id}`, { life_map: lm.life_map, updated_at: nowIso });
      }
    }
  }
  if (storyChanged) await refreshLifeMapStory(env, userId);
  // the profile, read once against what they put right
  try {
    const put = [...correctedFacts.map((f) => ({ ...f, state: 'corrected' })), ...changedFacts.map((f) => ({ ...f, state: 'changed' })), ...happenedFacts.map((f) => ({ ...f, state: 'happened' }))];
    const text = await profileAfterCorrection(env, { profileText: profile?.profile_text, person, said: correction.said, put, added });
    if (text) {
      await d.update(`user_profiles?user_id=eq.${userId}`, { profile_text: text });
      result.profile_rewritten = true;
    }
  } catch (err) {
    console.warn(`[ALERT][Corrections] the profile could not be read against a correction for ${userId}: ${String(err?.message || err).slice(0, 160)}`);
  }

  // Their words close the question only when they answer it. Asked something
  // back, or about something else, the question stays as it was, open for
  // another day, the way it does when they skip it.
  const outcome = questionOutcome(question, output);
  // kept with the correction, so a question left open can be traced to why
  if (question) result.answers_question = output.answers_question !== false;
  if (outcome === 'answered') {
    await d.update(`gremly_questions?id=eq.${question.id}&user_id=eq.${userId}`, { status: 'answered', answer: trim(correction.said, 1000), answered_at: nowIso });
    result.question_answered = question.id;
    // what Gremly thought is confirmed only when they say it is so; any other
    // answer closes it, as a no or as theirs to keep
    if (thought)
      result.guess = await settleGuess(d, userId, { id: thought.id, status: output.guess_holds === 'yes' ? 'confirmed' : 'said_no' }, nowIso);
  } else if (outcome === 'open') {
    result.question_left_open = question.id;
  }

  // Chat reads the corrected versions from its very next message.
  await invalidateChatCache(env, userId);
  await d.update(`user_corrections?id=eq.${correction.id}`, {
    status: 'applied',
    applied_at: nowIso,
    fact_ids: correctedIds.length ? correctedIds : correction.fact_ids,
    result,
  });
  return result;
}

/** The states a tidy up's yes moves its facts to, and from. */
const TIDY_MOVES = {
  // they said these plans happened
  happened: { to: 'happened', from: ['planned', 'unconfirmed'] },
};

/**
 * Tidy ups Gremly no longer offers (18 Oct): offering to set facts aside as
 * not part of their life judged their life for them. One still waiting is
 * closed by any tap and moves nothing.
 */
const TIDY_RETIRED = new Set(['set_aside']);

/** Whether their words are exactly one of the answers offered: a tap, not words of their own. */
function tapped(said, choice) {
  const a = String(said || '').trim().toLowerCase();
  const b = String(choice || '').trim().toLowerCase();
  return !!a && a === b;
}

/**
 * Apply an answer to a tidy up (data fabric stage 4f, context/review.js).
 * Their yes does what was proposed to the facts it names, and their no
 * leaves them as they are; either closes the question. Some of them is their
 * yes with the facts they ticked (target_ref.pick): only those, of the ones
 * it names. Anything else is words of their own, read by the correction
 * model like any answer: null.
 */
async function applyTidyAnswer(env, { correction, question }) {
  const change = question.proposed_change || {};
  const retired = TIDY_RETIRED.has(change.type);
  const move = retired ? null : TIDY_MOVES[change.type];
  const yes = tapped(correction.said, change.yes);
  const no = tapped(correction.said, change.no);
  if ((!move && !retired) || (!yes && !no)) return null;
  const d = db(env);
  const userId = correction.user_id;
  const nowIso = new Date().toISOString();
  if (retired) {
    const result = { tidy: question.id, type: change.type, retired: true, facts: 0 };
    if (question.status !== 'answered')
      await d.update(`gremly_questions?id=eq.${question.id}&user_id=eq.${userId}`, { status: 'expired' });
    await d.update(`user_corrections?id=eq.${correction.id}`, { status: 'applied', applied_at: nowIso, fact_ids: [], result });
    return result;
  }
  const named = (Array.isArray(change.fact_ids) ? change.fact_ids : []).filter((id) =>
    /^[0-9a-f-]{36}$/i.test(String(id)),
  );
  // the ones they ticked, when they chose some of them; never one it did not name
  const pick = Array.isArray(correction.target_ref?.pick) ? correction.target_ref.pick.map(String) : null;
  const ids = pick ? named.filter((id) => pick.includes(id)) : named;
  const result = {
    tidy: question.id,
    type: change.type,
    said: yes ? (pick ? 'some' : 'yes') : 'no',
    ...(pick ? { picked: ids.length, of: named.length } : {}),
  };
  if (question.status !== 'answered') {
    if (yes && ids.length) {
      const before = await d.select(
        `life_facts?user_id=eq.${userId}&id=in.(${ids.join(',')})&state=in.(${move.from.join(',')})&select=id,state`,
      );
      const reason = trim(`Their answer to "${question.question}": ${correction.said}`, 300);
      if (before.length) {
        // each change kept in the fact's history, as every correction's is,
        // and kept first: a retry after the move would find nothing to keep
        await d.insertQuiet(
          'life_fact_changes',
          before.map((f) => ({
            fact_id: f.id,
            user_id: userId,
            from_state: f.state,
            to_state: move.to,
            reason,
            source_table: 'user_corrections',
            source_id: correction.id,
            run_id: `tidy-${question.id}`,
          })),
        );
        await d.update(
          `life_facts?user_id=eq.${userId}&id=in.(${before.map((f) => f.id).join(',')})`,
          { state: move.to, state_reason: reason, updated_at: nowIso },
        );
      }
      result.facts = before.length;
    }
    await d.update(`gremly_questions?id=eq.${question.id}&user_id=eq.${userId}`, {
      status: 'answered',
      answer: trim(correction.said, 1000),
      answered_at: nowIso,
    });
    result.question_answered = question.id;
  }
  await invalidateChatCache(env, userId);
  await d.update(`user_corrections?id=eq.${correction.id}`, {
    status: 'applied',
    applied_at: nowIso,
    fact_ids: yes ? ids : [],
    result,
  });
  return result;
}

/**
 * Apply an answer to a question about someone in their life, and close the
 * question when the answer answers it. The next questions come with next
 * week's set (peopleQuestions.js writeQuestionSet).
 */
async function applyPersonAnswer(env, { correction, question }) {
  const d = db(env);
  const userId = correction.user_id;
  const nowIso = new Date().toISOString();
  const result = { person_question: question.id };
  if (question.status !== 'answered') {
    Object.assign(
      result,
      await answerPersonQuestion(env, { userId, question, said: correction.said }),
    );
    if (result.answers) {
      await d.update(`gremly_questions?id=eq.${question.id}&user_id=eq.${userId}`, {
        status: 'answered',
        answer: trim(correction.said, 1000),
        answered_at: nowIso,
      });
      result.question_answered = question.id;
    } else {
      result.question_left_open = question.id;
    }
  }
  await invalidateChatCache(env, userId);
  await d.update(`user_corrections?id=eq.${correction.id}`, {
    status: 'applied',
    applied_at: nowIso,
    result,
  });
  return result;
}

/**
 * Apply an answer to a question about a Chapter, and close the question when
 * the answer answers it; touch no fact.
 */
async function applyChapterAnswer(env, { correction, question }) {
  const d = db(env);
  const userId = correction.user_id;
  const nowIso = new Date().toISOString();
  const result = { chapter_question: question.id };
  if (question.status !== 'answered') {
    Object.assign(result, await answerChapterQuestion(env, { userId, question, said: correction.said }));
    if (result.answers) {
      await d.update(`gremly_questions?id=eq.${question.id}&user_id=eq.${userId}`, {
        status: 'answered',
        answer: trim(correction.said, 1000),
        answered_at: nowIso,
      });
      result.question_answered = question.id;
    } else {
      result.question_left_open = question.id;
    }
  }
  await invalidateChatCache(env, userId);
  await d.update(`user_corrections?id=eq.${correction.id}`, {
    status: 'applied',
    applied_at: nowIso,
    result,
  });
  return result;
}

/** Corrections the person made recently, for every later prompt to honour. */
export async function recentCorrections(env, userId, days = 120) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await db(env).select(
    `life_facts?user_id=eq.${userId}&state=eq.corrected&corrected_at=gte.${encodeURIComponent(since)}&select=statement,correction_text,corrected_at&order=corrected_at.desc&limit=50`,
  );
  return rows;
}
