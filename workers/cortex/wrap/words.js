// ============================================================================
// wrap/words.js: Gremly's own words in the evening wrap up (step 10 of the
// agent plan, docs/agent/SWEEP_STEP10.md rows 1, 2, 3, 5 and 10).
//
// The wrap up (lib/wrapup) runs by rule in today's thread: the cards, habits,
// the journal, Gremly's questions and the close. At these moments the app
// asks for Gremly's words instead of a fixed sentence:
//   open           his first words, looking back on the day
//   journal_ask    the journal question, about the actual day
//   journal_reply  his reply to what they wrote, and whether it was a journal
//                  entry at all or something they were asking him
//   close          the close, with tomorrow's shape
//   questions      which of his open questions to ask tonight, with choices
// Each is one short call, written from the day as the app holds it (sent with
// the request) and what Gremly knows about the day (its picture of today, the
// person). When a call fails the app says its fixed sentence, so the evening
// never waits on a model.
//
// Prompt policy: semantic rules only, no examples, no word lists, no dashes.
// ============================================================================

import {
  CARE_RULES,
  CHAT_WRITING_RULES,
  PRIVATE_RULES,
  personBlock,
} from '../../inngest-jobs/careRules.js';
import { db, personIdentity } from '../../shared/db.js';
import { helperFetch } from '../helperClient.js';
import { dayMeaning } from '../agent/brief.js';

export const WRAP_WORDS_VERSION = 'wrap-2026-10-05b';

export const MOMENTS = ['open', 'journal_ask', 'journal_reply', 'close', 'questions'];

/** The moods a journal entry can carry: the app's own (lib/shared/moods.ts ALL_MOODS). Keep in step. */
export const MOODS = [
  'great',
  'good',
  'okay',
  'low',
  'tired',
  'anxious',
  'overwhelmed',
  'frustrated',
  'scattered',
  'grateful',
  'hopeful',
  'focused',
  'calm',
];

const VOICE = `VOICE
Warm and brief, like a friend who knows their day and is glad to sit with them at the end of it. See the day in the light of what it was about for them, and be openly glad with them for what went well, in your own words. Gremly has a playful spark; let it show when the moment allows. Nothing in a day is a score: what did not happen is part of the day, never a failure, and never something to make them feel behind. Plain chat text, with no headings, lists, bold, quotation marks or emoji. Only what is below is known: never invent an item, a time, a day, a person, a feeling or a fact.`;

/** Gremly in the wrap up: who he is, the care rules, his voice and the person. */
export function wrapPersona(person) {
  return [
    "You are Gremly, a warm, shame-free companion, writing in the person's thread for today as they wrap up their day.",
    CARE_RULES,
    VOICE,
    PRIVATE_RULES,
    CHAT_WRITING_RULES,
    personBlock(person),
  ].join('\n\n');
}

const list = (xs) => (xs || []).filter(Boolean).join('; ');

/** When it is, in words: the day is not over before the evening, and after midnight it is still their day. */
export function timeWords(f) {
  const day = `${f.weekday || 'their day'}`;
  if (f.part === 'early') {
    return `It is ${f.clock || 'during the day'} on ${day}, and their day is not over yet: this is a look back at the day so far, so nothing you write may speak of tonight, night or sleep.`;
  }
  if (f.part === 'late') {
    return `It is ${f.clock || 'after midnight'} by the clock, but for them it is still ${day} until their day ends${f.day_end ? ` at ${f.day_end}` : ''}. Their next day is ${f.tomorrow_word || 'the day after'}; call it by that name, since tomorrow would be read as the day after it.`;
  }
  return `It is ${f.clock || 'the evening'} on ${day}, in the evening of their day.`;
}

/** The day as the app holds it, one fact per line, for every moment. */
export function dayFacts(f) {
  const L = [];
  const r = f.recap || {};
  const done = (r.done || []).filter((d) => d.kind === 'todo').map((d) => d.title);
  const habits = (r.done || []).filter((d) => d.kind === 'habit').map((d) => d.title);
  if (done.length) L.push(`Todos they finished today: ${list(done)}.`);
  else L.push('No todos were finished today.');
  if (habits.length) L.push(`Habits they logged today: ${list(habits)}.`);
  if (r.planned?.total) {
    L.push(
      `Their plan for today had ${r.planned.total} ${r.planned.total === 1 ? 'thing' : 'things'}, and ${r.planned.done} got done.`,
    );
  }
  if ((r.missed || []).length) {
    L.push(`Planned for today and not done: ${list(r.missed.map((m) => m.title))}.`);
  }
  if ((f.meetings || []).length) L.push(`On their calendar today: ${list(f.meetings)}.`);
  else L.push('Nothing was on their calendar today.');
  if (f.travel) L.push(`Travel today: ${f.travel}.`);
  if (r.counts?.drops) {
    L.push(
      `They dropped ${r.counts.drops} new ${r.counts.drops === 1 ? 'thing' : 'things'} into Gremly today.`,
    );
  }
  return L;
}

/** What has happened in the wrap up so far tonight. */
export function tonightFacts(f) {
  const t = f.tonight || {};
  const L = [];
  const decided = t.decisions || [];
  if (decided.length) {
    L.push(
      `Sorted in the cards tonight: ${list(decided.map((d) => `${d.title} (${d.outcome})`))}.`,
    );
  }
  if (t.path === 'skip')
    L.push('They moved everything waiting on to their next day instead of sorting it.');
  if ((t.logged || []).length) L.push(`Habits checked in during the wrap up: ${list(t.logged)}.`);
  if ((t.held || []).length) L.push(`Habits they are breaking that held today: ${list(t.held)}.`);
  if ((t.not_held || []).length) {
    L.push(`Habits they are breaking that did not hold today: ${list(t.not_held)}.`);
  }
  if (t.journal === 'written') L.push('They wrote in their journal tonight.');
  if (t.journal === 'mood') L.push('They picked moods for their journal tonight.');
  return L;
}

/** Their next day, for the close. */
export function tomorrowFacts(f) {
  const n = f.next || {};
  const L = [];
  const name = f.tomorrow_word || 'tomorrow';
  if ((n.meetings || []).length) L.push(`On their calendar ${name}: ${list(n.meetings)}.`);
  else L.push(`Nothing is on their calendar ${name}.`);
  if ((n.lined || []).length) L.push(`Todos lined up for ${name}: ${list(n.lined)}.`);
  else L.push(`No todos are lined up for ${name} yet.`);
  return L;
}

const JOBS = {
  open: (f) => `YOUR WORDS NOW
They have just started wrapping up their day in today's thread, the same thread the morning brief opened. Write Gremly's first words: look back on the day with them as a friend who knows what it was about. Pick the one or two things that mattered most to them, named the way they would name them, and leave the rest: never walk through their calendar or their list. A card under your words shows the day in numbers, so do not recite counts.
${
  f.cards > 0
    ? 'After your words Gremly offers the cards, which hold only the things still waiting for a decision. When something they planned for today did not happen and the day has room for it, you may touch on it once, lightly, as something to settle in a moment; otherwise leave it out. Ask nothing and say nothing about what comes next.'
    : 'Nothing is waiting to be sorted, so after looking back, say in your own words that this one will be short. Ask nothing.'
}
One or two short sentences, under 40 words in all.`,

  journal_ask: (f) => `YOUR WORDS NOW
Ask them about their day for their journal: one short, open question, under 18 words, about how ${f.part === 'early' ? 'the day so far has felt' : 'the day felt'} or what it meant to them, not about their tasks. Write only the question, in one sentence; one thing from the day may be part of it when it matters to them. It should invite a few honest lines, not a yes or a no.`,

  journal_reply: () => `YOUR WORDS NOW
They were asked about their day for their journal and wrote what is under THEIR ENTRY. First decide whether it is a journal entry: words about their day, how they feel, or their life, however short. It is not a journal entry when it is addressed to Gremly, asking him a question or asking him to do something.
When it is a journal entry, reply as a friend who has just read it: one or two short sentences, under 35 words, that take in what they actually said, glad with them about what was good and gentle about what was hard, and let them know it is saved in their journal. Ask nothing and offer nothing.
When it is a journal entry, also choose the moods it carries: the one or two that their words show, read in the light of their day as you know it, from these only: ${MOODS.join(', ')}. Choose none when their words show no feeling.
Return only JSON: {"journal": true or false, "reply": "your words, or an empty string when it is not a journal entry", "moods": [the moods, or none]}.`,

  close: (f) => `YOUR WORDS NOW
The wrap up is finished. Write the close: say their ${f.weekday || 'day'} is wrapped up, and give them the shape of ${f.tomorrow_word || 'tomorrow'} from what is known under THEIR NEXT DAY, naming the one or two things that matter most in it rather than the list; when nothing is known about it, say it is open. One or two short sentences, under 40 words in all. Say no goodbye${f.part === 'early' ? '' : ' or goodnight'} and ask nothing: Gremly's goodbye comes when they tap.`,

  questions: () => `YOUR CHOICE NOW
Gremly has open questions he has been waiting to ask them, under OPEN QUESTIONS, each with its id and, when it is about one of their items, that item. Choose at most two to ask now. Ask a question only when its answer would change something for them or let Gremly get something right about their life, and prefer what is coming up soon. Leave out any question about something they sorted in the cards tonight, since what they did with it already answers it or makes it moot. Choosing none is right when none fits.
For each one you choose, give the question in Gremly's words, short and plain, keeping what it asks; and two to four short answers they could tap, the likely answers in their own terms, or no answers when none would fit in a few words.
Return only JSON: {"ask": [{"id": "the question's id", "question": "the question in Gremly's words", "choices": ["short answer"]}]}, in the order to ask them.`,
};

/**
 * Everything one moment's call is told.
 * @param {object} f the app's facts for the moment (see the handler in cortex-index.js)
 * @param {object} p { person, dco }
 * @returns {{system: string, user: string, json: boolean}}
 */
export function wrapPrompt(f, { person = null, dco = null } = {}) {
  const moment = MOMENTS.includes(f.moment) ? f.moment : 'open';
  const meaning = dayMeaning(dco);
  const parts = [timeWords(f)];
  if (meaning) parts.push(meaning);
  parts.push(`THEIR DAY AS THE APP HOLDS IT\n${dayFacts(f).join('\n')}`);
  if (moment === 'open' && f.cards > 0) {
    parts.push(
      `Waiting to be sorted in the cards: ${f.cards} ${f.cards === 1 ? 'thing' : 'things'}.`,
    );
  }
  const tonight = tonightFacts(f);
  if (tonight.length && moment !== 'open') parts.push(`THE WRAP UP SO FAR\n${tonight.join('\n')}`);
  if (moment === 'close') parts.push(`THEIR NEXT DAY\n${tomorrowFacts(f).join('\n')}`);
  if (moment === 'journal_reply')
    parts.push(`THEIR ENTRY\n${String(f.entry || '').slice(0, 4000)}`);
  if (moment === 'questions') {
    const qs = (f.questions || []).slice(0, 12).map((q) => {
      const about = q.about
        ? ` (about their ${q.about.kind} ${q.about.title}${q.about.when ? `, ${q.about.when}` : ''})`
        : '';
      return `- id ${q.id}: ${q.question}${about}`;
    });
    parts.push(`OPEN QUESTIONS\n${qs.join('\n') || '(none)'}`);
  }
  return {
    system: `${wrapPersona(person)}\n\n${JOBS[moment](f)}`,
    user: parts.join('\n\n'),
    json: moment === 'journal_reply' || moment === 'questions',
  };
}

/** The words as the app shows them: one line, without wrapping quotes. */
function line(text) {
  return String(text || '')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

/**
 * What the app is given back for a moment, from the model's text. Null when
 * there is nothing usable, so the app says its fixed sentence.
 */
export function readWrapWords(moment, text, f = {}) {
  if (moment === 'journal_reply' || moment === 'questions') {
    let data;
    try {
      data = JSON.parse(String(text || '').trim());
    } catch {
      return null;
    }
    if (moment === 'journal_reply') {
      if (data?.journal === false) return { journal: false, reply: '' };
      const reply = line(data?.reply);
      // only the app's own moods, once each, two at most
      const moods = [
        ...new Set(
          (Array.isArray(data?.moods) ? data.moods : []).map((m) =>
            String(m || '')
              .trim()
              .toLowerCase(),
          ),
        ),
      ]
        .filter((m) => MOODS.includes(m))
        .slice(0, 2);
      return reply ? { journal: true, reply, moods } : null;
    }
    const known = new Map((f.questions || []).map((q) => [String(q.id), q]));
    const ask = (Array.isArray(data?.ask) ? data.ask : [])
      .filter((q) => known.has(String(q?.id)))
      .slice(0, 2)
      .map((q) => ({
        id: String(q.id),
        question: line(q.question) || known.get(String(q.id)).question,
        choices: (Array.isArray(q.choices) ? q.choices : [])
          .map((c) => line(c))
          .filter((c) => c && c.length <= 40)
          .slice(0, 4),
      }));
    return { ask };
  }
  const words = line(text);
  return words ? { line: words } : null;
}

/** Gremly's picture of the day (the DCO the brief is written from), when there is one. Never throws. */
async function readDayPicture(env, userId, day) {
  if (!day) return null;
  try {
    const rows = await db(env).select(
      `user_daily_state?user_id=eq.${userId}&date=eq.${day}&select=dco&limit=1`,
    );
    return rows?.[0]?.dco || null;
  } catch {
    return null;
  }
}

/** The app's facts as this file reads them, trimmed to sizes a prompt can carry. */
export function factsFrom(body = {}) {
  const str = (v, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const strs = (v, most, n = 120) =>
    (Array.isArray(v) ? v : [])
      .map((x) => str(x, n))
      .filter(Boolean)
      .slice(0, most);
  const titled = (v, most) =>
    (Array.isArray(v) ? v : [])
      .map((x) => ({ ...x, title: str(x?.title) }))
      .filter((x) => x.title)
      .slice(0, most);
  const r = body.recap || {};
  const t = body.tonight || {};
  const n = body.next || {};
  return {
    moment: MOMENTS.includes(body.moment) ? body.moment : 'open',
    day: /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null,
    weekday: str(body.weekday, 12),
    part: ['early', 'evening', 'late'].includes(body.part) ? body.part : 'evening',
    clock: str(body.clock, 12),
    day_end: str(body.day_end, 12),
    tomorrow_word: str(body.tomorrow_word, 12) || 'tomorrow',
    recap: {
      counts: r.counts && typeof r.counts === 'object' ? r.counts : {},
      done: titled(r.done, 12),
      missed: titled(r.missed, 8),
      planned:
        r.planned && Number.isFinite(r.planned.total)
          ? { done: Number(r.planned.done) || 0, total: Number(r.planned.total) }
          : null,
    },
    meetings: strs(body.meetings, 12),
    travel: str(body.travel, 160),
    cards: Math.max(0, Number(body.cards) || 0),
    tonight: {
      decisions: titled(t.decisions, 20).map((d) => ({
        title: d.title,
        outcome: str(d.outcome, 40),
      })),
      logged: strs(t.logged, 12),
      held: strs(t.held, 12),
      not_held: strs(t.not_held, 12),
      journal: ['written', 'mood', 'skipped'].includes(t.journal) ? t.journal : null,
      path: ['cards', 'skip', 'clear'].includes(t.path) ? t.path : null,
    },
    next: { meetings: strs(n.meetings, 10), lined: strs(n.lined, 10) },
    entry: str(body.entry, 4000),
    questions: (Array.isArray(body.questions) ? body.questions : [])
      .filter((q) => q && q.id && q.question)
      .slice(0, 12)
      .map((q) => ({
        id: String(q.id),
        question: str(q.question, 300),
        ...(q.about?.title
          ? {
              about: {
                kind: str(q.about.kind, 10),
                title: str(q.about.title),
                when: str(q.about.when, 30),
              },
            }
          : {}),
      })),
  };
}

/**
 * One moment's words for the app (type wrap-words). Null when the model gave
 * nothing usable; the app then says its fixed sentence.
 */
export async function writeWrapWords({ env, userId, body, deps = {} }) {
  const f = factsFrom(body);
  const [person, dco] = await Promise.all([
    deps.person || personIdentity(env, userId),
    deps.dco !== undefined ? deps.dco : readDayPicture(env, userId, f.day),
  ]);
  const p = wrapPrompt(f, { person, dco });
  const res = await helperFetch('wrap_words', {
    messages: [
      { role: 'system', content: p.system },
      { role: 'user', content: p.user },
    ],
    max_tokens: p.json ? 300 : 160,
    temperature: 0.7,
    ...(p.json ? { response_format: { type: 'json_object' } } : {}),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return readWrapWords(f.moment, data.choices?.[0]?.message?.content || '', f);
}
