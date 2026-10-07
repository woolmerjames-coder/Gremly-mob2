/**
 * The morning brief writer (Daily brief in Chat).
 *
 * The model writes Gremly's words; everything it may mention is given to it by
 * ref, and every line says which refs it rests on and what it states. It
 * phrases the DCO's decisions (claims, reach, question, return) for the moment
 * the brief is read, and words the offer the code chose. It never chooses its
 * own. Every line, the offer and the catch up go through the check
 * (workers/shared/check, data fabric stage 3).
 *
 * Prompt policy: semantic rules only, no examples, no word lists.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { jsonCall, modelFor } from '../context/llm';
import { addDays } from '../context/db';
import { SENTENCE_SCHEMA, STATED_RULES, runCheck, problemList } from '../../shared/check/index.js';

export const BRIEF_PROMPT_VERSION = 'brief-2026-10-08c';

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

/**
 * What a habit's line says of a lighter version running today: their own
 * words for it when they gave any. Nothing when the habit has none.
 */
function lighterWords(note) {
  if (note == null) return '';
  const said = trim(note, 120);
  return said ? `, lighter version for now: “${said}”` : ', on a lighter version for now';
}

function weekdayLabel(dateStr) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${dateStr}T12:00:00Z`),
  );
}

/** A time of day in minutes as HH:MM on a 24 hour clock, as the check compares it. */
function hhmm(min) {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The writer's input text, the refs it may cite and the records the check
 * holds each line to (workers/shared/check). Exported for the corpus.
 */
export function renderBriefInput(g, offer) {
  const refs = new Map();
  const records = new Map();
  const add = (prefix, obj) => {
    const n = [...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1;
    const ref = `${prefix}${n}`;
    refs.set(ref, obj);
    return ref;
  };
  // the record behind a line: what code can compare, and the line itself,
  // with what its section says of it when the line alone does not
  const hold = (ref, fields, line, section = '') => {
    records.set(ref, { ...fields, label: section ? `${line} | ${section}` : line });
    return line;
  };
  const named = (ref, type, fields, line) => {
    refs.set(ref, { type });
    return hold(ref, fields, line);
  };
  const L = [];
  L.push(
    named(
      'n1',
      'now',
      { dates: [g.today], times: [hhmm(g.now)], exact: ['date'] },
      `TODAY (n1): ${weekdayLabel(g.today)} ${g.today}. TIME NOW: ${clockTime(g.now)}, the ${g.part}.`,
    ),
  );
  L.push(
    g.ret
      ? named(
          'b1',
          'return',
          { numbers: [g.ret.days_away].filter(Number.isFinite), exact: [] },
          `RETURNING AFTER TIME AWAY (b1): yes, ${g.ret.days_away} days away from the app before today. The DCO's welcome: "${trim(g.ret.note, 200)}"`,
        )
      : 'RETURNING AFTER TIME AWAY: no.',
  );
  L.push('');
  const meetingLines = g.meetings.map((m) => {
    const ref = add('c', { type: 'calendar', id: m.id });
    const state =
      m.end <= g.now ? 'already over' : m.start <= g.now ? 'happening now' : 'still ahead';
    return hold(
      ref,
      { dates: [g.today], times: [hhmm(m.start), hhmm(m.end)], exact: ['date', 'time'] },
      `${ref} | ${clockTime(m.start)} to ${clockTime(m.end)} | ${state} | ${trim(m.title, 100)}`,
      'on their calendar today',
    );
  });
  const allDayLines = g.allDay.map((e) => {
    const ref = add('c', { type: 'calendar', id: e.id });
    return hold(
      ref,
      { dates: [g.today], exact: ['date', 'time'] },
      `${ref} | all day | ${trim(e.title, 100)}`,
      'on their calendar today',
    );
  });
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
  const clear = g.free.filter((f) => f.to - Math.max(f.from, g.now) >= 45);
  const planEnd = g.day?.planEnd < 22 * 60 ? g.day.planEnd : 22 * 60;
  L.push(
    named(
      's1',
      'shape',
      {
        dates: [g.today],
        times: [
          hhmm(g.now),
          ...ahead.flatMap((b) => [hhmm(Math.max(b.from, g.now)), hhmm(b.to)]),
          ...clear.flatMap((f) => [hhmm(Math.max(f.from, g.now)), hhmm(f.to)]),
          '08:00',
          hhmm(planEnd),
        ],
        numbers: [45],
        exact: ['time'],
      },
      `SHAPE OF THE REST OF TODAY (s1), WORKED OUT IN CODE: busy ${ahead.map((b) => `${fromTime(b.from, g.now)} to ${clockTime(b.to)}`).join(', ') || 'nothing'}; clear stretches ${
        clear.map((f) => `${fromTime(f.from, g.now)} to ${clockTime(f.to)}`).join(', ') || 'none'
      } (the day is counted from 8am to ${
        g.day?.planEnd < 22 * 60 ? `${clockTime(g.day.planEnd)}, when they set off` : '10pm'
      }).`,
    ),
  );
  const frame = dayRecordLines(g, refOf);
  if (frame.length) {
    const day = g.day || {};
    L.push(
      named(
        'f1',
        'frame',
        {
          dates: [g.today, day.away?.through].filter(Boolean),
          times: [
            ...(Number.isFinite(day.travel?.departs) ? [hhmm(day.travel.departs)] : []),
            ...(day.blocks || []).map((b) => hhmm(b.start)),
            ...(day.duringTravel || []).map((m) => hhmm(m.start)),
          ],
          exact: [],
        },
        `THE DAY'S FRAME (f1):\n${frame.join('\n')}`,
      ),
    );
  }
  if (g.dayShape)
    L.push(
      named('m1', 'dco', { exact: [] }, `THE DCO'S READ OF THE DAY (m1): ${trim(g.dayShape, 240)}`),
    );
  L.push('');
  L.push(
    `DUE TODAY (ref | title):\n${
      g.todosDue
        .map((t) => {
          const ref = add('t', { type: 'todo', id: t.id });
          return hold(
            ref,
            { dates: [g.today], exact: [] },
            `${ref} | ${trim(t.title, 100)}`,
            'a todo of theirs, due today',
          );
        })
        .join('\n') || '(none)'
    }`,
  );
  L.push(
    `HABITS FOR TODAY (ref | habit | this week):\n${
      g.habitsForToday
        .map((h) => {
          const ref = add('h', { type: 'habit', id: h.id });
          const week = h.target
            ? `${h.done} of ${h.target} this week${h.behind ? ', behind for the week' : ''}`
            : 'daily';
          return hold(
            ref,
            {
              numbers: [h.done, h.target, h.target ? h.target - h.done : null].filter(
                Number.isFinite,
              ),
              exact: [],
            },
            `${ref} | ${trim(h.title, 80)} | ${week}${lighterWords(h.lighter)}`,
            'a habit of theirs, for today',
          );
        })
        .join('\n') || '(none)'
    }`,
  );
  L.push(
    g.claims.length
      ? named(
          'k1',
          'claims',
          { exact: [] },
          `THE DCO'S CLAIMS ON TODAY (k1; what has a real claim and why): ${g.claims.map((c) => (c.why ? `${trim(c.title, 80)}: ${trim(c.why, 120)}` : trim(c.title, 80))).join('; ')}`,
        )
      : "THE DCO'S CLAIMS ON TODAY (what has a real claim and why): none",
  );
  if (g.planned?.length) {
    L.push(
      `ALREADY PLANNED FOR TODAY (they said yes to this plan earlier, and it is on the day card; ref | time | title):\n${g.planned
        .map((p) => {
          const ref = add('p', { type: p.type, id: p.id });
          return hold(
            ref,
            { dates: [g.today], times: [hhmm(p.start)], exact: ['time'] },
            `${ref} | ${clockTime(p.start)} | ${trim(p.title, 80)}`,
            'planned for today: they said yes to this plan earlier, and it is on the day card',
          );
        })
        .join('\n')}`,
    );
  }
  if (g.reach) {
    const ref = add('r', { type: g.reach.type, id: g.reach.id });
    L.push(
      hold(
        ref,
        { exact: [] },
        `THE DCO'S REACH (one undated thing worth suggesting today, and the reason): ${ref} | ${trim(g.reach.title || g.reach.statement, 120)} | why: ${trim(g.reach.why, 200)} | from what they said: ${(g.reach.facts || []).map((f) => `"${trim(f.statement, 160)}"`).join('; ')}`,
      ),
    );
  }
  const anchorLines = (g.anchors || [])
    .filter((a) => a.date >= g.today || (a.date_end && a.date_end >= g.today))
    .map((a) => {
      const ref = add('a', { type: 'anchor', id: a.fact_id || null });
      return hold(
        ref,
        { spans: [[a.date, a.date_end || a.date]], exact: ['date'] },
        `${ref} | ${a.date} | ${trim(a.short_label || a.label, 120)}`,
        'a dated thing ahead, on the day card',
      );
    });
  L.push(
    `DATED THINGS AHEAD (shown on the day card already; ref | date | what):\n${anchorLines.join('\n') || 'none'}`,
  );
  L.push('');
  const s = g.sweep || {};
  L.push(
    named(
      'w1',
      'sweep',
      {
        numbers: [
          s.quick,
          s.pastDay,
          s.noDay,
          s.other,
          s.notes,
          s.newSince,
          g.overdue,
          g.unsorted,
        ].filter(Number.isFinite),
        exact: ['number'],
      },
      `NEEDS A DECISION IN SWEEP (w1): ${sweepLine(g)}`,
    ),
  );
  if (g.reaction) L.push(named('e1', 'reaction', { exact: [] }, `(e1) ${g.reaction}`));
  if (g.wrap) L.push(named('e2', 'wrap', { exact: [] }, `(e2) ${g.wrap}`));
  L.push('');
  L.push(
    named(
      'o1',
      'offer',
      {
        times: Number.isFinite(offer?.plan?.gapFrom)
          ? [hhmm(Math.max(offer.plan.gapFrom, g.now))]
          : [],
        exact: [],
      },
      `THE OFFER, DECIDED IN CODE (o1): ${offerBrief(offer, g)}`,
    ),
  );
  if (g.question && !g.ret) {
    L.push(
      `THE QUESTION TO ASK: "${trim(g.question.question, 240)}"${g.question.choices?.length ? ` with the answers ${g.question.choices.map((c) => `"${c}"`).join(', ')}` : ', which has no answers to tap yet'}`,
    );
  }
  return { text: L.join('\n'), refs, records };
}

/**
 * Travel, set times and meetings after setting off, from the day record
 * (brief/dayRecord.js), as the planner and the day card see them.
 */
export function dayRecordLines(g, refOf = () => null) {
  const day = g.day;
  if (!day) return [];
  const out = [];
  if (day.travel) {
    const what = day.travel.label ? `${day.travel.label} today` : 'they travel today';
    out.push(
      `TRAVEL TODAY: ${what}; ${
        Number.isFinite(day.travel.departs)
          ? `they set off at ${clockTime(day.travel.departs)}, and nothing is planned after that`
          : 'the time they set off is not known'
      }.`,
    );
  }
  if (day.away) {
    out.push(
      `AWAY ON A TRIP: ${day.away.label}${day.away.through ? `, until ${weekdayLabel(day.away.through)}` : ''}.`,
    );
  }
  if (day.blocks?.length) {
    out.push(
      `SET TIMES TODAY (planned around like meetings): ${day.blocks
        .map((b) => `${clockTime(b.start)} ${trim(b.title, 60)}`)
        .join('; ')}.`,
    );
  }
  if (day.duringTravel?.length) {
    out.push(
      `MEETINGS AFTER THEY SET OFF (ref | time | title): ${day.duringTravel
        .map((m) => `${refOf(m.id) || 'calendar'} | ${clockTime(m.start)} | ${trim(m.title, 80)}`)
        .join('; ')}.`,
    );
  }
  return out;
}

/** Clashes between meetings that are not over yet. */
export function clashesAhead(g) {
  return (g.clashes || []).filter(([a, b]) => a.end > g.now && b.end > g.now);
}

/** When their last Sweep was, as they would say it, in their own time zone. */
export function sweptWhen(iso, tz, today) {
  const at = new Date(iso || '');
  if (!tz || !today || Number.isNaN(at.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const day = `${p.year}-${p.month}-${p.day}`;
  const hour = Number(p.hour);
  if (day === today) {
    if (hour < 5) return 'last night';
    if (hour < 12) return 'this morning';
    return hour < 17 ? 'this afternoon' : 'this evening';
  }
  if (day === addDays(today, -1)) {
    if (hour >= 17) return 'last night';
    return hour >= 12 ? 'yesterday afternoon' : 'yesterday morning';
  }
  return `on ${weekdayLabel(day)}`;
}

/**
 * What needs a decision before the day is planned: the quick sweep, the
 * number the day card shows. Everything else in Sweep was already decided.
 * Any number Gremly names is this one; the split says what kind of decision.
 */
export function sweepLine(g) {
  const s = g.sweep;
  if (!s || !Number.isFinite(s.quick)) {
    return `${g.overdue} past their dates, ${g.unsorted} with no day yet. The total is not known, so name no number.`;
  }
  if (!s.quick) return 'nothing. Everything in Sweep has already been decided.';
  const parts = [];
  if (s.pastDay) parts.push(`${s.pastDay} past their dates`);
  if (s.noDay) parts.push(`${s.noDay} todos with no day yet`);
  if (s.other) parts.push(`${s.other} skipped in an earlier Sweep or back today`);
  if (s.notes) parts.push(`${s.notes} notes not sorted yet`);
  const when = s.lastSweepAt ? sweptWhen(s.lastSweepAt, g.tz, g.today) : null;
  let fresh = '';
  if (when && Number.isFinite(s.newSince)) {
    fresh =
      s.newSince === s.quick
        ? ` All of them were added after their last Sweep (${when}).`
        : s.newSince > 0
          ? ` ${s.newSince} of them were added after their last Sweep (${when}).`
          : ` Their last Sweep was ${when}.`;
  }
  return `${s.quick}, the number the day card shows and the quick sweep holds; any number named is this one or one of its parts (${parts.join(', ')}).${fresh} Everything else in Sweep has already been decided, so it is not waiting.`;
}

function offerBrief(offer, g) {
  switch (offer.kind) {
    case 'return':
      return `return day. Things piled up while they were away (needing a decision: ${sweepLine(g)}). Sweep is offered first, beside "Catch me up" and "Just today".`;
    case 'sweep':
      return `some things need a decision before the day is planned (${sweepLine(g)}). A quick sweep is offered first: only those cards, then straight back here, with planning after, around what they keep. Say what needs deciding in plain words.${g.sweep?.newSince > 0 ? ' Say when the new ones came in, so they read as fresh drops rather than something undone, without explaining that they are not left over.' : ''} Never call what is waiting messy or a backlog.`;
    case 'plan':
      return `planning. "${offer.buttons[0].label}" is offered, to fit a few things into the clear stretch from ${fromTime(offer.plan.gapFrom, g.now)}${g.reach ? ', with the reach item added' : ''}.`;
    default:
      return g.planned?.length
        ? 'none. They already said yes to a plan for today; Gremly can say so and signs off.'
        : 'none. Nothing to offer today; Gremly signs off.';
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    lines: { type: 'array', items: SENTENCE_SCHEMA },
    offer: SENTENCE_SCHEMA,
    question_line: { type: 'string', nullable: true },
    question_choices: { type: 'array', items: { type: 'string' } },
    catch_up: SENTENCE_SCHEMA,
  },
  required: ['lines', 'offer', 'question_line', 'question_choices', 'catch_up'],
};

/** What each kind of line is, for the brief's prompt and for a line sent back. */
const LINE_RULES = {
  line: 'lines: two or three short chat messages, each its own entry in lines and each one or two sentences, read in the part of the day given in TIME NOW. They give one read of the day: what shapes it, the one or two things that matter, and when it is clear. A meeting that is already over is never described as coming up; at noon or later, write about the rest of the day. When nothing is left today, one line is enough.',
  offer:
    'offer: one or two sentences that end the brief, wording the offer decided in code. The buttons appear under it, so do not name them. Planning is offered as an invitation, never an instruction. Sweep is suggested, never pushed; on a return day say plainly that a sweep would help and that it is fine to skip it. With no offer, the offer is a warm one-sentence sign-off, and the lines do not sign off themselves.',
  catch_up:
    'catch_up: on a return day only, one or two kind sentences saying what is waiting, using the counts in NEEDS A DECISION IN SWEEP as given, and that nothing has been lost. It is shown only if they ask. Otherwise empty.',
};

const BRIEF_VOICE = `VOICE
Warm, plain and brief, like a friend who knows their day. Suggest, never instruct: never tell them what they ought to do, never shame or pressure, never tell them how they feel.`;

function systemPrompt(person) {
  return {
    fixed: `You are Gremly, a warm, shame-free companion, writing the start of someone's day as a few short chat messages. They read it in the app's chat, under a day card that already shows today's meetings, todos, habits, what needs a decision in Sweep and any date coming up. Your words sit around that card; they do not repeat it as a list.

${CARE_RULES}

WHAT YOU WRITE
- ${LINE_RULES.line}
- Every meeting, todo, habit or reach item a line names is cited in that line's refs, by the refs given in the input. Name nothing that is not in the input. Times come from the input and from nowhere else; never work out or add up times or counts yourself.
- Talk about todos and habits the way a person would say them in conversation, rather than pasting a title in as the subject of a sentence. Name a todo as the action itself, in the words a person would say out loud, never as an -ing word or a list of titles. Read each line back as speech: it must be grammatical and sound like something a friend would say aloud.
- Say an occasion falls today (a birthday, an anniversary, a launch) only when the input gives that occasion's own date as today. A trip, plan, task or present named after an occasion does not date the occasion itself.
- Mention a clash only when the input lists one still ahead.
- When the input gives travel today, it frames the day: say so early and plainly, and talk about the time before they set off as the time there is. Point out a meeting that falls after they set off once, as something they may want to move. When the time they set off is not known, never guess one.
- The day is counted to 10pm only so planning has an end; never say the day runs until 10pm or mention that end.
- The DCO has already decided what matters (its claims), the one undated thing worth suggesting (its reach), the question and the welcome. Phrase those decisions; never choose different ones. Mention the reach only with the reason given for it.
- The dated things ahead are on the day card. Mention one only when today genuinely needs it, never to fill a line.
- LAST NIGHT'S WRAP UP, when given, is how they closed yesterday with Gremly, and it is background for today. What they moved to today and a plan they said yes to are their own choices, so speak of them as theirs. Touch on the evening at most once and lightly, never recap it, never mention their journal, and never mention anything they left unfinished.
- On a return day: the first line says once, warmly, that it is good to see them and that time away is fine, then the lines talk about today. Never count, list or hint at what was missed, never guess why they were away, never mention streaks. The counts of what is waiting belong only in catch_up, never in the lines or the offer.
- ${LINE_RULES.offer}
- question_line: when the input gives a question to ask, ask it in your own words as a short chat message, keeping its meaning exactly. Otherwise empty.
- question_choices: required whenever the question has no answers to tap yet: two to four short answers that cover what the person would most likely say, each a few words. Otherwise empty.
- ${LINE_RULES.catch_up}

${BRIEF_VOICE}

${PRIVATE_RULES}

${WRITING_RULES}

${STATED_RULES}
- The offer and the catch up, like each line, come with their refs and what they state. A line's refs include every record it draws on: the shape of the day when it says when the day is busy or clear, the offer decided in code when it words it, Sweep when it says what needs a decision, and TODAY when it names the day or the time.`,
    varying: personBlock(person),
  };
}

/**
 * What the model is told when one line goes back to it: the brief's own
 * rules, and which line it is writing again.
 */
export function briefRewritePrompt(person, key) {
  const { fixed, varying } = systemPrompt(person);
  const which =
    key === 'offer' ? 'the offer' : key === 'catch_up' ? 'the catch up' : 'one of the lines';
  return `${fixed}

${varying}

ONE SENTENCE AGAIN
You are given ${which} you wrote, what was wrong with it, and only the records it rests on. Write it again, so that it says only what those records hold, with its refs and what it states. Cite only the records given here. When nothing true can be said from them, return empty text.`;
}

// A ref the model wrote into the text by mistake, such as "[c1, c2]" or "(t1)"
const REFS_IN_TEXT = /\s*[[(]\s*[a-z]\d+(?:\s*,\s*[a-z]\d+)*\s*[\])]/g;
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

/** A line as the model gave it, its words cleaned of refs and dashes before the check reads it. */
function cleaned(sentence, n) {
  return sentence && typeof sentence === 'object'
    ? { ...sentence, text: noDashes(stripRefs(trim(sentence.text, n))) }
    : null;
}

export async function writeBrief(env, g, offer) {
  const { text, refs, records } = renderBriefInput(g, offer);
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'brief'),
    fallback: modelFor(env, 'briefFallback'),
    system: systemPrompt(g.person),
    user: text,
    schema: SCHEMA,
    maxTokens: 4000,
    thinking: 'low',
    effort: 'low',
  });

  // Every line, the offer and the catch up through the check; one that fails
  // goes back once, alone with its records, to the model that wrote it
  const lines = (output.lines || []).map((l) => cleaned(l, 400)).filter((l) => l?.text);
  const items = lines.map((sentence, i) => ({ key: `line_${i}`, sentence }));
  const offerLine = cleaned(output.offer, 400);
  if (offerLine?.text) items.push({ key: 'offer', sentence: offerLine });
  const catchUp = g.ret ? cleaned(output.catch_up, 400) : null;
  if (catchUp?.text) items.push({ key: 'catch_up', sentence: catchUp });
  const [wrote, other] =
    model === modelFor(env, 'briefFallback').model
      ? [modelFor(env, 'briefFallback'), modelFor(env, 'brief')]
      : [modelFor(env, 'brief'), modelFor(env, 'briefFallback')];
  const check = await runCheck({
    items,
    records,
    today: g.today,
    moment: `read at ${clockTime(g.now)}, in the ${g.part}`,
    person: g.person,
    ask: async (req) =>
      (
        await jsonCall(env, {
          primary: modelFor(env, 'check'),
          fallback: modelFor(env, 'checkFallback'),
          ...req,
          maxTokens: 600,
          effort: 'low',
          thinking: 'low',
        })
      ).output,
    rewrite: async ({ key, sentence, records: own, problems }) =>
      cleaned(
        (
          await jsonCall(env, {
            primary: wrote,
            fallback: other,
            system: briefRewritePrompt(g.person, key),
            user: `THE LINE: ${key === 'offer' ? 'the offer' : key === 'catch_up' ? 'the catch up' : 'one of the lines'}\nTODAY: ${weekdayLabel(g.today)} ${g.today}. TIME NOW: ${clockTime(g.now)}.\n\nRECORDS:\n${own.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
            schema: SENTENCE_SCHEMA,
            maxTokens: 1200,
            thinking: 'low',
            effort: 'low',
          })
        ).output,
        400,
      ),
  });
  const result = (key) => check.results.get(key);
  const idsOf = (r) => (r?.refs || []).map((x) => refs.get(x)?.id).filter(Boolean);
  const kept = [];
  const dropped = [];
  lines.forEach((l, i) => {
    const r = result(`line_${i}`);
    if (r?.sentence) kept.push({ text: r.sentence.text, ids: idsOf(r) });
    else {
      const d = check.details.find((x) => x.key === `line_${i}`);
      dropped.push({ text: l.text, bad: problemList(d) });
    }
  });
  const offerResult = offerLine?.text ? result('offer') : null;
  const offerDetail = check.details.find((x) => x.key === 'offer');
  return {
    model,
    input: text,
    lines: kept,
    dropped,
    offer: offerResult?.sentence?.text || null,
    offerDropped:
      offerLine?.text && !offerResult?.sentence
        ? {
            text: offerLine.text,
            bad: problemList(offerDetail),
          }
        : null,
    questionLine:
      g.question && !g.ret
        ? noDashes(stripRefs(trim(output.question_line, 300))) || g.question.question
        : null,
    questionChoices: (output.question_choices || []).map((c) => trim(c, 40)).filter(Boolean),
    catchUp: g.ret ? result('catch_up')?.sentence?.text || null : null,
    check: { counts: check.counts, details: check.details },
  };
}
