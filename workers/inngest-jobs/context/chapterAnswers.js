/**
 * Acting on an answer to one of Gremly's questions about a Chapter (data
 * fabric close out, 8 Oct): whether to start one, whether one is over, and,
 * after time away, what became of one (context/chapterQuestions.js asks them).
 *
 * Until now nothing acted on these answers, which is why the Chapter questions
 * were left off and a Chapter whose day had passed stayed open for good. A
 * model reads what they said, and code applies only that: a Chapter started
 * on their yes, with what the suggestion rested on filed in it; one closed on
 * their word that it is over or not happening; its days moved to the days
 * they give; and one they say is still going kept open, its passed end date
 * taken away. Gremly never starts or closes a Chapter without their answer.
 *
 * A Chapter closed on their word gets its memory written, as one closed in
 * the app does (Worlds rebuild, stage 3, decision 5); a memory that cannot be
 * written never stops the answer.
 */

import { db, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { personBlock } from '../careRules';
import { personToday } from './filing';
import { ITEM_TABLE } from './filed';
import { writeMemory } from './memory';

export const CHAPTER_ANSWER_VERSION = 'chapter-answer-2026-10-18b';

/** The kinds of question answered here. */
export const CHAPTER_QUESTION_KINDS = Object.freeze(['start_chapter', 'close_chapter', 'while_away']);

const OUTCOMES = ['start', 'later', 'no', 'over', 'going', 'moved', 'not_happening', 'unsure'];

const ANSWER_RULES = `THEIR ANSWER ABOUT A CHAPTER
- Gremly asked the person a question about a Chapter of their life: whether to start one, whether one is over, or, after time away, what became of one. They answered by tapping an answer or in their own words.
- answers is true when their words tell Gremly what was asked, in whole or in part, or that the question is wrong or not one they want to be asked. It is false when they only ask something back, say they do not follow the question, or speak of something else.
- outcome, for a question whether to start a Chapter: start when they say yes, later when they say to leave it for now, no when they say no. For a question about a Chapter they have: over when they say it is over or done, moved when their words give it other days, even when they also say it is still going, going when they say it is still going or still ahead and give no other days, not_happening when they say it will not happen, and unsure when their words do not say. Null when they do not answer.
- start_date and end_date are only the days their own answer gives for it, as YYYY-MM-DD, read against today's date. The days in Gremly's question or in what it was about are never theirs. Null when their answer gives none.
- Never infer anything their words do not say.`;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answers: { type: 'boolean' },
    outcome: { type: 'string', enum: OUTCOMES, nullable: true },
    start_date: { type: 'string', nullable: true },
    end_date: { type: 'string', nullable: true },
  },
  required: ['answers', 'outcome', 'start_date', 'end_date'],
};

const day = (v) => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** The answer reader's request. Pure. */
export function chapterAnswerRequest({ question, said, chapter, person, today }) {
  const change = question.proposed_change || {};
  const about =
    question.kind === 'start_chapter'
      ? `whether to start a Chapter called "${trim(change.title, 80)}"${change.start_date || change.end_date ? `, from ${change.start_date || '?'} to ${change.end_date || '?'}` : ''}`
      : `the Chapter "${trim(chapter?.title, 80)}", ${chapter?.start_date || 'no start set'} to ${chapter?.end_date || 'no end set'}`;
  return {
    system: {
      fixed: `You read a person's answer to Gremly's question about a Chapter of their life.\n\n${ANSWER_RULES}`,
      varying: personBlock(person),
    },
    user: `TODAY: ${today}.
GREMLY ASKED: "${trim(question.question, 300)}"
IT WAS ABOUT: ${about}
THEIR ANSWER: "${trim(said, 600)}"`,
  };
}

/** Read the answer with the model. Writes nothing; the replay calls it too. */
export async function readChapterAnswer(env, args) {
  return jsonCall(env, {
    primary: modelFor(env, 'personQuestion'),
    fallback: modelFor(env, 'personQuestionFallback'),
    ...chapterAnswerRequest(args),
    schema: ANSWER_SCHEMA,
    maxTokens: 2000,
    effort: 'low',
    thinking: 'low',
  });
}

/**
 * What the read answer does, as writes. Pure.
 * @returns {{ answers, start: object|null, close: boolean, dates: object|null, clearEnd: boolean }}
 */
export function chapterAnswerPlan({ question, output, chapter, today }) {
  const plan = { answers: output?.answers !== false, start: null, close: false, dates: null, clearEnd: false };
  if (!plan.answers) return plan;
  const outcome = OUTCOMES.includes(output?.outcome) ? output.outcome : null;
  const start = day(output?.start_date);
  const end = day(output?.end_date);
  const change = question.proposed_change || {};
  if (question.kind === 'start_chapter') {
    if (outcome !== 'start') return plan;
    const from = start || day(change.start_date);
    const to = end || day(change.end_date);
    if (from && to && to < from) return plan;
    plan.start = {
      title: trim(change.title, 60),
      world_id: change.world_id || null,
      start_date: from,
      end_date: to,
      start_said: !!start,
      end_said: !!end,
    };
    return plan;
  }
  // a Chapter they have: only one still open is changed
  if (!chapter || chapter.closed_at || chapter.phase === 'closed') return plan;
  if (outcome === 'over' || outcome === 'not_happening') plan.close = true;
  else if (outcome === 'moved' && (start || end) && !(start && end && end < start))
    plan.dates = { ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) };
  else if (outcome === 'going' && day(chapter.end_date) && day(chapter.end_date) < today && chapter.end_date_source !== 'user')
    plan.clearEnd = true;
  return plan;
}

const TYPE_OF_TABLE = Object.fromEntries(Object.entries(ITEM_TABLE).map(([type, table]) => [table, type]));

/**
 * Read and apply an answer to a question about a Chapter. Returns whether it
 * answered the question and what changed. The caller closes the question.
 */
export async function answerChapterQuestion(env, { userId, question, said }) {
  const d = db(env);
  const change = question.proposed_change || {};
  const chapterId = question.kind === 'start_chapter' ? null : change.chapter_id || question.record_id;
  const [person, today, rows] = await Promise.all([
    personIdentity(env, userId),
    personToday(env, userId),
    chapterId
      ? d.select(
          `chapters?id=eq.${chapterId}&owner_id=eq.${userId}&select=id,title,phase,start_date,end_date,end_date_source,closed_at`,
        )
      : [],
  ]);
  const chapter = rows?.[0] || null;
  const { output, model } = await readChapterAnswer(env, { question, said, chapter, person, today });
  const plan = chapterAnswerPlan({ question, output, chapter, today });
  const result = { answers: plan.answers, outcome: output?.outcome || null, model, version: CHAPTER_ANSWER_VERSION };
  const nowIso = new Date().toISOString();
  if (plan.start) {
    const id = crypto.randomUUID();
    const from = plan.start.start_date || today;
    await d.insertQuiet('chapters', [
      {
        id,
        owner_id: userId,
        title: plan.start.title,
        title_source: 'synthesis',
        phase: from > today ? 'upcoming' : 'active',
        source: 'question',
        primary_world_id: plan.start.world_id,
        start_date: from,
        start_date_source: plan.start.start_said ? 'user' : 'synthesis',
        end_date: plan.start.end_date,
        end_date_source: plan.start.end_date ? (plan.start.end_said ? 'user' : 'synthesis') : null,
        proposed_at: question.created_at || nowIso,
        confirmed_at: nowIso,
      },
    ]);
    if (plan.start.world_id)
      await d.insertIgnore(
        'chapter_world_links',
        [{ chapter_id: id, world_id: plan.start.world_id, owner_id: userId, relevance_score: 1 }],
        'chapter_id,world_id',
      );
    // what the suggestion rested on goes into the Chapter they said yes to:
    // its items, and the items the facts it rests on were read from
    const rests = Array.isArray(question.rests_on) ? question.rests_on : [];
    const factIds = rests.filter((r) => r?.table === 'life_facts' && r.id).map((r) => r.id);
    const sources = factIds.length
      ? (await d
          .select(
            `life_facts?user_id=eq.${userId}&id=in.(${factIds.join(',')})&source_table=in.(${Object.keys(TYPE_OF_TABLE).join(',')})&select=source_table,source_id`,
          )
          .catch(() => [])) || []
      : [];
    const items = [...rests, ...sources.map((f) => ({ table: f.source_table, id: f.source_id }))]
      .filter((r) => TYPE_OF_TABLE[r?.table] && r.id)
      .filter((r, i, all) => all.findIndex((x) => x.table === r.table && x.id === r.id) === i);
    const links = items
      .map((r) => ({
        drop_id: r.id,
        drop_type: TYPE_OF_TABLE[r.table],
        chapter_id: id,
        owner_id: userId,
        relevance_score: 1,
        assigned_by: 'classifier',
        reason: 'in the suggestion they said yes to',
      }));
    if (links.length) await d.insertIgnore('drop_chapter_links', links, 'drop_id,drop_type,chapter_id');
    result.started = { chapter_id: id, filed: links.length };
  }
  if (plan.close) {
    const done = await d.update(`chapters?id=eq.${chapter.id}&owner_id=eq.${userId}&closed_at=is.null`, {
      phase: 'closed',
      closed_at: nowIso,
      updated_at: nowIso,
    });
    if (Array.isArray(done) && done.length) {
      result.closed = chapter.id;
      // its memory, as when it is closed in the app
      try {
        const m = await writeMemory(env, userId, chapter.id);
        result.memory = m?.outcome || null;
      } catch (err) {
        console.warn('[ChapterAnswer] the memory could not be written', String(err?.message || err).slice(0, 200));
        result.memory = 'failed';
      }
    }
  }
  if (plan.dates) {
    const patch = { updated_at: nowIso };
    if (plan.dates.start_date)
      Object.assign(patch, { start_date: plan.dates.start_date, start_date_source: 'user', start_date_updated_at: nowIso });
    if (plan.dates.end_date)
      Object.assign(patch, { end_date: plan.dates.end_date, end_date_source: 'user', end_date_updated_at: nowIso });
    await d.update(`chapters?id=eq.${chapter.id}&owner_id=eq.${userId}&closed_at=is.null`, patch);
    result.moved = { chapter_id: chapter.id, ...plan.dates };
  }
  if (plan.clearEnd) {
    // still going: the day that passed was not its end, by their word
    await d.update(`chapters?id=eq.${chapter.id}&owner_id=eq.${userId}&closed_at=is.null`, {
      end_date: null,
      end_date_source: 'user',
      end_date_updated_at: nowIso,
      updated_at: nowIso,
    });
    result.still_going = chapter.id;
  }
  return result;
}
