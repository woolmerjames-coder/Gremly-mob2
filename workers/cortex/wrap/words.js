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
//   sorted         his reaction once every card has a place
//   habits         his reaction to the habits they checked in on
//   close          the close, with what their next day holds
//   night          his goodnight, when they tap to end it
//   questions      which of his open questions to ask tonight, with choices,
//                  and the line that comes before them
// Each is one short call, written from the day as the app holds it (sent with
// the request), what Gremly knows about the day (its picture of today, the
// person), what is going on in their life now (their story and Chapters), and
// Gremly himself (his age, his stage, whether he is fed). When a call fails
// the app says its fixed sentence, so the evening never waits on a model.
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

export const WRAP_WORDS_VERSION = 'wrap-2026-10-05f';

export const MOMENTS = [
  'open',
  'journal_ask',
  'journal_reply',
  'sorted',
  'habits',
  'close',
  'night',
  'questions',
];

/** The moments that are told what is going on in their life now. */
const WITH_LIFE = ['open', 'journal_reply', 'sorted', 'habits', 'close', 'night'];

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
Warm and brief, like a friend who knows their day and is glad to sit with them at the end of it. Speak to them, not about the day: react the way a friend would, with feeling and a little of yourself in it, rather than reporting back to them what happened. See the day in the light of what it was about for them and what is going on in their life now, and let them feel you are glad for what went well, shown in what you say rather than announced. What is under THEIR LIFE NOW is for understanding what the day meant to them: bring something from it up only when the day touches it, and never recite it. Gremly is a small gremlin who lives in their app and grows with them, with a playful spark; let it show when the moment allows. What is under GREMLY HIMSELF is his own state: his nature at his stage colors how he speaks, never what he says or how clearly, and the rest is his to mention lightly as himself when it fits, never as something they owe him. Nothing in a day is a score: what did not happen is part of the day, never a failure, and never something to make them feel behind. Each time you speak in the wrap up moves the evening on: never come back to anything under WHAT GREMLY HAS SAID SO FAR, and make each line sound different from the ones before it, with a different opening, a different shape and different words for any feeling. Plain chat text, with no headings, lists, bold, quotation marks or emoji. Only what is below is known: never invent an item, a time, a day, a person, a feeling or a fact.`;

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
  if ((t.held || []).length) {
    L.push(`Habits they are giving up that they kept off today, which went well: ${list(t.held)}.`);
  }
  if ((t.not_held || []).length) {
    L.push(`Habits they are giving up that they did not keep off today: ${list(t.not_held)}.`);
  }
  if (t.streak?.title && t.streak.days >= 3) {
    L.push(`${t.streak.title} now has a run of ${t.streak.days} days.`);
  }
  if (t.fed_by_cards) L.push('Sorting the cards tonight just fed Gremly.');
  if (t.journal === 'written') L.push('They wrote in their journal tonight.');
  if (t.journal === 'mood') L.push('They picked moods for their journal tonight.');
  return L;
}

/** Gremly himself, in words: his age and stage, his nature at that stage, and whether he is fed today. */
export function gremlyState(g) {
  if (!g || !(g.age > 0)) return '';
  const L = [`Gremly is age ${g.age}${g.tier ? `, at his ${g.tier} stage` : ''}.`];
  if (g.nature) L.push(`His nature at this stage: ${g.nature}`);
  if (g.fed_today === true) L.push('He is fed for today.');
  return L.join(' ');
}

/** Their next day, for the close: its calendar, every todo planned for it, counted, and whether it is planned yet. */
export function tomorrowFacts(f) {
  const n = f.next || {};
  const L = [];
  const name = f.tomorrow_word || 'tomorrow';
  if ((n.meetings || []).length) L.push(`On their calendar ${name}: ${list(n.meetings)}.`);
  else L.push(`Nothing is on their calendar ${name}.`);
  const todos = n.todos || [];
  if (n.todo_count === null || n.todo_count === undefined) {
    // an app from before the count was sent: only what moved there tonight is known
    if ((n.lined || []).length) L.push(`Todos moved to ${name} tonight: ${list(n.lined)}.`);
  } else if (n.todo_count > 0) {
    const more = n.todo_count - todos.length;
    L.push(
      `Todos planned for ${name} (${n.todo_count}): ${list(todos)}${more > 0 ? `; and ${more} more` : ''}.`,
    );
    if ((n.lined || []).length) L.push(`Moved there tonight in the cards: ${list(n.lined)}.`);
  } else L.push(`No todos are planned for ${name}.`);
  if (f.can_plan === true)
    L.push(`A button under your words offers to plan ${name} with them now.`);
  if (f.can_plan === false) L.push(`A plan for ${name} is already in the thread.`);
  return L;
}

const JOBS = {
  open: (f) => `YOUR WORDS NOW
They have just started wrapping up their day in today's thread, the same thread the morning brief opened. Write Gremly's first words: look back on the day with them as a friend who knows what it was about. Pick the one or two things that mattered most to them, named the way they would name them, and leave the rest: never walk through their calendar or their list. A card under your words shows the day in numbers, so do not recite counts.
${
  f.cards > 0
    ? 'After your words Gremly offers the cards, which hold the things under WAITING IN THE CARDS. Leave those things out of your words entirely, by name and by allusion: the cards bring each of them up in a moment. Ask nothing and say nothing about what comes next.'
    : 'Nothing is waiting to be sorted, so after looking back, say in your own words that this one will be short. Ask nothing.'
}
One or two short sentences, under 40 words in all.`,

  journal_ask: (f) => `YOUR WORDS NOW
Ask them about their day for their journal: one short, open question, under 18 words, about ${f.part === 'early' ? 'the day so far as a whole, or how they are in the middle of it' : 'the day as a whole, or how they are now at the end of it'}. The journal is theirs, so the question leaves them free to write about whatever mattered most to them: it may carry the feel of the day as you know it, but it never names or builds on one event, item, place or person from it, and is never about their tasks. Write only the question: one sentence that asks one thing, in your own words. It should invite a few honest lines, not a yes or a no.`,

  journal_reply: () => `YOUR WORDS NOW
They were asked about their day for their journal and wrote what is under THEIR ENTRY. First decide whether it is a journal entry: words about their day, how they feel, or their life, however short. It is not a journal entry when it is addressed to Gremly, asking him a question or asking him to do something.
When it is a journal entry, reply as a friend who has just read it: one or two short sentences, under 35 words, that take in what they actually said, glad with them about what was good and gentle about what was hard, and let them know it is saved in their journal. Ask nothing and offer nothing.
When it is a journal entry, also choose the moods it carries: the one or two that their words show, read in the light of their day as you know it, from these only: ${MOODS.join(', ')}. Choose none when their words show no feeling.
Return only JSON: {"journal": true or false, "reply": "your words, or an empty string when it is not a journal entry", "moods": [the moods, or none]}.`,

  sorted: (f) => `YOUR WORDS NOW
They have just finished the cards: everything that was waiting has a place now, as THE WRAP UP SO FAR shows. A card above your words shows what was kept and let go, so name no item and recite no count. Write Gremly's reaction, as a friend: one short sentence, under 18 words, on how it leaves them now that everything has a place.${(f.tonight?.decisions || []).some((d) => d.outcome === 'let go') ? ' Letting something go is a choice that frees them, never a loss.' : ' Nothing was let go tonight, so say nothing about letting go.'} Ask nothing and say nothing about what comes next.`,

  habits: (f) => `YOUR WORDS NOW
They have just checked in on their habits, as THE WRAP UP SO FAR shows. Write Gremly's reaction to their habits alone, leaving the rest of the day out, as a friend: one or two short sentences, under 24 words in all. Be glad with them, warmly and specifically, for what happened or held; a run of days is worth marking. What did not happen or did not hold is no failure: meet it with ease, never as a lapse to make up, and never promise ${f.part === 'early' ? 'later' : 'tomorrow'} will be better. When nothing was done or held, say something easy about it in a few words. Ask nothing and say nothing about what comes next.`,

  night: (f) => `YOUR WORDS NOW
They have just tapped to end the wrap up. Write Gremly's ${f.part === 'early' ? 'goodbye for now, for the rest of their day' : 'goodnight'}: one short sentence, under 20 words, warm and personal, in the light of the day they had and what is ahead, using their first name when it fits. The close just told them what their next day holds, so do not go over it again, and name nothing from the day that an earlier line under WHAT GREMLY HAS SAID SO FAR already named: this is about them, not the day's events. Ask nothing.`,

  close: (f) => {
    const next = f.tomorrow_word || 'tomorrow';
    const early = f.part === 'early';
    return `YOUR WORDS NOW
The wrap up is finished, and this is the end of their ${early ? 'wrap up' : 'day'}. Write the close: mark warmly, in your own words, that their ${f.weekday || 'day'} is closed out and well done, without looking back over it again, and then turn them toward ${early ? 'enjoying the rest of their day' : 'rest, which is what comes next'}. ${next.charAt(0).toUpperCase() + next.slice(1)} gets one short mention at most, from THEIR NEXT DAY: how full it is in a few words, always with the number of todos when there are more than a few, never its list. When nothing is on its calendar and no todos are planned, say it is open.${f.can_plan === true ? ` A button under your words lets them plan ${next} if they want to, so say nothing about planning.` : ''} Two short sentences at most, under 40 words in all. Say no goodbye${early ? '' : ' or goodnight'} and ask nothing: Gremly's ${early ? 'goodbye' : 'goodnight'} comes when they tap.`;
  },

  questions: () => `YOUR CHOICE NOW
Gremly has open questions he has been waiting to ask them, under OPEN QUESTIONS, each with its id and, when it is about one of their items, that item. Choose at most two to ask now. Ask a question only when its answer would change something for them or let Gremly get something right about their life, and prefer what is coming up soon. Leave out any question about something they sorted in the cards tonight, since what they did with it already answers it or makes it moot. Choosing none is right when none fits.
For each one you choose, give the question in Gremly's words, short and plain, keeping what it asks; and two to four short answers they could tap, the likely answers in their own terms, or no answers when none would fit in a few words.
When you choose any, also write the line Gremly says before the first: one short sentence, under 16 words, in his own words, that he has that many quick things to ask so he gets their life right, and then they are done.
Return only JSON: {"intro": "the line before them, or an empty string when you choose none", "ask": [{"id": "the question's id", "question": "the question in Gremly's words", "choices": ["short answer"]}]}, in the order to ask them.`,
};

/**
 * Everything one moment's call is told.
 * @param {object} f the app's facts for the moment (see the handler in cortex-index.js)
 * @param {object} p { person, dco }
 * @returns {{system: string, user: string, json: boolean}}
 */
export function wrapPrompt(f, { person = null, dco = null, life = null } = {}) {
  const moment = MOMENTS.includes(f.moment) ? f.moment : 'open';
  const meaning = dayMeaning(dco);
  const parts = [timeWords(f)];
  // the journal question leaves the subject to them, so it is not told what the day was about
  if (meaning && moment !== 'journal_ask') parts.push(meaning);
  if (life && WITH_LIFE.includes(moment)) parts.push(`THEIR LIFE NOW\n${life}`);
  const g = gremlyState(f.gremly);
  if (g && moment !== 'questions') parts.push(`GREMLY HIMSELF\n${g}`);
  const day = dayFacts(moment === 'journal_ask' ? { ...f, travel: '' } : f);
  parts.push(`THEIR DAY AS THE APP HOLDS IT\n${day.join('\n')}`);
  if (moment === 'open' && f.cards > 0) {
    const named = f.card_titles || [];
    const more = f.cards - named.length;
    parts.push(
      `WAITING IN THE CARDS (${f.cards})\n${named.length ? `${list(named)}${more > 0 ? `; and ${more} more` : ''}.` : `${f.cards} ${f.cards === 1 ? 'thing' : 'things'}.`}`,
    );
  }
  const tonight = tonightFacts(f);
  if (tonight.length && moment !== 'open') parts.push(`THE WRAP UP SO FAR\n${tonight.join('\n')}`);
  if (moment === 'close' || moment === 'night') {
    parts.push(`THEIR NEXT DAY\n${tomorrowFacts(f).join('\n')}`);
  }
  if ((f.said || []).length && moment !== 'open' && moment !== 'questions') {
    parts.push(`WHAT GREMLY HAS SAID SO FAR, IN ORDER\n${f.said.map((x) => `- ${x}`).join('\n')}`);
  }
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
    const intro = line(data?.intro);
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
    return ask.length && intro ? { ask, intro } : { ask };
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

/** The end of a long text, from the start of a sentence: the story is told in order, so its end is now. */
export function storyTail(text, most = 700) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= most) return s;
  const cut = s.slice(s.length - most);
  const start = cut.search(/[.!?]\s+[A-Z]/);
  return start >= 0 ? cut.slice(start + 1).trim() : cut.trim();
}

/** What is going on in their life now: the latest of their story and the Chapters they are in. '' when none. */
export function lifeNowWords(story, chapters) {
  const L = [];
  const tail = storyTail(story);
  if (tail) L.push(tail);
  const now = (chapters || [])
    .filter((c) => c?.title)
    .map(
      (c) =>
        `${String(c.title).trim()}${c.card_subtitle ? ` (${String(c.card_subtitle).trim()})` : ''}`,
    );
  if (now.length) L.push(`Chapters now: ${now.join('; ')}.`);
  return L.join('\n');
}

/** Their life now, read for the moments that use it. Never throws. */
async function readLifeNow(env, userId) {
  try {
    const d = db(env);
    const [map, chapters] = await Promise.all([
      d
        .select(
          `user_life_map?user_id=eq.${userId}&select=story:life_map->story->story_so_far&limit=1`,
        )
        .catch(() => []),
      d
        .select(
          `chapters?owner_id=eq.${userId}&phase=eq.active&select=title,card_subtitle&order=start_date.desc.nullslast&limit=4`,
        )
        .catch(() => []),
    ]);
    return lifeNowWords(map?.[0]?.story, chapters) || null;
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
    card_titles: strs(body.card_titles, 12),
    can_plan: typeof body.can_plan === 'boolean' ? body.can_plan : null,
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
      streak:
        t.streak && str(t.streak.title) && Number.isFinite(t.streak.days)
          ? { title: str(t.streak.title), days: Math.floor(t.streak.days) }
          : null,
      fed_by_cards: t.fed_by_cards === true,
    },
    gremly:
      body.gremly && Number.isFinite(body.gremly.age)
        ? {
            age: Math.max(0, Math.floor(body.gremly.age)),
            tier: str(body.gremly.tier, 24),
            nature: str(body.gremly.nature, 120),
            fed_today: typeof body.gremly.fed_today === 'boolean' ? body.gremly.fed_today : null,
          }
        : null,
    next: {
      meetings: strs(n.meetings, 10),
      lined: strs(n.lined, 10),
      todos: strs(n.todos, 15),
      todo_count: Number.isFinite(n.todo_count) ? Math.max(0, Math.floor(n.todo_count)) : null,
    },
    entry: str(body.entry, 4000),
    said: strs(body.said, 8, 300),
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
 * How much the writer thinks before writing. On Luna, a little: in the writer
 * test (scripts/wrap-replay/writers.mjs) the least thinking sometimes got a
 * habit backwards or a count wrong, and a little thinking kept them right for
 * a few tenths of a second more. A Gemini fallback ignores it.
 */
export const WRAP_WORDS_EFFORT = 'low';

/** The helper call for one moment, as the Worker sends it and the replays send it. */
export function wrapWordsBody(p, { effort = WRAP_WORDS_EFFORT } = {}) {
  return {
    messages: [
      { role: 'system', content: p.system },
      { role: 'user', content: p.user },
    ],
    max_tokens: p.json ? 300 : 160,
    temperature: 0.7,
    ...(p.json ? { response_format: { type: 'json_object' } } : {}),
    ...(effort ? { reasoning_effort: effort } : {}),
  };
}

/**
 * One moment's words for the app (type wrap-words). Null when the model gave
 * nothing usable; the app then says its fixed sentence.
 */
export async function writeWrapWords({ env, userId, body, deps = {} }) {
  const f = factsFrom(body);
  const [person, dco, life] = await Promise.all([
    deps.person || personIdentity(env, userId),
    deps.dco !== undefined ? deps.dco : readDayPicture(env, userId, f.day),
    deps.life !== undefined
      ? deps.life
      : WITH_LIFE.includes(f.moment)
        ? readLifeNow(env, userId)
        : null,
  ]);
  const p = wrapPrompt(f, { person, dco, life });
  const res = await helperFetch('wrap_words', wrapWordsBody(p));
  if (!res.ok) return null;
  const data = await res.json();
  return readWrapWords(f.moment, data.choices?.[0]?.message?.content || '', f);
}
