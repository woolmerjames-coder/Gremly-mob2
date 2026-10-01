/**
 * The morning brief writer (Daily brief in Chat).
 *
 * The model writes Gremly's words; everything it may mention is given to it by
 * ref, and every line says which refs it mentions. It phrases the DCO's
 * decisions (claims, reach, question, return) for the moment the brief is
 * read, and words the offer the code chose. It never chooses its own.
 *
 * Prompt policy: semantic rules only, no examples, no word lists.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { jsonCall, modelFor } from '../context/llm';

export const BRIEF_PROMPT_VERSION = 'brief-2026-10-01c';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** A time as people say it in chat: "8am", "8:30am", "12pm", "10:15pm". */
export function clockTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

/** The start of a clear stretch: "now" when it has already begun. */
function fromTime(from, now) {
  return from <= now ? 'now' : clockTime(from);
}

function weekdayLabel(dateStr) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${dateStr}T12:00:00Z`),
  );
}

/** The writer's input text and the refs it may cite. Exported for the corpus. */
export function renderBriefInput(g, offer) {
  const refs = new Map();
  const add = (prefix, obj) => {
    const n = [...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1;
    const ref = `${prefix}${n}`;
    refs.set(ref, obj);
    return ref;
  };
  const L = [];
  L.push(
    `TODAY: ${weekdayLabel(g.today)} ${g.today}. TIME NOW: ${clockTime(g.now)}, the ${g.part}.`,
  );
  L.push(
    g.ret
      ? `RETURNING AFTER TIME AWAY: yes, ${g.ret.days_away} days away from the app before today. The DCO's welcome: "${trim(g.ret.note, 200)}"`
      : 'RETURNING AFTER TIME AWAY: no.',
  );
  L.push('');
  const meetingLines = g.meetings.map((m) => {
    const ref = add('c', { type: 'calendar', id: m.id });
    const state =
      m.end <= g.now ? 'already over' : m.start <= g.now ? 'happening now' : 'still ahead';
    return `${ref} | ${clockTime(m.start)} to ${clockTime(m.end)} | ${state} | ${trim(m.title, 100)}`;
  });
  const allDayLines = g.allDay.map(
    (e) => `${add('c', { type: 'calendar', id: e.id })} | all day | ${trim(e.title, 100)}`,
  );
  L.push(
    `TODAY'S CALENDAR (ref | when | state | title):\n${[...meetingLines, ...allDayLines].join('\n') || '(nothing on the calendar)'}`,
  );
  const refOf = (id) => [...refs.entries()].find(([, v]) => v.id === id)?.[0];
  L.push(
    `CLASHES STILL AHEAD: ${
      clashesAhead(g)
        .map(([a, b]) => `${refOf(a.id)} overlaps ${refOf(b.id)}`)
        .join('; ') || 'none'
    }.`,
  );
  const ahead = g.busy.filter((b) => b.to > g.now);
  L.push(
    `SHAPE OF THE REST OF TODAY, WORKED OUT IN CODE: busy ${ahead.map((b) => `${fromTime(b.from, g.now)} to ${clockTime(b.to)}`).join(', ') || 'nothing'}; clear stretches ${
      g.free
        .filter((f) => f.to - Math.max(f.from, g.now) >= 45)
        .map((f) => `${fromTime(f.from, g.now)} to ${clockTime(f.to)}`)
        .join(', ') || 'none'
    } (the day is counted from 8am to 10pm).`,
  );
  if (g.dayShape) L.push(`THE DCO'S READ OF THE DAY: ${trim(g.dayShape, 240)}`);
  L.push('');
  L.push(
    `DUE TODAY (ref | title):\n${g.todosDue.map((t) => `${add('t', { type: 'todo', id: t.id })} | ${trim(t.title, 100)}`).join('\n') || '(none)'}`,
  );
  L.push(
    `HABITS FOR TODAY (ref | habit | this week):\n${
      g.habitsForToday
        .map((h) => {
          const ref = add('h', { type: 'habit', id: h.id });
          const week = h.target
            ? `${h.done} of ${h.target} this week${h.behind ? ', behind for the week' : ''}`
            : 'daily';
          return `${ref} | ${trim(h.title, 80)} | ${week}`;
        })
        .join('\n') || '(none)'
    }`,
  );
  L.push(
    `THE DCO'S CLAIMS ON TODAY (what has a real claim and why): ${g.claims.map((c) => `${trim(c.title, 80)}: ${trim(c.why, 120)}`).join('; ') || 'none'}`,
  );
  if (g.reach) {
    const ref = add('r', { type: g.reach.type, id: g.reach.id });
    L.push(
      `THE DCO'S REACH (one undated thing worth suggesting today, and the reason): ${ref} | ${trim(g.reach.title || g.reach.statement, 120)} | why: ${trim(g.reach.why, 200)} | from what they said: ${(g.reach.facts || []).map((f) => `"${trim(f.statement, 160)}"`).join('; ')}`,
    );
  }
  const anchorLines = (g.anchors || [])
    .filter((a) => a.date >= g.today)
    .map((a) => `${a.date} | ${trim(a.short_label || a.label, 120)}`);
  L.push(`DATED THINGS AHEAD (shown on the day card already): ${anchorLines.join('; ') || 'none'}`);
  L.push('');
  L.push(`WAITING IN SWEEP: ${g.overdue} past their dates, ${g.unsorted} unsorted drops.`);
  if (g.reaction) L.push(g.reaction);
  L.push('');
  L.push(`THE OFFER, DECIDED IN CODE: ${offerBrief(offer, g)}`);
  if (g.question && !g.ret) {
    L.push(
      `THE QUESTION TO ASK: "${trim(g.question.question, 240)}"${g.question.choices?.length ? ` with the answers ${g.question.choices.map((c) => `"${c}"`).join(', ')}` : ', which has no answers to tap yet'}`,
    );
  }
  return { text: L.join('\n'), refs };
}

/** Clashes between meetings that are not over yet. */
export function clashesAhead(g) {
  return (g.clashes || []).filter(([a, b]) => a.end > g.now && b.end > g.now);
}

function offerBrief(offer, g) {
  switch (offer.kind) {
    case 'return':
      return `return day. Things piled up while they were away (${g.overdue} past their dates, ${g.unsorted} unsorted). Sweep is offered first, beside "Catch me up" and "Just today".`;
    case 'sweep':
      return `a messy backlog (${g.overdue} past their dates, ${g.unsorted} unsorted). Sweep is offered first; planning comes after, around what they keep.`;
    case 'plan':
      return `planning. "${offer.buttons[0].label}" is offered, to fit a few things into the clear stretch from ${fromTime(offer.plan.gapFrom, g.now)}${g.reach ? ', with the reach item added' : ''}.`;
    default:
      return 'none. Nothing to offer today; Gremly signs off.';
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'refs'],
      },
    },
    offer: { type: 'string' },
    offer_refs: { type: 'array', items: { type: 'string' } },
    question_line: { type: 'string', nullable: true },
    question_choices: { type: 'array', items: { type: 'string' } },
    catch_up: { type: 'string', nullable: true },
  },
  required: ['lines', 'offer', 'offer_refs', 'question_line', 'question_choices', 'catch_up'],
};

function systemPrompt(person) {
  return {
    fixed: `You are Gremly, a warm, shame-free companion, writing the start of someone's day as a few short chat messages. They read it in the app's chat, under a day card that already shows today's meetings, todos, habits, what waits in Sweep and any date coming up. Your words sit around that card; they do not repeat it as a list.

${CARE_RULES}

WHAT YOU WRITE
- lines: two or three short chat messages, each its own entry in lines and each one or two sentences, read in the part of the day given in TIME NOW. They give one read of the day: what shapes it, the one or two things that matter, and when it is clear. A meeting that is already over is never described as coming up; at noon or later, write about the rest of the day. When nothing is left today, one line is enough.
- Every meeting, todo, habit or reach item a line names is cited in that line's refs, by the refs given in the input. Refs go only in the refs fields, never in the text. Name nothing that is not in the input. Times come from the input as given; never work out or add up times or counts yourself.
- Talk about todos and habits the way a person would say them in conversation, rather than pasting a title in as the subject of a sentence.
- Mention a clash only when the input lists one still ahead.
- The day is counted to 10pm only so planning has an end; never say the day runs until 10pm or mention that end.
- The DCO has already decided what matters (its claims), the one undated thing worth suggesting (its reach), the question and the welcome. Phrase those decisions; never choose different ones. Mention the reach only with the reason given for it.
- The dated things ahead are on the day card. Mention one only when today genuinely needs it, never to fill a line.
- On a return day: the first line says once, warmly, that it is good to see them and that time away is fine, then the lines talk about today. Never count, list or hint at what was missed, never guess why they were away, never mention streaks. The counts of what is waiting belong only in catch_up, never in the lines or the offer.
- offer: one or two sentences that end the brief, wording the offer decided in code. The buttons appear under it, so do not name them. Planning is offered as an invitation, never an instruction. Sweep is suggested, never pushed; on a return day say plainly that a sweep would help and that it is fine to skip it. With no offer, the offer is a warm one-sentence sign-off, and the lines do not sign off themselves. Cite in offer_refs anything the offer names.
- question_line: when the input gives a question to ask, ask it in your own words as a short chat message, keeping its meaning exactly. Otherwise empty.
- question_choices: required whenever the question has no answers to tap yet: two to four short answers that cover what the person would most likely say, each a few words. Otherwise empty.
- catch_up: on a return day only, one or two kind sentences saying what is waiting, using the counts in WAITING IN SWEEP as given, and that nothing has been lost. It is shown only if they ask. Otherwise empty.

VOICE
Warm, plain and brief, like a friend who knows their day. Suggest, never instruct. Never use the word should, never shame or pressure, never tell them how they feel.

${PRIVATE_RULES}

${WRITING_RULES}`,
    varying: personBlock(person),
  };
}

/** Lines whose refs are all in the input; any other line is dropped and reported. */
export function checkRefs(output, refs) {
  const dropped = [];
  const lines = [];
  for (const l of output.lines || []) {
    const text = trim(l?.text, 400);
    if (!text) continue;
    const bad = (l.refs || []).filter((r) => !refs.has(r));
    if (bad.length) {
      dropped.push({ text, bad });
      continue;
    }
    lines.push({ text: stripRefs(text), ids: (l.refs || []).map((r) => refs.get(r).id) });
  }
  const offerBad = (output.offer_refs || []).filter((r) => !refs.has(r));
  return { lines, dropped, offerOk: offerBad.length === 0, offerBad };
}

// A ref the model wrote into the text by mistake, such as "[c1, c2]" or "(t1)"
const REFS_IN_TEXT = /\s*[[(]\s*[cthrp]\d+(?:\s*,\s*[cthrp]\d+)*\s*[\])]/g;
export function stripRefs(s) {
  return s ? String(s).replace(REFS_IN_TEXT, '').trim() : s;
}

const DASHES = /[–—]|--/g;
export function noDashes(s) {
  return s
    ? String(s)
        .replace(/\s*[–—]\s*|\s*--\s*/g, ', ')
        .replace(DASHES, ', ')
    : s;
}

export async function writeBrief(env, g, offer) {
  const { text, refs } = renderBriefInput(g, offer);
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'brief'),
    fallback: modelFor(env, 'briefFallback'),
    system: systemPrompt(g.person),
    user: text,
    schema: SCHEMA,
    maxTokens: 3000,
    thinking: 'low',
    effort: 'low',
  });
  const checked = checkRefs(output, refs);
  const offerText = checked.offerOk ? noDashes(stripRefs(trim(output.offer, 400))) : null;
  return {
    model,
    input: text,
    lines: checked.lines.map((l) => ({ ...l, text: noDashes(l.text) })),
    dropped: checked.dropped,
    offer: offerText,
    offerDropped: checked.offerOk ? null : { text: output.offer, bad: checked.offerBad },
    questionLine:
      g.question && !g.ret
        ? noDashes(stripRefs(trim(output.question_line, 300))) || g.question.question
        : null,
    questionChoices: (output.question_choices || []).map((c) => trim(c, 40)).filter(Boolean),
    catchUp: g.ret ? noDashes(stripRefs(trim(output.catch_up, 400))) || null : null,
  };
}
