/**
 * Weekly synthesis: one Sonnet 5.5 pass, through the Batch API at half price.
 * Since data fabric stage 5 it is the one job that reads the week: everything
 * weekly is written from its result.
 *
 * It reads the fact ledger (dated, sourced, with corrections), the week's own
 * words (journals and chat), what was done, the week's counts worked out by
 * code (weekCounts.js), the people in their life, what the last weekly
 * summaries showed, the current Life Map and the current Worlds, and writes:
 *  - the Life Map, in full, so nothing stale survives because it was skipped
 *  - the profile text every chat reads
 *  - Gremly's notes on each World and Chapter
 *  - the week's Worlds headline
 *  - any questions worth asking the person
 *  - the plan for the weekly summary: the week's character, its line, and the
 *    cards it wants, each with the facts, moments, people and counts behind it
 *  - notes on the people the facts speak of, for the words about a person
 *  - a note on the week, which the story reads
 *
 * Code maps references back to real ids, keeps each Life Map domain's link to
 * its Space, and builds thread evidence from the facts the model cited.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { STATED_RULES, SENTENCE_SCHEMA } from '../../shared/check/stated.js';
import { runCheck, checkRunRow } from '../../shared/check/run.js';
import {
  db,
  userTimezone,
  localDate,
  addDays,
  relativeDay,
  weekdayName,
  personIdentity,
  identityLine,
} from './db';
import {
  anthropicSchemaInPromptParams,
  anthropicJsonResult,
  modelFor,
  createBatch,
  getBatch,
  getBatchResults,
  jsonCall,
} from './llm';
import { recentCorrections } from './corrections';
import { loadStory, storyLines } from './story';
import { invalidateChatCache } from './cache';
import { batchUsageRow, writeUsageRow } from '../../shared/aiUsage';
import { dayOn, stateWords, whenTrue } from '../../shared/factTiming.js';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';
import { oldWorldsFieldsStopped, withoutOldFields } from '../../shared/worldsFields.js';
import { gatherWeekCounts, weekCountItems } from './weekCounts';
import {
  NOT_SURE_PROPERTIES,
  NOT_SURE_RULES,
  peopleEvidence,
  evidenceWords,
  unsureLines,
  unsurePlan,
  loadUnsureState,
  applyUnsure,
} from './unsure';

export const WEEKLY_PROMPT_VERSION = 'weekly-2026-10-18e';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const WEEKLY_SCHEMA = {
  type: 'object',
  properties: {
    life_map: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              attention: { type: 'string', enum: ['front_of_mind', 'active', 'background'] },
              threads: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string' },
                    momentum: { type: 'string' },
                    lifecycle: { type: 'string', enum: ['active', 'dormant', 'concluded'] },
                    importance: { type: 'string', enum: ['high', 'medium', 'low'] },
                    attention: { type: 'string', enum: ['front_of_mind', 'active', 'background'] },
                    last_activity: { type: 'string' },
                    summary: { type: 'string' },
                    recent_update: { type: 'string' },
                    fact_refs: { type: 'array', items: { type: 'string' } },
                  },
                  required: [
                    'name',
                    'status',
                    'momentum',
                    'lifecycle',
                    'importance',
                    'attention',
                    'summary',
                    'fact_refs',
                  ],
                },
              },
            },
            required: ['name', 'attention', 'threads'],
          },
        },
      },
      required: ['domains'],
    },
    profile_text: { type: 'string' },
    // the records each paragraph of the profile rests on, in order (stage 7)
    profile_refs: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    worlds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          world_ref: { type: 'string' },
          phase: { type: 'string', enum: ['candidate', 'active', 'dormant'] },
          summary: { type: 'string' },
          key_priorities: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, date: { type: 'string' } },
              required: ['text', 'date'],
            },
          },
          card_fact_refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['world_ref', 'phase', 'summary', 'key_priorities', 'card_fact_refs'],
      },
    },
    worlds_summary: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        refs: { type: 'array', items: { type: 'string' } },
        featured: {
          type: 'array',
          items: {
            type: 'object',
            properties: { world_ref: { type: 'string' }, reason: { type: 'string' } },
            required: ['world_ref', 'reason'],
          },
        },
      },
      required: ['headline', 'refs', 'featured'],
    },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapter_ref: { type: 'string' },
          // the fact about what it was begun for, whose day is when it ends;
          // decided before its notes, which are written to match
          begun_for_ref: { type: 'string' },
          summary: { type: 'string' },
          stage: { type: 'string' },
          key_priorities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['action', 'commitment', 'decision', 'momentum'] },
                text: { type: 'string' },
                date: { type: 'string' },
              },
              required: ['kind', 'text', 'date'],
            },
          },
          card_fact_refs: { type: 'array', items: { type: 'string' } },
          // the people who are part of the chapter (chapter_people)
          people_refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['chapter_ref', 'begun_for_ref', 'summary', 'stage', 'key_priorities', 'card_fact_refs', 'people_refs'],
      },
    },
    // what Gremly is not sure of yet, and who matters most (context/unsure.js),
    // decided before its questions, which leave those to it
    ...NOT_SURE_PROPERTIES,
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, fact_ref: { type: 'string' } },
        required: ['question', 'fact_ref'],
      },
    },
    week_note: { type: 'string' },
    week_note_refs: { type: 'array', items: { type: 'string' } },
    // the plan the weekly summary is written from (data fabric stage 5)
    summary_plan: {
      type: 'object',
      properties: {
        character: { type: 'string' },
        through_line: { type: 'string' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              about: { type: 'string' },
              refs: { type: 'array', items: { type: 'string' } },
            },
            required: ['about', 'refs'],
          },
        },
      },
      required: ['character', 'through_line', 'cards'],
    },
    // notes on the people the facts speak of, for the words about a person (stage 6)
    people_notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          person_ref: { type: 'string' },
          note: { type: 'string' },
          refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['person_ref', 'note', 'refs'],
      },
    },
  },
  required: [
    'life_map',
    'profile_text',
    'profile_refs',
    'worlds',
    'worlds_summary',
    'chapters',
    'not_sure',
    'who_matters',
    'questions',
    'week_note',
    'week_note_refs',
    'summary_plan',
    'people_notes',
  ],
};

// Asked for, but a reply without them is still applied: the rest of the pass
// never waits on what Gremly is not sure of
const SHAPE_OPTIONAL = new Set(['not_sure', 'who_matters']);

// What every note the pass writes holds to, in the pass and when one note goes
// back alone (data fabric stage 7, after the comparison of 8 Oct)
const TRUTH_RULES = `WHAT IS TRUE
- Everything here says only what the records hold, as of today, and cites in its refs the records it rests on, by the refs given: facts, journal entries, what is on their list, the week's counts and people.
- A plan is told as done only when a record says it happened. Until then it is told as what was planned, with no word on how it went. A plan that changed is told as it now stands.
- An event or a plan whose day has passed is told as past, whatever an older note says. A fact the records hold as current is told in the present, however long ago it was recorded. Something whose day has passed is never a priority: a priority is something still ahead or under way.
- Each person is called by the name the records use for them. Who someone is to the person is said only when the people list or a fact records it, never worked out from how often they come up, what they do together or anything else, and never implied in other words, by the kind of tie or the group they would belong to. When it is not recorded, their name alone says enough. Nor is anyone else given a pronoun or a gender their records do not give.
- A date is given only where the day matters, and as a date (a weekday or month is fine), never as today, tomorrow, yesterday, this week or next week, because everything here is read for the whole week ahead.`;

const VOICE_RULES = `WHO READS WHAT
- Gremly's notes on their Worlds and Chapters, the Worlds headline and the note on their week are shown to the person, so every one of them speaks to them as a friend who knows their life would: to them, warm and plain, never as a file note about them.
- What is not known is simply left out. Nothing written speaks of records, of what was or was not recorded, of what Gremly does not know, or of who set a title or any other part of what it writes about.
- The Life Map, the profile, the notes on people and the plan for their summary are Gremly's own, written about them.`;

// The fixed part comes first so Anthropic can cache it across people; today's
// date and who the person is follow it.
function weeklySystemPrompt(today, person) {
  return {
    fixed: weeklySystemPromptFixed(),
    varying: `TODAY'S DATE: ${today}\n\n${personBlock(person)}`,
  };
}

/**
 * What the weekly pass's writer is told when one of its notes goes back to it
 * alone, as a correction sends it (correctionPassages.js): a Chapter's notes
 * or a Life Map thread's summary or recent update, with only the records it
 * rests on as they now stand.
 */
export function weeklyNoteRewritePrompt(person) {
  return {
    fixed: `You keep Gremly's notes on one person's life: its Life Map, its notes on their Worlds and the Chapters of their life, the Worlds headline, the note on their week, their profile, its notes on the people in their life, the questions it asks them and the plan for their weekly summary. Gremly reads them in every conversation with them, and the person may see them.

${CARE_RULES}

${WRITING_RULES}

${PRIVATE_RULES}
- Here that means a private matter may appear in these notes only in the person's own words, and never in the Worlds headline, the note on their week or the character of their summary.

${TRUTH_RULES}

${VOICE_RULES}

- Nothing in them tells the person what to do, tallies what was not done or judges how they are doing.

${STATED_RULES}

ONE NOTE AGAIN
You are given one note you wrote, where it is kept, what was wrong with it, and only the records it rests on, as they now stand: the person may just have put one of them right. Write that note again so that it says only what those records hold: change only what was wrong, as little as you can, and keep every other word as it was. Give its refs and what it states. Cite only the records given here. When nothing true is left to say, return empty text.`,
    varying: personBlock(person),
  };
}

function weeklySystemPromptFixed() {
  return `You keep Gremly's long-term understanding of one person up to date. Once a week you rewrite their Life Map, the short profile every conversation with them reads and Gremly's notes on their Worlds and the Chapters of their life, and plan their weekly summary, from what is known about their life.

${CARE_RULES}

${WRITING_RULES}

${PRIVATE_RULES}
- Here that means a private fact or story item never appears in the Worlds headline. In Gremly's notes on a world or a chapter, their priorities and stage, the Life Map and the profile it may appear in the person's own words.

${TRUTH_RULES}

${VOICE_RULES}

EMPTY FIELDS
- A field with nothing true to say is an empty string: a date that is not known, a stage, a recent update, a question's fact.

WHAT YOU ARE GIVEN
- The fact ledger: what is known about their life, each fact with its date, state and when it was last confirmed, marked when it is private or about their health. Corrections the person made are listed separately and always win.
- The week's own words: journal entries and what they said in chat. These carry the texture the ledger summarises. A journal entry, or something on their list, is marked private or about their health when a fact marked so was read from it.
- What they did this week, the week counted by code, and counts of how they used the app over recent weeks.
- The people in their life as their records hold them, each with how often and how lately they come up in the facts and which of the facts given are about them; what Gremly was not sure of before; and what the last weekly summaries showed.
- The current Life Map, Worlds and open questions.

THE LIFE MAP
- Rewrite it in full. Keep the domains and threads that still describe their life, merge or retire ones that do not, and add new ones the evidence supports. Use the existing domain names where they still fit.
- Each thread's summary says what is true as of today. When a thread has had no activity for a while, say plainly when it was last active and what was happening then, set its lifecycle to dormant or concluded, and do not invent what happened since.
- last_activity is the date of the latest evidence for that thread, never a future date. Cite in fact_refs everything each thread rests on: facts, journal entries, what is on their list and the week's counts.
- recent_update says what this week's records show of the thread: what happened, what they wrote, what they added to their list or did, and how their habits went, in plain words and never in the form the counts are given in, each cited in fact_refs. It is empty only when nothing in this week's records touches the thread.

THE PROFILE
- A few short, warm paragraphs that a companion could read before talking to them, reading as a portrait rather than a list: who they are, who matters to them, what they love and do often, the milestones that shaped the last year, what is going on now, and what is coming up. Draw on their story where it is given. No clinical or diagnostic language, no judgements about how they are coping.
- Story items marked private may shape your understanding; mention them in the profile only in the person's own terms, and never on a card, a chapter or the Worlds headline.
- Start with the paragraph itself. Their name, pronouns, age and location are added above it separately, so do not restate their pronouns.
- In profile_refs give, for each paragraph in order, the records it rests on.

WORLDS
- For each world: Gremly's notes on it, a summary of one or two sentences on where it stands now, written to them; and up to five key priorities, each with its date when it has one. The line on its card is written by another writer, from these notes.
- The notes say what is true now, and nothing counts what was not done. When a world has been quiet, the notes give its last real state with its month, or what is next if something is genuinely ahead.
- Return only the worlds you have something true to say about; a world you leave out keeps its notes.
- phase: active when the person is engaged with it now, dormant when it has gone quiet for weeks, candidate only when it is still forming.
- Cite the facts each world's notes rest on in card_fact_refs. The most recent of them that happened is taken as when the world was last active, so the app does not show a living world as gone quiet.
- worlds_summary: one line noticing what is most alive across their worlds this week, citing in its refs the records it rests on. Feature up to three worlds with a short reason. In a quiet week say so kindly and feature none.

CHAPTERS
- Chapters are stretches of their life with a shape: a trip, a commitment, a season of training, a push on a project. They are kept so the person can look back on them.
- For each chapter you are given: Gremly's notes on it, a summary of what the chapter was or is, with its dates, written to them like every chapter's notes; a short stage label; and, only for a chapter still active, up to three priorities with their dates when they have them. Its card line, its memory and its title are written elsewhere.
- A closed chapter is written as a memory: what happened, what it meant to them in their words, what they did. Never tally what was not done, never list unfinished tasks, never call it stalled, failed or abandoned, and give it no priorities.
- An active chapter that has gone quiet says when it was last active and what was happening then; its stage is a neutral label. Nothing on a chapter tells the person what they should do.
- Setbacks, slips and health details appear only in the person's own words, and only when they recorded them as part of the chapter themselves.
- Cite the facts each chapter's notes rest on in card_fact_refs, and write the whole chapter from what the facts show: when the records do not show how a chapter ended, say what it was and when, and leave the outcome out. A chapter with no facts behind it keeps what it has.
- In people_refs, give the refs from the people list of the people who are part of the chapter as the facts it cites show them: those who share it with them or take part in it. It is empty when those facts show no one.
- First, in begun_for_ref, give the ref of the fact about what the chapter was begun for, as its title and the facts show: the event or day it leads up to, or the day they said it ends. What was filed in it since, and Gremly's earlier notes on it, never change what it was begun for. It is empty when no fact given holds that day. Its day is when the chapter ends, and when that day has passed, everything on the chapter is written as what it was, never as still going.
- Return every chapter you are given; one you cannot say anything true about keeps a plain summary of its dates and what it was.

${NOT_SURE_RULES}

QUESTIONS
- Ask about something a record states but leaves genuinely unclear that bears on their life now or on something still ahead: how a plan turned out, a date or detail still unknown, or two records that disagree. Ask first about what is most pressing: an unknown that something coming up soon depends on, and what they have most recently brought up. Differences about things long past are left as they are. Short and friendly, asked as Gremly asks, never naming itself. Do not repeat open questions. A question takes nothing for granted that the records do not hold.
- Anything Gremly would only be inferring, which no record states as such, and who someone is to them, are never asked here: give them in not_sure, and Gremly asks them from there.

WEEK NOTE
- One short paragraph on what this week was, in plain words, spoken to them, since their weekly review may show it to them; their story reads it too. It says only what the records show, never speaks of anything private or about their health, and cites in week_note_refs the records it rests on.

THE SUMMARY PLAN
- Once you are done, their weekly summary is written from your plan: a short deck of cards they open on purpose to look back on their week. You decide what it shows; its writer only words it.
- character is the week's character in a few words, shown to them as it is on the summary's opening card, so it uses neither their name nor a pronoun for them. through_line is one sentence of what ran through the week, for Gremly's own reference. Both are true to the week as the records show it.
- cards are the cards it wants between its opening and its closing note, in the order they are read. A full week has up to five. A week with few records has one or two, each on something real; a card is never padding.
- For each card, about says in plain words what it shows, for its writer and never shown as it is, naming days by their dates. In refs, cite everything it rests on: the ledger facts, the journal entries it quotes or draws on, what they added to their list or did, the people it is about and the counts it uses, each by its ref.
- A card is about this week: what happened, what they wrote, who was part of it, what they planned and what they did. Something from before the week belongs on a card only when this week's records bring it back, and something ahead only as what the week led towards.
- A person is on a card only from the people list, and only as the facts it cites show them.
- The counts are worked out by code and are exact. A card uses one only when the number itself tells something about the week, never as a judgement of how they did.
- Move on from what the last summaries showed: a subject comes back only when this week moved it on.
- The summary is written without anything private or about their health: its writer is never shown a fact, a journal entry or anything on their list marked so. The character and the line are the first things seen when it opens, and others may see them too. So neither they nor any card speaks of any of it, in any words, even when the week turned on it, and no card rests on anything marked so. What is about their health is kept off the summary whether or not the records mark it; the rest of the week carries the cards.
- Every card rests on at least one ref given here.

NOTES ON PEOPLE
- For each person on the people list whom the facts or the week's journal entries speak of, a short note for Gremly's own reference: who they are to the person and what the records show of them lately, in plain words, citing in refs the facts and journal entries it rests on.
- A note says nothing about a person that its records do not hold, and leaves out who they are to the person when no record says it. It never rests on a private fact or on anything about health.
- Anyone the records do not speak of gets no note.`;
}

/**
 * Which of these entries, list items and habits a fact marked private or about
 * health was read from or is about, in any state: by the fact's first source
 * and by every source the ledger keeps for it (life_fact_sources).
 */
export async function sourceMarks(d, userId, ids) {
  const out = new Map();
  const mark = (id, f) => {
    if (!id || !(f.private || f.health)) return;
    const was = out.get(id) || { private: false, health: false };
    out.set(id, { private: was.private || !!f.private, health: was.health || !!f.health });
  };
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks = (list) => Array.from({ length: Math.ceil(list.length / 60) }, (_, i) => list.slice(i * 60, i * 60 + 60));
  const flagged = 'or=(private.is.true,health.is.true)';
  for (const part of chunks(unique)) {
    const [firsts, linked] = await Promise.all([
      d.select(`life_facts?user_id=eq.${userId}&source_id=in.(${part.join(',')})&${flagged}&select=source_id,private,health&limit=2000`),
      d.select(`life_fact_sources?user_id=eq.${userId}&source_id=in.(${part.join(',')})&select=fact_id,source_id&limit=2000`),
    ]);
    for (const f of firsts || []) mark(f.source_id, f);
    const bySource = new Map();
    for (const l of linked || []) bySource.set(l.fact_id, [...(bySource.get(l.fact_id) || []), l.source_id]);
    for (const factPart of chunks([...bySource.keys()])) {
      const facts = await d.select(`life_facts?user_id=eq.${userId}&id=in.(${factPart.join(',')})&${flagged}&select=id,private,health&limit=2000`);
      for (const f of facts || []) for (const id of bySource.get(f.id) || []) mark(id, f);
    }
  }
  return out;
}

/** Gather everything the weekly pass reads. */
export async function gatherWeek(env, userId, tz, periodEnd) {
  const d = db(env);
  const periodStart = addDays(periodEnd, -6);
  const since = `${periodStart}T00:00:00Z`;
  const startIso = new Date(Date.parse(since) - 14 * 3600e3).toISOString();
  const endIso = new Date(
    Date.parse(`${addDays(periodEnd, 1)}T00:00:00Z`) + 14 * 3600e3,
  ).toISOString();
  const between = (col) =>
    `${col}=gte.${encodeURIComponent(startIso)}&${col}=lt.${encodeURIComponent(endIso)}`;
  const [
    openFacts,
    recentHappened,
    changes,
    corrections,
    journals,
    chats,
    created,
    completed,
    habits,
    progress,
    lifeMap,
    worlds,
    links,
    questions,
    absence,
    usage,
    chapterRows,
    story,
    people,
    summaries,
  ] = await Promise.all([
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&select=id,statement,subject,timing,about_date,about_date_end,state,observed_at,last_confirmed_at,private,health,source_table,source_id&order=last_confirmed_at.desc&limit=400`,
    ),
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(happened,changed)&updated_at=gte.${encodeURIComponent(new Date(Date.now() - 60 * 864e5).toISOString())}&select=id,statement,subject,about_date,state,state_reason,updated_at,private,health,source_table,source_id&order=updated_at.desc&limit=150`,
    ),
    d.select(
      `life_fact_changes?user_id=eq.${userId}&${between('created_at')}&select=fact_id,from_state,to_state,reason,created_at&order=created_at.asc&limit=100`,
    ),
    recentCorrections(env, userId, 365),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.journal&${between('created_at')}&select=id,title,body,mood,created_at&order=created_at.asc&limit=25`,
    ),
    d.select(
      `scope_chat_messages?user_id=eq.${userId}&role=eq.user&or=(metadata_json.is.null,metadata_json->>type.is.null,metadata_json->>type.neq.brief-reply)&${between('created_at')}&select=content,created_at&order=created_at.asc&limit=120`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&${between('created_at')}&select=id,title,due_day,created_at&order=created_at.asc&limit=80`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&${between('completed_at')}&select=id,title,completed_at&order=completed_at.asc&limit=80`,
    ),
    d.select(
      `habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,cadence,target_per_period`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${periodStart}&occurred_day=lte.${periodEnd}&select=habit_id,occurred_day&limit=2000`,
    ),
    d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map,version`),
    d.select(
      `worlds?owner_id=eq.${userId}&phase=in.(candidate,active,evolving,dormant)&select=id,name,display_name,phase,card_subtitle,card_subtitle_source,summary,summary_source,key_priorities,last_signal_at`,
    ),
    d.select(`drop_world_links?owner_id=eq.${userId}&select=world_id,drop_id,drop_type&limit=5000`),
    d.select(
      `gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&select=id,question,created_at&limit=20`,
    ),
    d.rpc('absence_snapshot', { p_user: userId }),
    d.rpc('usage_rollup', { p_user: userId, p_grain: 'week', p_periods: 8 }),
    d.select(
      `chapters?owner_id=eq.${userId}&phase=in.(suggested,upcoming,active,closed)&select=id,title,title_source,chapter_type,phase,start_date,end_date,closed_at,card_subtitle,card_subtitle_source,summary,summary_source,epigraph,epigraph_source,key_priorities,current_phase_key,phase_labels&order=start_date.desc.nullslast&limit=60`,
    ),
    loadStory(env, userId),
    // the people in their life, from the people records (data fabric stage 4c)
    d.select(
      `life_people?user_id=eq.${userId}&merged_into=is.null&hidden_at=is.null&select=id,name,relationship&order=updated_at.desc&limit=${PEOPLE_READ}`,
    ),
    // what the last weekly summaries showed, so the plan can move on from it
    d.select(
      `weekly_summaries?user_id=eq.${userId}&week_start_date=lt.${periodStart}&week_start_date=gte.${addDays(periodStart, -42)}&select=week_start_date,content&order=week_start_date.desc&limit=6`,
    ),
  ]);
  // how often and how lately each person comes up, from the facts tied to
  // them, and what Gremly was not sure of before (context/unsure.js). The
  // people who come up most are the ones shown.
  const { ties, tiedFacts } = await peopleTies(d, userId, people || []);
  const evidence = peopleEvidence({ ties, facts: new Map(tiedFacts.map((f) => [f.id, f])), today: periodEnd });
  const shownPeople = (people || [])
    .map((p, i) => ({ p, i, e: evidence.get(p.id) }))
    .sort(
      (a, b) =>
        (b.e?.facts || 0) - (a.e?.facts || 0) ||
        String(b.e?.latest || '').localeCompare(String(a.e?.latest || '')) ||
        a.i - b.i,
    )
    .slice(0, PEOPLE_SHOWN)
    .map((x) => x.p);
  let unsure = [];
  try {
    unsure =
      (await d.select(
        `life_unsure?user_id=eq.${userId}&status=eq.open&select=id,person_id,kind,thinks,sure,created_at&order=created_at.asc&limit=40`,
      )) || [];
  } catch (err) {
    console.warn(
      `[ALERT][Weekly] what Gremly is not sure of could not be read for ${userId}, so the pass sees none of it: ${String(err?.message || err).slice(0, 200)}`,
    );
  }
  // the week counted by code (stage 5); a count that cannot be made is said,
  // and the pass goes on without it
  let counts = null;
  try {
    counts = await gatherWeekCounts(env, userId, { periodStart, periodEnd, habits, progress, tz });
  } catch (err) {
    console.warn(
      `[ALERT][Weekly] the week could not be counted for ${userId}: ${String(err?.message || err).slice(0, 200)}`,
    );
  }
  // what is private or about health in the week's entries, list and habits:
  // each is marked as any fact read from it, or about it, is marked
  const marks = await sourceMarks(d, userId, [
    ...(journals || []).map((j) => j.id),
    ...(created || []).map((t) => t.id),
    ...(completed || []).map((t) => t.id),
    ...(habits || []).map((h) => h.id),
  ]);
  if (counts)
    counts = {
      ...counts,
      habits: counts.habits.map((h) => (marks.has(h.id) ? { ...h, ...marks.get(h.id) } : h)),
    };
  // Chapters the weekly writes: every open one, any closed in the last 120 days,
  // and any whose notes (summary, the one of the three this pass writes) have
  // not yet been written under these rules.
  const recentCut = new Date(Date.now() - 120 * 864e5).toISOString();
  const chapters = (chapterRows || [])
    .filter((c) => {
      const allUser =
        c.card_subtitle_source === 'user' &&
        c.summary_source === 'user' &&
        c.epigraph_source === 'user';
      if (allUser) return false;
      if (c.phase !== 'closed') return true;
      if (c.closed_at && c.closed_at >= recentCut) return true;
      return c.summary_source !== 'synthesis' && c.summary_source !== 'user';
    })
    .slice(0, 40);
  return {
    tz,
    periodStart,
    periodEnd,
    marks,
    openFacts,
    recentHappened,
    changes,
    corrections,
    journals,
    chats,
    created,
    completed,
    habits,
    progress,
    lifeMap: lifeMap?.[0] || null,
    worlds,
    links,
    questions,
    absence,
    usage,
    chapters,
    story: story || [],
    people: shownPeople,
    // plain lists, so the gathered week can be kept as it is
    ties: ties.filter((t) => shownPeople.some((p) => p.id === t.person_id)),
    tiedFacts,
    unsure,
    shown: shownBefore(summaries || []),
    counts,
  };
}

/** People read for the pass, and the most of them it is shown. */
const PEOPLE_READ = 200;
const PEOPLE_SHOWN = 60;

/**
 * Which facts are about each person, and those facts as they stand: whether
 * private or about health, their state and when they were recorded.
 */
async function peopleTies(d, userId, people) {
  if (!people.length) return { ties: [], tiedFacts: [] };
  const ids = new Set(people.map((p) => p.id));
  const ties = (
    (await d.select(`life_fact_people?user_id=eq.${userId}&select=fact_id,person_id&limit=10000`)) || []
  ).filter((t) => ids.has(t.person_id));
  const factIds = [...new Set(ties.map((t) => t.fact_id))];
  const tiedFacts = [];
  for (let i = 0; i < factIds.length; i += 100)
    tiedFacts.push(
      ...((await d.select(
        `life_facts_now?user_id=eq.${userId}&id=in.(${factIds.slice(i, i + 100).join(',')})&select=id,private,health,state,observed_at`,
      )) || []),
    );
  return { ties, tiedFacts };
}

/**
 * What each of the last weekly summaries showed: the line it ran on and what
 * each card was about, as the summary saved it (content.shown, from stage 5),
 * or, for one saved before, the subjects its cards were anchored on.
 */
export function shownBefore(rows) {
  return rows
    .map((r) => {
      const c = r?.content || {};
      const shown = Array.isArray(c.shown)
        ? c.shown.map((x) => x?.about).filter(Boolean)
        : (Array.isArray(c.cards) ? c.cards : []).map((k) => k?.anchor?.subject).filter(Boolean);
      return { week_start: r.week_start_date, line: c.through_line || null, shown };
    })
    .filter((x) => x.line || x.shown.length);
}

export function renderWeek(g, today) {
  const refs = new Map();
  const add = (prefix, obj) => {
    const n = [...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1;
    const ref = `${prefix}${n}`;
    refs.set(ref, obj);
    return ref;
  };
  // the line the writer is shown for a ref, which the check reads it by, with
  // what kind of record it is, which the writer has from the heading it sits
  // under (stage 7)
  const shown = (ref, line, kind) => {
    refs.get(ref).label = kind ? `${line} (${kind})` : line;
    return line;
  };
  const factLine = (f) => {
    const ref = add('f', { type: 'fact', ...f });
    // a standing fact holds with no date, a yearly one on its next day (stage 4d)
    const on = dayOn(f, today);
    const when =
      f.timing === 'standing' || f.timing === 'yearly' || !f.about_date
        ? `${whenTrue(f, today)}${f.timing === 'yearly' && on ? ` (${relativeDay(on, today)})` : ''}`
        : `${whenTrue(f)} (${relativeDay(f.about_date, today)})`;
    return shown(ref, `${ref} | ${stateWords(f, today)}${f.private ? ' [private]' : ''}${f.health ? ' [health]' : ''} | ${when} | ${trim(f.statement, 220)} | recorded ${String(f.observed_at || f.updated_at).slice(0, 10)}`, 'a fact Gremly holds about their life');
  };
  const weekItemIds = new Set([...g.created.map((t) => t.id), ...g.completed.map((t) => t.id)]);
  const worldActivity = new Map();
  for (const l of g.links)
    if (weekItemIds.has(l.drop_id))
      worldActivity.set(l.world_id, (worldActivity.get(l.world_id) || 0) + 1);
  const counts = new Map();
  for (const p of g.progress) counts.set(p.habit_id, (counts.get(p.habit_id) || 0) + 1);

  const usageLines = (g.usage?.periods || []).map(
    (p) =>
      `week of ${p.period_start}: ${p.active_days} active days, ${p.drops} drops, ${p.todos_done} done, ${p.habit_checkins} check-ins, ${p.journals} journals, ${p.chat_messages} chat messages, ${p.sweeps} sweeps, ${p.fed_days} fed days`,
  );

  const threads = [];
  for (const dom of g.lifeMap?.life_map?.domains || []) {
    for (const t of dom.threads || []) {
      threads.push(
        `${trim(dom.name, 50)} / ${trim(t.name, 70)} | ${t.status}, ${t.momentum}, ${t.lifecycle || 'active'} | last activity ${t.last_activity || 'unknown'} | ${trim(t.summary, 300)}`,
      );
    }
  }
  const worldLines = g.worlds.map((w) => {
    const ref = add('w', { type: 'world', ...w });
    const kp = (Array.isArray(w.key_priorities) ? w.key_priorities : [])
      .map((k) => (typeof k === 'string' ? k : k?.text))
      .filter(Boolean);
    return shown(ref, `${ref} | ${w.display_name || w.name} | phase ${w.phase} | last real activity ${w.last_signal_at ? w.last_signal_at.slice(0, 10) : 'unknown'} | items this week ${worldActivity.get(w.id) || 0} | card: "${trim(w.card_subtitle, 100)}"${w.card_subtitle_source === 'user' ? ' (set by the person, keep unless untrue)' : ''} | summary: "${trim(w.summary, 200)}" | priorities: ${kp.map((k) => trim(k, 80)).join('; ') || 'none'}`, 'one of their Worlds');
  });
  const qLines = g.questions.map(
    (q) => `- ${trim(q.question, 200)} (asked ${q.created_at.slice(0, 10)})`,
  );
  const chapterLines = (g.chapters || []).map((c) => {
    const ref = add('c', { type: 'chapter', id: c.id, start_date: c.start_date || null });
    const kp = (Array.isArray(c.key_priorities) ? c.key_priorities : [])
      .map((k) => (typeof k === 'string' ? k : k?.text))
      .filter(Boolean);
    const userSet = [
      c.title_source === 'user' && 'title',
      c.card_subtitle_source === 'user' && 'card',
      c.summary_source === 'user' && 'summary',
      c.epigraph_source === 'user' && 'epigraph',
    ].filter(Boolean);
    return shown(ref, `${ref} | ${trim(c.title, 80)} | ${c.chapter_type} | ${c.phase} | ${c.start_date || '?'} to ${c.end_date || (c.phase === 'closed' ? '?' : 'no end set')} | stage: ${c.current_phase_key || 'none'} | card: "${trim(c.card_subtitle, 100)}" | summary: "${trim(c.summary, 300)}" | epigraph: "${trim(c.epigraph, 200)}" | priorities: ${kp.map((k) => trim(k, 70)).join('; ') || 'none'}${userSet.length ? ` | set by the person, keep unless untrue: ${userSet.join(', ')}` : ''}`, 'a Chapter of their life');
  });
  const storyText = storyLines(g.story || [], today);
  // the week's own entries, the counts and the people, each by a ref the
  // summary plan names them by (stage 5)
  // the day something was written is the person's own day, not the day in UTC
  const dayOf = (iso) => (g.tz && iso ? localDate(g.tz, new Date(iso)) : String(iso).slice(0, 10));
  // an entry a private fact, or one about health, was read from is marked as
  // the fact is, so the plan keeps it off the summary as it keeps the fact
  const readFrom = new Map();
  for (const f of [...(g.openFacts || []), ...(g.recentHappened || [])]) {
    if (!['notes', 'todos'].includes(f.source_table) || !f.source_id || !(f.private || f.health)) continue;
    const was = readFrom.get(f.source_id) || { private: false, health: false };
    readFrom.set(f.source_id, { private: was.private || !!f.private, health: was.health || !!f.health });
  }
  for (const [id, m] of g.marks || []) {
    const was = readFrom.get(id) || { private: false, health: false };
    readFrom.set(id, { private: was.private || m.private, health: was.health || m.health });
  }
  const marksOf = (id) => {
    const m = readFrom.get(id);
    return `${m?.private ? ' [private]' : ''}${m?.health ? ' [health]' : ''}`;
  };
  const journalLines = (g.journals || []).map((j) => {
    const m = readFrom.get(j.id);
    const ref = add('j', { type: 'journal', id: j.id, date: dayOf(j.created_at), private: !!m?.private, health: !!m?.health });
    return shown(ref, `${ref} | ${dayOf(j.created_at)}${marksOf(j.id)} | "${trim(j.title, 100)}" ${trim(j.body, 1500)}${j.mood?.length ? ` | mood: ${j.mood.join(', ')}` : ''}`, 'their own journal entry, in their words');
  });
  // what they added to their list or did this week, each by a ref a card can rest on
  const items = new Map();
  for (const t of g.created || [])
    items.set(t.id, { id: t.id, title: t.title, added: dayOf(t.created_at), done: null, due: t.due_day || null });
  for (const t of g.completed || [])
    items.set(t.id, { ...(items.get(t.id) || { id: t.id, title: t.title, added: null, due: null }), done: dayOf(t.completed_at) });
  const itemLines = [...items.values()].map((t) => {
    const m = readFrom.get(t.id);
    const ref = add('t', { type: 'item', ...t, private: !!m?.private, health: !!m?.health });
    return shown(ref, `${ref} | ${t.added ? `added ${t.added}` : 'added before this week'}${t.done ? `, done ${t.done}` : ''}${t.due ? `, due ${t.due}` : ''}${marksOf(t.id)} | ${trim(t.title, 100)}`, 'on their own list');
  });
  const countLines = weekCountItems(g.counts).map((c) => {
    const ref = add('n', { type: 'count', paths: c.paths, line: c.line, private: !!c.private, health: !!c.health });
    return shown(ref, `${ref} | ${c.line}${c.private ? ' [private]' : ''}${c.health ? ' [health]' : ''}`, `counted by code for this week, ${g.periodStart} to ${g.periodEnd}`);
  });
  // the ledger's lines first, so each person's line can name the facts about them
  const openFactLines = g.openFacts.map(factLine);
  const happenedFactLines = g.recentHappened.map(factLine);
  // how often and how lately each person comes up, with the refs of the
  // facts given here that are about them (context/unsure.js)
  const refOfFact = new Map(
    [...refs.entries()].filter(([, v]) => v.type === 'fact' && v.id).map(([k, v]) => [v.id, k]),
  );
  const evidence = peopleEvidence({
    ties: g.ties || [],
    facts: new Map((g.tiedFacts || []).map((f) => [f.id, f])),
    refOfFact,
    today,
  });
  const personRef = new Map();
  const peopleLines = (g.people || []).map((p) => {
    const ref = add('p', { type: 'person', id: p.id, name: p.name, relationship: p.relationship });
    personRef.set(p.id, ref);
    return shown(ref, `${ref} | ${trim(p.name, 60)} | ${p.relationship ? trim(p.relationship, 60) : 'who they are to them is not recorded'} | ${evidenceWords(evidence.get(p.id))}`, 'someone in their life');
  });
  // never a record: nothing may rest on them, so they have no line the check reads
  const unsureText = unsureLines(g.unsure || [], personRef, add);
  const shownLines = (g.shown || []).map(
    (w) =>
      `week of ${w.week_start}: ${w.line ? `"${trim(w.line, 160)}"` : 'no line'}${w.shown.length ? `; cards about ${w.shown.map((x) => trim(x, 80)).join('; ')}` : ''}`,
  );

  const text = [
    `TODAY: ${weekdayName(today)} ${today}. THIS WEEK: ${g.periodStart} to ${g.periodEnd}.`,
    '',
    `TIME AWAY: last active ${g.absence?.last_active_day || 'never'}; active days in the last 7: ${g.absence?.active_days_last_7 ?? 0}, last 30: ${g.absence?.active_days_last_30 ?? 0}.`,
    `APP USE BY WEEK, NEWEST FIRST:\n${usageLines.join('\n') || '(none)'}`,
    '',
    `LEDGER, OPEN FACTS (ref | state | date | statement | recorded):\n${openFactLines.join('\n') || '(none)'}`,
    '',
    `LEDGER, FACTS THAT RECENTLY HAPPENED OR CHANGED:\n${happenedFactLines.join('\n') || '(none)'}`,
    `CHANGES THIS WEEK: ${g.changes.map((c) => `${c.created_at.slice(0, 10)} ${c.from_state} to ${c.to_state}: ${trim(c.reason, 160)}`).join('; ') || 'none'}`,
    `CORRECTIONS THE PERSON MADE (always win): ${g.corrections.map((c) => `${c.corrected_at.slice(0, 10)}: "${trim(c.statement, 160)}" is wrong; they said "${trim(c.correction_text, 200)}"`).join('; ') || 'none'}`,
    '',
    `JOURNAL ENTRIES THIS WEEK (ref | date | title and words):\n${journalLines.join('\n') || '(none)'}`,
    '',
    `WHAT THEY SAID IN CHAT THIS WEEK:\n${g.chats.map((m) => `${dayOf(m.created_at)} | ${trim(m.content, 300)}`).join('\n') || '(nothing)'}`,
    '',
    `ON THEIR LIST, ADDED OR DONE THIS WEEK (ref | when | title):\n${itemLines.join('\n') || '(nothing)'}`,
    g.counts
      ? `THE WEEK COUNTED BY CODE (ref | count):\n${countLines.join('\n')}`
      : `THE WEEK COULD NOT BE COUNTED THIS TIME. HABITS THIS WEEK: ${g.habits.map((h) => `${trim(h.name || h.title, 50)} ${counts.get(h.id) || 0} of ${h.cadence === 'daily' ? 7 : h.target_per_period || 1}`).join('; ') || 'none'}`,
    '',
    `PEOPLE IN THEIR LIFE (ref | name | who they are to them | how often and how lately they come up in the facts, and the facts given here about them):\n${peopleLines.join('\n') || '(none recorded)'}`,
    '',
    `WHAT GREMLY WAS NOT SURE OF BEFORE, NEVER TO BE SAID AS KNOWN (ref | about | what | what Gremly thought | how sure | since):\n${unsureText.join('\n') || '(nothing)'}`,
    '',
    `WHAT THE LAST WEEKLY SUMMARIES SHOWED, NEWEST FIRST:\n${shownLines.join('\n') || '(none yet)'}`,
    '',
    `CURRENT LIFE MAP (domain / thread | state | last activity | summary):\n${threads.join('\n') || '(none yet)'}`,
    '',
    `CURRENT WORLDS (ref | name | phase | last real activity | items this week | card | summary | priorities):\n${worldLines.join('\n') || '(none)'}`,
    '',
    `OPEN QUESTIONS ALREADY ASKED:\n${qLines.join('\n') || '(none)'}`,
    '',
    `CHAPTERS (ref | title | kind | phase | dates | stage | card | summary | epigraph | priorities):\n${chapterLines.join('\n') || '(none)'}`,
    '',
    `THEIR STORY (written monthly from the ledger; private items are marked):\n${storyText.join('\n') || '(not written yet)'}`,
  ].join('\n');
  return { text, refs };
}

export async function weeklyRequestParams(env, userId, periodEnd) {
  const tz = await userTimezone(env, userId);
  const today = localDate(tz);
  const [g, person] = await Promise.all([
    gatherWeek(env, userId, tz, periodEnd),
    personIdentity(env, userId),
  ]);
  const { text, refs } = renderWeek(g, today);
  const m = modelFor(env, 'weekly');
  const system = weeklySystemPrompt(today, person);
  // the schema is in the prompt: with the summary's plan it is too large for
  // Anthropic's strict grammar (stage 5), so the reply is held to it by
  // weeklyShapeProblems instead
  const params = anthropicSchemaInPromptParams({
    model: m.model,
    system,
    user: text,
    schema: WEEKLY_SCHEMA,
    maxTokens: 24000,
  });
  return {
    params,
    // the same request for the model the pass falls back on (llm.js jsonCall)
    jsonArgs: { system, user: text, schema: WEEKLY_SCHEMA, maxTokens: 24000 },
    refsSnapshot: [...refs.entries()].map(([k, v]) => [
      k,
      {
        type: v.type,
        id: v.id,
        statement: v.statement,
        about_date: v.about_date,
        // the summary reads a fact's day as the week has it (stage 5)
        ...(v.type === 'fact'
          ? {
              about_date_end: v.about_date_end || null,
              timing: v.timing || null,
              // the note it was read from, so the summary keeps a private
              // entry's words off its cards as it keeps the fact off
              ...(v.source_table === 'notes' && v.source_id ? { note_id: v.source_id } : {}),
            }
          : {}),
        observed_at: v.observed_at,
        state: v.state,
        private: !!v.private,
        health: !!v.health,
        // the line the writer was shown, which the check reads it by (stage 7)
        ...(v.label ? { label: v.label } : {}),
        // a journal entry, a count and a person, as the summary plan names them
        ...(v.type === 'journal' ? { date: v.date } : {}),
        ...(v.type === 'item' ? { title: v.title, added: v.added, done: v.done, due: v.due } : {}),
        ...(v.type === 'count' ? { paths: v.paths, line: v.line } : {}),
        ...(v.type === 'person' ? { name: v.name, relationship: v.relationship || null } : {}),
        // what Gremly was not sure of before, by its own ref (context/unsure.js)
        ...(v.type === 'unsure' ? { person_id: v.person_id || null, kind: v.kind } : {}),
      },
    ]),
    today,
    tz,
    g,
    inputChars: text.length,
    // kept on the run, so the summary written from it has the same figures
    stats: { counts: g.counts || null },
  };
}

/**
 * What is wrong with the shape of a weekly result, read from a reply whose
 * schema was in the prompt: each top level field there and of its kind. A
 * result with problems is not applied; the pass falls back (functions.js).
 */
export function weeklyShapeProblems(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return ['no object'];
  const problems = [];
  for (const key of WEEKLY_SCHEMA.required) {
    if (SHAPE_OPTIONAL.has(key) && output[key] === undefined) continue;
    const want = WEEKLY_SCHEMA.properties[key].type;
    const v = output[key];
    const is = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    if (is !== want) problems.push(`${key} is ${v === undefined ? 'missing' : is}, not ${want}`);
  }
  if (output.life_map && !Array.isArray(output.life_map.domains))
    problems.push('life_map has no domains');
  if (output.summary_plan && !Array.isArray(output.summary_plan.cards))
    problems.push('summary_plan has no cards');
  return problems;
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Real prose, not a placeholder: a few words with letters in them. */
function isProse(s, minChars = 8) {
  return (
    typeof s === 'string' &&
    s.trim().length >= minChars &&
    /[a-z]{3,}/i.test(s) &&
    s.trim().split(/\s+/).length >= 2
  );
}


// ── The check on the pass (data fabric stage 7) ───────────────────────────
// Every note the pass writes goes through the shared check (workers/shared/
// check), as every other writer's sentences do: the comparison of 8 Oct found
// the pass was the one writer never under it.

/** When the pass's notes are read: on any day until the next weekly pass. */
export const WEEKLY_MOMENT = 'kept in their notes and read on any day until the next weekly pass';

const dayOnly = (x) => {
  const s = String(x || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * The records the pass was given, as the check reads them: each by its ref,
 * in the line the writer was shown. A run made before its refs kept their
 * lines gives none.
 */
export function weeklyRecords(refsSnapshot) {
  const records = new Map();
  for (const [ref, v] of refsSnapshot || []) {
    if (!v || typeof v.label !== 'string' || !v.label) continue;
    const dates = [];
    const spans = [];
    if (v.type === 'fact') {
      const a = dayOnly(v.about_date);
      const b = dayOnly(v.about_date_end);
      if (a) dates.push(a);
      if (b && b !== a) dates.push(b);
      if (a && b && b !== a) spans.push([a, b]);
    }
    if (v.type === 'journal' && dayOnly(v.date)) dates.push(dayOnly(v.date));
    if (v.type === 'item') for (const x of [v.added, v.done, v.due]) if (dayOnly(x)) dates.push(dayOnly(x));
    records.set(ref, {
      ref,
      label: v.label,
      dates,
      ...(spans.length ? { spans } : {}),
      ...(v.type === 'person' && v.name ? { names: [v.name] } : {}),
      private: !!v.private,
      health: !!v.health,
    });
  }
  return records;
}

/** The profile's paragraphs, as the writer wrote them. Pure. */
function profileParagraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const refList = (x) => (Array.isArray(x) ? x.filter((r) => typeof r === 'string' && r) : []);

/**
 * Every note in a pass's result as a sentence for the check, by a key that
 * says where it is kept. Lines seen at a glance are the Worlds headline, the
 * week note and the summary's character; the summary's cards and the notes on
 * people are held to the same rule. Pure.
 */
export function weeklyCheckItems(output, { countRefs = [], personRefs = [] } = {}) {
  const items = [];
  const push = (key, text, refs, glanceable = false) => {
    if (!String(text || '').trim()) return;
    items.push({ key, sentence: { text: String(text), refs: refList(refs), stated: [] }, glanceable, listed: false });
  };
  (output?.life_map?.domains || []).forEach((dm, di) =>
    (dm?.threads || []).forEach((t, ti) => {
      push(`lm.${di}.${ti}.summary`, t?.summary, t?.fact_refs);
      push(`lm.${di}.${ti}.update`, t?.recent_update, t?.fact_refs);
    }),
  );
  const paras = profileParagraphs(output?.profile_text);
  const given = Array.isArray(output?.profile_refs) ? output.profile_refs : [];
  // a paragraph rests on its own list; when the lists do not line up, on all of them
  const all = [...new Set(given.flatMap(refList))];
  // the profile is a portrait of who matters to them: it is read beside the people list
  paras.forEach((para, i) => push(`profile.${i}`, para, [...new Set([...refList(paras.length === given.length ? given[i] : all), ...refList(personRefs)])]));
  // a World's or a Chapter's notes rest on its own line too: its name, its dates and what it is
  const own = (refs, ref) => [...refList(refs), ...(ref ? [ref] : [])];
  (output?.worlds || []).forEach((w, i) => {
    push(`w.${i}.summary`, w?.summary, own(w?.card_fact_refs, w?.world_ref));
    (w?.key_priorities || []).forEach((k, j) => push(`w.${i}.p.${j}`, k?.text, own(w?.card_fact_refs, w?.world_ref)));
  });
  push('ws.headline', output?.worlds_summary?.headline, output?.worlds_summary?.refs, true);
  (output?.chapters || []).forEach((c, i) => {
    push(`c.${i}.summary`, c?.summary, own(c?.card_fact_refs, c?.chapter_ref));
    (c?.key_priorities || []).forEach((k, j) => push(`c.${i}.p.${j}`, k?.text, own(c?.card_fact_refs, c?.chapter_ref)));
  });
  (output?.questions || []).forEach((q, i) => push(`q.${i}`, q?.question, q?.fact_ref ? [q.fact_ref] : []));
  push('week_note', output?.week_note, output?.week_note_refs, true);
  const plan = output?.summary_plan;
  // the character and the line speak of the whole week: they rest on every
  // planned card and on the week's counts, as the summary's opening does
  const planRefs = [...new Set([...(plan?.cards || []).flatMap((c) => refList(c?.refs)), ...refList(countRefs)])];
  push('plan.character', plan?.character, planRefs, true);
  push('plan.line', plan?.through_line, planRefs);
  // a summary card and a note on a person never rest on anything private or
  // about health (the summary and the line about a person are written from
  // them), so they are held to the glanceable rule
  (plan?.cards || []).forEach((c, i) => push(`plan.card.${i}`, c?.about, c?.refs, true));
  (output?.people_notes || []).forEach((n, i) =>
    push(`pn.${i}`, n?.note, [...refList(n?.refs), ...(n?.person_ref ? [n.person_ref] : [])], true),
  );
  return items;
}

/** Where a note is kept, as its writer is told when it goes back alone. */
export function whereKept(key) {
  const k = String(key);
  if (k.startsWith('lm.')) return k.endsWith('.update') ? "a thread of their Life Map, its recent update (Gremly's own)" : "a thread of their Life Map, its summary (Gremly's own)";
  if (k.startsWith('profile.')) return "a paragraph of their profile (Gremly's own)";
  if (/^w\.\d+\.p\./.test(k)) return "a priority in Gremly's notes on one of their Worlds (shown to them)";
  if (k.startsWith('w.')) return "Gremly's notes on one of their Worlds (shown to them)";
  if (k === 'ws.headline') return 'the Worlds headline (shown to them at a glance)';
  if (/^c\.\d+\.p\./.test(k)) return "a priority in Gremly's notes on a Chapter of their life (shown to them)";
  if (k.startsWith('c.')) return "Gremly's notes on a Chapter of their life (shown to them)";
  if (k.startsWith('q.')) return 'a question Gremly will ask them';
  if (k === 'week_note') return 'the note on their week (shown to them)';
  if (k === 'plan.character') return "the character of their weekly summary, shown as it is on its opening card, using neither their name nor a pronoun for them";
  if (k === 'plan.line') return "the line that runs through their weekly summary's plan (Gremly's own)";
  if (k.startsWith('plan.card.')) return "what one card of their weekly summary will show, for its writer (Gremly's own)";
  if (k.startsWith('pn.')) return "a note on one person in their life (Gremly's own)";
  return 'one of Gremly\'s notes';
}

/**
 * The result as it stands after the check: a note that held stays, one
 * written again replaces it and rests on what it now cites, and one still
 * wrong is left empty, or taken out when it is one of a list. A World or
 * Chapter whose notes were left out is marked cleared, so the notes are
 * emptied rather than kept from last week. Pure.
 */
export function afterWeeklyCheck(output, results) {
  const out = JSON.parse(JSON.stringify(output || {}));
  const leftOut = [];
  const pick = (key, text) => {
    const r = results.get(key);
    if (!r || r.outcome === 'pass' || r.outcome === 'empty') return { text, refs: null, kept: true };
    if (r.outcome === 'rewritten' && r.sentence?.text) return { text: r.sentence.text, refs: refList(r.refs), kept: true };
    leftOut.push(key);
    return { text: '', refs: [], kept: false };
  };
  const union = (a, b) => [...new Set([...refList(a), ...refList(b)])];
  (out.life_map?.domains || []).forEach((dm, di) =>
    (dm?.threads || []).forEach((t, ti) => {
      const s = pick(`lm.${di}.${ti}.summary`, t.summary);
      const u = pick(`lm.${di}.${ti}.update`, t.recent_update);
      t.summary = s.text;
      t.recent_update = u.text;
      t.fact_refs = union(t.fact_refs, [...(s.refs || []), ...(u.refs || [])]);
    }),
  );
  const paras = profileParagraphs(out.profile_text);
  if (paras.length) {
    const given = Array.isArray(out.profile_refs) ? out.profile_refs : [];
    const keptParas = [];
    const keptRefs = [];
    paras.forEach((para, i) => {
      const r = pick(`profile.${i}`, para);
      if (!r.kept || !r.text) return;
      keptParas.push(r.text);
      keptRefs.push((r.refs || (paras.length === given.length ? refList(given[i]) : [])).filter((x) => !/^p\d+$/.test(x) || refList(given[i]).includes(x)));
    });
    out.profile_text = keptParas.join('\n\n');
    out.profile_refs = keptRefs;
  }
  (out.worlds || []).forEach((w, i) => {
    const s = pick(`w.${i}.summary`, w.summary);
    w.summary = s.text;
    if (!s.kept) w.cleared = true;
    if (s.refs) w.card_fact_refs = union(w.card_fact_refs, s.refs.filter((r) => r !== w.world_ref));
    w.key_priorities = (w.key_priorities || [])
      .map((k, j) => {
        const r = pick(`w.${i}.p.${j}`, k?.text);
        return r.kept && r.text ? { ...k, text: r.text } : null;
      })
      .filter(Boolean);
  });
  if (out.worlds_summary) {
    const h = pick('ws.headline', out.worlds_summary.headline);
    out.worlds_summary.headline = h.text;
    if (h.refs) out.worlds_summary.refs = h.refs;
  }
  (out.chapters || []).forEach((c, i) => {
    const s = pick(`c.${i}.summary`, c.summary);
    c.summary = s.text;
    if (!s.kept) c.cleared = true;
    if (s.refs) c.card_fact_refs = union(c.card_fact_refs, s.refs.filter((r) => r !== c.chapter_ref));
    c.key_priorities = (c.key_priorities || [])
      .map((k, j) => {
        const r = pick(`c.${i}.p.${j}`, k?.text);
        return r.kept && r.text ? { ...k, text: r.text } : null;
      })
      .filter(Boolean);
  });
  out.questions = (out.questions || [])
    .map((q, i) => {
      const r = pick(`q.${i}`, q?.question);
      return r.kept && r.text ? { ...q, question: r.text } : null;
    })
    .filter(Boolean);
  const note = pick('week_note', out.week_note);
  out.week_note = note.text;
  if (note.refs) out.week_note_refs = note.refs;
  if (out.summary_plan) {
    const plan = out.summary_plan;
    plan.character = pick('plan.character', plan.character).text;
    plan.through_line = pick('plan.line', plan.through_line).text;
    plan.cards = (plan.cards || [])
      .map((c, i) => {
        const r = pick(`plan.card.${i}`, c?.about);
        return r.kept && r.text ? { ...c, about: r.text, refs: r.refs || c.refs } : null;
      })
      .filter(Boolean);
  }
  out.people_notes = (out.people_notes || [])
    .map((n, i) => {
      const r = pick(`pn.${i}`, n?.note);
      if (!r.kept || !r.text) return null;
      // the person it is about stays its own ref, never among what it rests on
      return { ...n, note: r.text, refs: r.refs ? r.refs.filter((x) => x !== n.person_ref) : n.refs };
    })
    .filter(Boolean);
  return { output: out, left_out: leftOut };
}

/** The check as the pass asks it: the words question, a second reader, and one note again. */
export function weeklyCheckCalls(env, person, today) {
  const words = (primary, fallback) => async (req) =>
    (await jsonCall(env, { primary, fallback, ...req, maxTokens: 900, effort: 'low', thinking: 'low' })).output;
  const rewrite = async ({ key, sentence, records, problems }) =>
    (
      await jsonCall(env, {
        primary: modelFor(env, 'rewrite'),
        fallback: modelFor(env, 'rewriteFallback'),
        system: weeklyNoteRewritePrompt(person),
        user: `WHERE IT IS KEPT: ${whereKept(key)}\nTODAY: ${weekdayName(today)} ${today}.\n\nRECORDS:\n${records.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((x) => `- ${x}`).join('\n')}`,
        schema: SENTENCE_SCHEMA,
        maxTokens: 1500,
        thinking: 'low',
        effort: 'low',
      })
    ).output;
  return {
    ask: words(modelFor(env, 'check'), modelFor(env, 'checkFallback')),
    confirm: words(modelFor(env, 'checkSecond'), null),
    rewrite,
  };
}

/**
 * Every note of a pass's result through the check. A run whose refs kept no
 * lines (made before stage 7) cannot be checked, and is said to be applied
 * unchecked. When the words question could not be asked for more than a few
 * notes, it throws, so the step is tried again rather than leaving the
 * person's notes blank because a model was down.
 */
export async function checkWeekly({ output, refsSnapshot, today, person, ask, rewrite, confirm = null, previous = null }) {
  const records = weeklyRecords(refsSnapshot);
  // the week's counts a line seen at a glance may rest on: none marked private or about health
  const countRefs = (refsSnapshot || []).filter(([, v]) => v?.type === 'count' && !v.private && !v.health).map(([k]) => k);
  const personRefs = (refsSnapshot || []).filter(([, v]) => v?.type === 'person').map(([k]) => k);
  const items = weeklyCheckItems(output, { countRefs, personRefs });
  if (!records.size)
    return { output, counts: { checked: 0, sent_back: 0, left_out: 0 }, details: [], left_out: [], unchecked: 'the run kept no lines for its refs' };
  const check = await runCheck({ items, records, today, moment: WEEKLY_MOMENT, person, ask, rewrite, confirm });
  const unasked = check.details.filter((x) => [...(x.first || []), ...(x.second || [])].some((p) => p.step === 'unasked')).length;
  if (unasked > Math.max(2, Math.ceil(items.length / 10)))
    throw new Error(`[ALERT] the check on the weekly pass could not ask about ${unasked} of ${items.length} notes; not applied, to be tried again`);
  // a World's or a Chapter's notes that were left out keep the notes they had,
  // when those are read the same way and still hold: true and older is
  // better than blank (stage 7)
  const results = new Map(check.results);
  const kept = [];
  if (previous) {
    const again = [];
    for (const it of items) {
      const m = /^(w|c)\.(\d+)\.summary$/.exec(it.key);
      if (!m || results.get(it.key)?.outcome !== 'left_out') continue;
      const row = m[1] === 'w' ? output?.worlds?.[Number(m[2])] : output?.chapters?.[Number(m[2])];
      const before = previous.get(m[1] === 'w' ? row?.world_ref : row?.chapter_ref);
      if (before && String(before).trim()) again.push({ ...it, sentence: { ...it.sentence, text: String(before) } });
    }
    if (again.length) {
      const old = await runCheck({ items: again, records, today, moment: WEEKLY_MOMENT, person, ask, rewrite: async () => null, confirm });
      for (const it of again) {
        const r = old.results.get(it.key);
        if (r?.outcome === 'pass') {
          results.set(it.key, { outcome: 'rewritten', sentence: { text: it.sentence.text }, refs: it.sentence.refs });
          kept.push(it.key);
        }
      }
    }
  }
  const after = afterWeeklyCheck(output, results);
  return { output: after.output, counts: { ...check.counts, ...(kept.length ? { kept_before: kept.length } : {}) }, details: check.details, left_out: after.left_out, kept_before: kept };
}

/** Apply a weekly result. In shadow mode nothing user-facing changes. */
export async function applyWeekly(env, userId, output, refsSnapshot, { shadow, runId, today, calls = null, model = null }) {
  const d = db(env);
  const refs = new Map(refsSnapshot);
  // every note through the check before anything is kept (stage 7), with
  // the notes each World and Chapter has now, which one left out may keep
  const person = await personIdentity(env, userId);
  const notesNow = new Map();
  const idsOf = (type) => [...refs.entries()].filter(([, v]) => v?.type === type && v.id).map(([k, v]) => [k, v.id]);
  for (const [type, table] of [['world', 'worlds'], ['chapter', 'chapters']]) {
    const pairs = idsOf(type);
    if (!pairs.length) continue;
    const rows = (await d.select(`${table}?owner_id=eq.${userId}&id=in.(${pairs.map(([, id]) => id).join(',')})&select=id,summary`)) || [];
    const byId = new Map(rows.map((r) => [r.id, r.summary]));
    for (const [ref, id] of pairs) if (byId.get(id)) notesNow.set(ref, byId.get(id));
  }
  const checked = await checkWeekly({
    output,
    refsSnapshot,
    today,
    person,
    previous: notesNow,
    ...(calls || weeklyCheckCalls(env, person, today)),
  });
  if (checked.unchecked)
    console.error(`[ALERT][Weekly] ${userId}: applied unchecked, ${checked.unchecked}`);
  output = checked.output;
  const checkResult = { counts: checked.counts, left_out: checked.left_out, ...(checked.kept_before?.length ? { kept_before: checked.kept_before } : {}), ...(checked.unchecked ? { unchecked: checked.unchecked } : {}) };
  if (!shadow && checked.counts.checked)
    await d
      .insertQuiet('check_runs', [
        checkRunRow({ userId, job: 'weekly', day: today, counts: checked.counts, details: checked.details, model }),
      ])
      .catch((err) => console.warn(`[Weekly] could not log the check: ${err.message}`));
  const nowIso = new Date().toISOString();
  const [current] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map,version`);
  const existingDomains = new Map(
    (current?.life_map?.domains || []).map((dm) => [dm.name.toLowerCase(), dm]),
  );

  // Life Map, rebuilt in the existing shape with evidence from cited facts.
  let lastEvidence = null;
  const domains = (output.life_map?.domains || []).map((dm) => {
    const prior = existingDomains.get(String(dm.name).toLowerCase());
    return {
      name: dm.name,
      source: prior?.source || 'ai_detected',
      space_id: prior?.space_id || null,
      attention: dm.attention,
      threads: (dm.threads || [])
        .filter((t) => isProse(t?.name, 3) || isProse(t?.summary, 20))
        .map((t) => {
          const evidence = (t.fact_refs || [])
            .map((r) => refs.get(r))
            .filter((f) => f && f.type === 'fact')
            .map((f) => {
              const date =
                f.about_date && f.about_date <= today
                  ? f.about_date
                  : String(f.observed_at || '').slice(0, 10) || null;
              if (date && date <= today && (!lastEvidence || date > lastEvidence))
                lastEvidence = date;
              return {
                type: 'fact',
                date,
                signal: f.statement,
                fact_id: f.id,
                salience: 'medium',
                source: 'ledger',
              };
            });
          const la = validDate(t.last_activity);
          return {
            name: t.name,
            status: t.status,
            momentum: t.momentum,
            lifecycle: t.lifecycle,
            importance: t.importance,
            attention: t.attention,
            last_activity: la && la <= today ? la : null,
            summary: t.summary,
            recent_update: t.recent_update || null,
            evidence,
          };
        }),
    };
  });
  const lifeMap = {
    version: (current?.life_map?.version || 0) + 1,
    rebuilt_at: nowIso,
    updated_at: nowIso,
    source: 'weekly_synthesis',
    domains,
    ...(current?.life_map?.story ? { story: current.life_map.story } : {}),
  };

  // Worlds
  const worldUpdates = [];
  const skipped = [];
  for (const w of output.worlds || []) {
    const ref = refs.get(w.world_ref);
    if (!ref || ref.type !== 'world') continue;
    // A placeholder summary leaves that world as it is this week. Its card
    // line is the words writer's now (context/words.js), so it gates nothing.
    if (!isProse(w.summary, 20) && !w.cleared) {
      skipped.push({ world_ref: w.world_ref, summary: w.summary });
      continue;
    }
    // When the world was last lived in, from the facts the model cited: the day
    // the person recorded each one (a plan made is a sign of life too), and for
    // something that happened, the day it happened.
    let lived = null;
    for (const r of w.card_fact_refs || []) {
      const f = refs.get(r);
      if (!f || f.type !== 'fact') continue;
      const days = [
        String(f.observed_at || '').slice(0, 10),
        f.state === 'happened' ? f.about_date : null,
      ];
      for (const day of days)
        if (validDate(day) && day <= today && (!lived || day > lived)) lived = day;
    }
    worldUpdates.push({ id: ref.id, w, lived });
  }
  const featured = (output.worlds_summary?.featured || [])
    .map((f) => ({
      world_id: refs.get(f.world_ref)?.type === 'world' ? refs.get(f.world_ref).id : null,
      reason: f.reason,
    }))
    .filter((f) => f.world_id);
  const worldsSummary = {
    headline: output.worlds_summary?.headline || null,
    featured,
    generated_at: nowIso,
    source: 'weekly_synthesis',
  };

  // Chapters
  const chapterUpdates = [];
  for (const c of output.chapters || []) {
    const ref = refs.get(c.chapter_ref);
    if (!ref || ref.type !== 'chapter') continue;
    // A placeholder summary leaves that chapter as it is this week; its card
    // line is the words writer's now, so it gates nothing.
    if (!isProse(c.summary, 20) && !c.cleared) {
      skipped.push({ chapter_ref: c.chapter_ref, summary: c.summary });
      continue;
    }
    // A chapter's notes must rest on cited facts; notes the check left out are emptied.
    const cited = (c.card_fact_refs || [])
      .map((r) => refs.get(r))
      .filter((f) => f && f.type === 'fact');
    if (!cited.length && !c.cleared) {
      skipped.push({ chapter_ref: c.chapter_ref, summary: c.summary, reason: 'cites no facts' });
      continue;
    }
    chapterUpdates.push({ id: ref.id, c });
  }

  const applied = {
    threads: domains.reduce((n, dm) => n + dm.threads.length, 0),
    worlds: worldUpdates.length,
    chapters: chapterUpdates.length,
    worlds_skipped: skipped,
    questions: 0,
    check: checkResult,
  };
  const profileOk = isProse(output.profile_text, 120);
  if (!profileOk) applied.profile_skipped = String(output.profile_text || '').slice(0, 200);
  // A Life Map with no threads is not a rewrite; keep the current one.
  const lifeMapOk = applied.threads > 0;
  if (!lifeMapOk) applied.life_map_skipped = true;
  // What Gremly is not sure of yet, and who matters most (context/unsure.js):
  // never shown, so it waits on nothing the check does
  let unsure = null;
  try {
    const state = await loadUnsureState(d, userId);
    const plan = unsurePlan({ output, refs, ...state, today });
    unsure = { state, plan };
    applied.unsure = {
      added: plan.inserts.length,
      given_again: plan.updates.length,
      faded: plan.fades.length,
      dropped: plan.dropped,
      matters: plan.matters.length,
    };
  } catch (err) {
    applied.unsure = { error: String(err?.message || err).slice(0, 200) };
    console.warn(`[ALERT][Weekly] what Gremly is not sure of could not be planned for ${userId}: ${applied.unsure.error}`);
  }
  // the day each open Chapter ends, as the pass gives it from a fact it cites
  let chapterEnds = [];
  try {
    chapterEnds = chapterEndPlan({ output, refs });
    applied.chapter_ends = chapterEnds.map((x) => ({ chapter_id: x.chapter_id, end_date: x.end_date, ...(x.refused ? { refused: x.refused } : {}) }));
  } catch (err) {
    applied.chapter_ends = { error: String(err?.message || err).slice(0, 200) };
  }
  // the people on each Chapter (chapter_people), as the pass names them
  let chapterPeople = [];
  try {
    chapterPeople = chapterPeoplePlan({ output, refs, ties: await citedTies(d, userId, output, refs) });
    applied.chapter_people = {
      chapters: chapterPeople.length,
      people: chapterPeople.reduce((n, c) => n + c.people.length, 0),
      dropped: chapterPeople.flatMap((c) => c.dropped.map((x) => ({ chapter_id: c.chapter_id, ...x }))),
    };
  } catch (err) {
    applied.chapter_people = { error: String(err?.message || err).slice(0, 200) };
    console.warn(`[ALERT][Weekly] the people on Chapters could not be planned for ${userId}: ${applied.chapter_people.error}`);
  }
  if (shadow)
    return { applied, lifeMap, worldUpdates, chapterUpdates, worldsSummary, output, check: checked, unsure: unsure?.plan || null, chapterPeople, chapterEnds };

  // Keep what this run replaces, so a bad week can be rolled back by hand.
  const [prevProfile] = await d.select(`user_profiles?user_id=eq.${userId}&select=profile_text`);
  const prevWorlds = await d.select(
    `worlds?owner_id=eq.${userId}&select=id,phase,card_subtitle,card_subtitle_source,summary,summary_source,key_priorities,last_signal_at`,
  );
  const previous = {
    life_map: current?.life_map || null,
    profile_text: prevProfile?.profile_text ?? null,
    worlds: prevWorlds,
  };

  if (lifeMapOk && current) {
    await d.update(`user_life_map?id=eq.${current.id}`, {
      life_map: lifeMap,
      version: (current.version || 1) + 1,
      rebuilt_at: nowIso,
      updated_at: nowIso,
      last_evidence_date: lastEvidence,
    });
  } else if (lifeMapOk) {
    await d.insertQuiet('user_life_map', [
      {
        user_id: userId,
        life_map: lifeMap,
        version: 1,
        rebuilt_at: nowIso,
        updated_at: nowIso,
        last_evidence_date: lastEvidence,
      },
    ]);
  }

  // Other prompts read the IDENTITY line at the top of profile_text, so it stays first.
  const idLine = identityLine(person);
  const profileText = [idLine, String(output.profile_text || '').trim()]
    .filter(Boolean)
    .join('\n\n');
  const [profileRow] = await d.select(`user_profiles?user_id=eq.${userId}&select=user_id,signals`);
  const signals = {
    ...(profileRow?.signals || {}),
    source: 'weekly_synthesis',
    synthesized_at: nowIso,
  };
  if (profileOk && profileRow)
    await d.update(`user_profiles?user_id=eq.${userId}`, {
      profile_text: profileText,
      signals,
      generated_at: nowIso,
      model_used: 'weekly_synthesis',
    });
  else if (profileOk)
    await d.insertQuiet('user_profiles', [
      {
        user_id: userId,
        profile_text: profileText,
        signals,
        generated_at: nowIso,
        model_used: 'weekly_synthesis',
      },
    ]);

  const [worldRows] = [
    await d.select(
      `worlds?owner_id=eq.${userId}&select=id,card_subtitle_source,summary_source,last_signal_at`,
    ),
  ];
  const sources = new Map(worldRows.map((r) => [r.id, r]));
  // What this run writes from what: each passage with the facts it cites
  const passages = [];
  const factIdsOf = (list) =>
    (list || [])
      .map((r) => refs.get(r))
      .filter((f) => f && f.type === 'fact')
      .map((f) => f.id);
  // The words under a World and a Chapter (card_subtitle), a Chapter's memory
  // (epigraph) and its title each have one writer now (data fabric stage 4b):
  // the words writer, the memory writer and the person. This pass writes
  // Gremly's notes (summary) and the rest, and none of those three.
  for (const { id, w, lived } of worldUpdates) {
    const src = sources.get(id) || {};
    const patch = {
      phase: w.phase,
      updated_at: nowIso,
      key_priorities: (w.key_priorities || [])
        .slice(0, 5)
        .map((k) => ({ text: k.text, date: validDate(k.date) })),
    };
    if (lived && (!src.last_signal_at || String(src.last_signal_at).slice(0, 10) < lived))
      patch.last_signal_at = `${lived}T12:00:00Z`;
    if (src.summary_source !== 'user')
      Object.assign(patch, {
        summary: w.summary,
        summary_source: 'synthesis',
        summary_updated_at: nowIso,
      });
    // once the old Worlds fields stop (shared/worldsFields.js), neither the
    // phase nor the priorities are written: a World is there or hidden
    if (oldWorldsFieldsStopped(env)) delete patch.phase;
    await d.update(
      `worlds?id=eq.${id}&owner_id=eq.${userId}`,
      withoutOldFields('worlds', patch, env),
    );
  }

  // Chapters: the words, stage label and priorities, never the person's own edits.
  if (chapterUpdates.length) {
    const ids = chapterUpdates.map((u) => u.id).join(',');
    const prevChapters = await d.select(
      `chapters?id=in.(${ids})&owner_id=eq.${userId}&select=id,phase,title,title_source,card_subtitle,card_subtitle_source,summary,summary_source,epigraph,epigraph_source,key_priorities,key_priorities_source,current_phase_key,current_phase_key_source,phase_labels,phase_labels_source`,
    );
    previous.chapters = prevChapters;
    const byId = new Map(prevChapters.map((r) => [r.id, r]));
    for (const { id, c } of chapterUpdates) {
      const row = byId.get(id);
      if (!row) continue;
      const patch = { updated_at: nowIso };
      if (row.summary_source !== 'user')
        Object.assign(patch, {
          summary: trim(c.summary, 900),
          summary_source: 'synthesis',
          summary_updated_at: nowIso,
        });
      if (row.key_priorities_source !== 'user') {
        const kp =
          row.phase === 'closed'
            ? []
            : (c.key_priorities || [])
                .filter((k) => isProse(k.text, 3))
                .slice(0, 3)
                .map((k, i) => ({
                  kind: k.kind || 'action',
                  rank: i + 1,
                  text: trim(k.text, 120),
                  due_date: validDate(k.date),
                }));
        Object.assign(patch, {
          key_priorities: kp,
          key_priorities_source: 'synthesis',
          key_priorities_updated_at: nowIso,
        });
      }
      // The stage label replaces the current one in the chapter's arc, so the arc stays whole.
      if (
        typeof c.stage === 'string' &&
        /[a-z]{3,}/i.test(c.stage) &&
        row.current_phase_key_source !== 'user' &&
        row.phase_labels_source !== 'user'
      ) {
        const stage = trim(c.stage, 40);
        const labels = Array.isArray(row.phase_labels) ? [...row.phase_labels] : [];
        const at = labels.indexOf(row.current_phase_key);
        if (at >= 0) labels[at] = stage;
        else if (!labels.includes(stage)) labels.push(stage);
        Object.assign(patch, {
          current_phase_key: stage,
          current_phase_key_source: 'synthesis',
          current_phase_key_updated_at: nowIso,
          phase_labels: labels,
          phase_labels_source: 'synthesis',
          phase_labels_updated_at: nowIso,
        });
      }
      // the priorities and the stage stop with the old Worlds fields (shared/worldsFields.js)
      await d.update(
        `chapters?id=eq.${id}&owner_id=eq.${userId}`,
        withoutOldFields('chapters', patch, env),
      );
      // Gremly's notes rest on the facts they cite; notes cleared rest on nothing
      for (const field of ['summary']) {
        if (field in patch && !patch[field])
          await d.remove(
            `passage_refs?user_id=eq.${userId}&row_table=eq.chapters&row_id=eq.${id}&field=eq.${field}`,
          );
        if (patch[field])
          passages.push(
            passageRow({
              userId,
              surface: 'chapter',
              table: 'chapters',
              id,
              field,
              factIds: factIdsOf(c.card_fact_refs),
              writer: 'weekly',
              promptVersion: WEEKLY_PROMPT_VERSION,
              at: nowIso,
            }),
          );
      }
    }
  }

  // a retry asks its questions once: open ones a failed attempt wrote go first
  await d.remove(`gremly_questions?user_id=eq.${userId}&run_id=eq.${runId}&status=eq.open`);
  for (const q of output.questions || []) {
    if (!q.question) continue;
    const f = q.fact_ref ? refs.get(q.fact_ref) : null;
    await d.insertQuiet('gremly_questions', [
      {
        user_id: userId,
        question: trim(q.question, 300),
        status: 'open',
        about_fact_id: f?.type === 'fact' ? f.id : null,
        run_id: runId,
        prompt_version: WEEKLY_PROMPT_VERSION,
      },
    ]);
    applied.questions++;
  }

  // Each Life Map thread rests on the facts in its evidence. Its place in the
  // map moves from week to week, so the map's old records go first.
  if (lifeMapOk) {
    const lmId =
      current?.id || (await d.select(`user_life_map?user_id=eq.${userId}&select=id`))[0]?.id;
    if (lmId) {
      await d.remove(
        `passage_refs?user_id=eq.${userId}&row_table=eq.user_life_map&row_id=eq.${lmId}`,
      );
      domains.forEach((dm, di) =>
        dm.threads.forEach((t, ti) => {
          for (const field of ['summary', 'recent_update'])
            if (t[field])
              passages.push(
                passageRow({
                  userId,
                  surface: 'life_map',
                  table: 'user_life_map',
                  id: lmId,
                  field: `domains.${di}.threads.${ti}.${field}`,
                  factIds: (t.evidence || []).map((e) => e.fact_id),
                  writer: 'weekly',
                  promptVersion: WEEKLY_PROMPT_VERSION,
                  at: nowIso,
                }),
              );
        }),
      );
    }
  }
  applied.passages = await recordPassages(d, passages);

  if (chapterEnds.some((x) => !x.refused))
    try {
      applied.chapter_ends = {
        ...(await applyChapterEnds(d, userId, chapterEnds.filter((x) => !x.refused), nowIso)),
        refused: chapterEnds.filter((x) => x.refused),
      };
    } catch (err) {
      applied.chapter_ends = { error: String(err?.message || err).slice(0, 200) };
      console.warn(`[ALERT][Weekly] the end dates of Chapters could not be kept for ${userId}: ${applied.chapter_ends.error}`);
    }

  if (chapterPeople.length)
    try {
      applied.chapter_people = { ...applied.chapter_people, ...(await applyChapterPeople(d, userId, chapterPeople, nowIso)) };
    } catch (err) {
      applied.chapter_people = { ...applied.chapter_people, error: String(err?.message || err).slice(0, 200) };
      console.warn(`[ALERT][Weekly] the people on Chapters could not be kept for ${userId}: ${applied.chapter_people.error}`);
    }

  if (unsure)
    try {
      applied.unsure = {
        ...(await applyUnsure(d, userId, unsure.plan, {
          runId,
          promptVersion: WEEKLY_PROMPT_VERSION,
          nowIso,
          people: unsure.state.people,
        })),
        dropped: unsure.plan.dropped,
      };
    } catch (err) {
      applied.unsure = { ...applied.unsure, error: String(err?.message || err).slice(0, 200) };
      console.warn(`[ALERT][Weekly] what Gremly is not sure of could not be kept for ${userId}: ${applied.unsure.error}`);
    }

  await invalidateChatCache(env, userId);
  return { applied, worldsSummary, previous, output };
}

// ── The people on each Chapter ─────────────────────────────────────────────
// The pass names, for each Chapter, the people who are part of it. Code keeps
// a person only when one of the facts the Chapter's notes cite, that can be
// shown, is about them: never someone the facts do not tie to it, and never
// through something private or about health. It writes chapter_people as
// Gremly's, and never touches a row the person wrote.

/** Which people the facts the Chapters cite are about. */
async function citedTies(d, userId, output, refs) {
  const ids = [
    ...new Set(
      (output?.chapters || [])
        .flatMap((c) => c?.card_fact_refs || [])
        .map((r) => refs.get(r))
        .filter((f) => f?.type === 'fact' && f.id)
        .map((f) => f.id),
    ),
  ];
  const out = [];
  for (let i = 0; i < ids.length; i += 100)
    out.push(
      ...((await d.select(
        `life_fact_people?user_id=eq.${userId}&fact_id=in.(${ids.slice(i, i + 100).join(',')})&select=fact_id,person_id`,
      )) || []),
    );
  return out;
}

/**
 * The people on each Chapter the pass gave people for. Pure.
 * @param ties [{ fact_id, person_id }] for the facts the Chapters cite
 * @returns [{ chapter_id, people: [person id], dropped: [{ ref, why }] }]
 */
export function chapterPeoplePlan({ output, refs, ties = [] }) {
  const about = new Map();
  for (const t of ties) about.set(t.fact_id, [...(about.get(t.fact_id) || []), t.person_id]);
  const plan = [];
  for (const c of output?.chapters || []) {
    const ref = refs.get(c?.chapter_ref);
    // a reply without the field says nothing about who is on the Chapter
    if (ref?.type !== 'chapter' || !ref.id || !Array.isArray(c.people_refs)) continue;
    const shown = (c.card_fact_refs || [])
      .map((r) => refs.get(r))
      .filter((f) => f?.type === 'fact' && f.id && !f.private && !f.health);
    const tied = new Set(shown.flatMap((f) => about.get(f.id) || []));
    const people = [];
    const dropped = [];
    for (const r of c.people_refs) {
      const p = refs.get(r);
      if (p?.type !== 'person' || !p.id) dropped.push({ ref: r, why: 'not someone it was given' });
      else if (!tied.has(p.id)) dropped.push({ ref: r, why: 'in no fact it cites that can be shown' });
      else if (!people.includes(p.id)) people.push(p.id);
    }
    plan.push({ chapter_id: ref.id, people, dropped });
  }
  return plan;
}

/**
 * The day each Chapter ends, from the fact the pass says it was begun for.
 * Pure. The pass names the fact; code reads its day, the last day of its span
 * when it has one: never a day no record gives.
 * @returns [{ chapter_id, end_date, fact_id }]
 */
export function chapterEndPlan({ output, refs }) {
  const out = [];
  for (const c of output?.chapters || []) {
    const ref = refs.get(c?.chapter_ref);
    const f = refs.get(c?.begun_for_ref);
    if (ref?.type !== 'chapter' || !ref.id || f?.type !== 'fact') continue;
    const end = validDate(String(f.about_date_end || '').slice(0, 10)) || validDate(String(f.about_date || '').slice(0, 10));
    if (!end || out.some((x) => x.chapter_id === ref.id)) continue;
    // a Chapter never ends before it began: the fact named is not what it was begun for
    const start = validDate(String(ref.start_date || '').slice(0, 10));
    out.push({ chapter_id: ref.id, end_date: end, fact_id: f.id, ...(start && end < start ? { refused: 'before it began' } : {}) });
  }
  return out;
}

/**
 * Keep the end dates on open Chapters, as Gremly's: never over a date the
 * person set, never on a Chapter already closed.
 */
export async function applyChapterEnds(d, userId, plan, nowIso) {
  const ids = plan.map((x) => x.chapter_id);
  const rows = ids.length
    ? (await d.select(
        `chapters?owner_id=eq.${userId}&id=in.(${ids.join(',')})&select=id,phase,closed_at,end_date,end_date_source`,
      )) || []
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const set = [];
  for (const x of plan) {
    const r = byId.get(x.chapter_id);
    if (!r || r.phase === 'closed' || r.closed_at || r.end_date_source === 'user') continue;
    if (String(r.end_date || '').slice(0, 10) === x.end_date) continue;
    await d.update(`chapters?id=eq.${x.chapter_id}&owner_id=eq.${userId}&closed_at=is.null`, {
      end_date: x.end_date,
      end_date_source: 'synthesis',
      end_date_updated_at: nowIso,
    });
    set.push({ chapter_id: x.chapter_id, end_date: x.end_date, was: r.end_date || null });
  }
  return { set };
}

/** Keep the plan: Gremly's rows as given, the person's own never touched. */
export async function applyChapterPeople(d, userId, plan, nowIso) {
  let added = 0;
  let removed = 0;
  for (const cp of plan) {
    const rows =
      (await d.select(
        `chapter_people?user_id=eq.${userId}&chapter_id=eq.${cp.chapter_id}&select=person_id,written_by`,
      )) || [];
    const there = new Set(rows.map((r) => r.person_id));
    const gremlys = rows.filter((r) => r.written_by === 'gremly').map((r) => r.person_id);
    const add = cp.people.filter((id) => !there.has(id));
    const gone = gremlys.filter((id) => !cp.people.includes(id));
    if (add.length) {
      await d.insertIgnore(
        'chapter_people',
        add.map((id) => ({ chapter_id: cp.chapter_id, person_id: id, user_id: userId, written_by: 'gremly', created_at: nowIso })),
        'chapter_id,person_id',
      );
      added += add.length;
    }
    if (gone.length) {
      await d.remove(
        `chapter_people?user_id=eq.${userId}&chapter_id=eq.${cp.chapter_id}&written_by=eq.gremly&person_id=in.(${gone.join(',')})`,
      );
      removed += gone.length;
    }
  }
  return { added, removed };
}

// ── Batch orchestration helpers ────────────────────────────────────────────

export async function submitWeeklyBatch(env, items) {
  // items: [{ custom_id, params }]
  return createBatch(
    env,
    items.map((i) => ({ custom_id: i.custom_id, params: i.params })),
  );
}

export async function readWeeklyBatch(env, batchId, { jobByCustomId = {} } = {}) {
  const status = await getBatch(env, batchId);
  if (status.processing_status !== 'ended')
    return { done: false, status: status.processing_status };
  const results = await getBatchResults(env, batchId);
  const out = {};
  for (const r of results) {
    if (r.result?.type === 'succeeded') {
      const meta = jobByCustomId[r.custom_id] || {};
      await writeUsageRow(
        env,
        batchUsageRow(r.result.message, {
          job: meta.job || 'weekly-synthesis',
          userId: meta.userId,
          runId: meta.runId,
        }),
      ).catch(() => {});
      try {
        out[r.custom_id] = { ok: true, output: anthropicJsonResult(r.result.message) };
      } catch (err) {
        out[r.custom_id] = { ok: false, error: err.message };
      }
    } else {
      out[r.custom_id] = { ok: false, error: r.result?.type || 'unknown' };
    }
  }
  return { done: true, results: out };
}
