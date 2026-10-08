/**
 * The background reader's replay (workers/inngest-jobs/context/reader.js):
 * records made late in the evening and after midnight, read by the model and
 * prompt that ship, with the date each fact should carry. A person's day ends
 * at 3am (workers/shared/day.js), so a record made at 1am belongs to the day
 * before the clock's date, and its relative dates count from that day.
 *
 *   scripts/reader-replay/run.sh [--only id,id] [--repeat n] [--old-clock]
 *
 * --old-clock reads every record by the clock's date, as the reader did
 * before 5 October. Every name and record is made up.
 *
 * From stage 1 of the data fabric it also reads what changed and what went:
 * a long journal page, an entry added to the next morning, a date changed by
 * hand, an event cancelled on a change card, an entry deleted, a todo moved
 * five times and let go, a weekly review, a calendar entry moved and then
 * cancelled, and a private entry. Those are checked by structure, never by
 * wording: refs that exist, facts only from what is new, one update and no
 * second fact, cancelled entries listed, private facts private. From stage 4d,
 * an occasion's day said in passing, a standing fact, and the catch up's
 * records read before, checked by the dates and timings returned.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readerRequest,
  readerToday,
  READER_SCHEMA,
  READER_PROMPT_VERSION,
  validDate,
} from '../../workers/inngest-jobs/context/reader.js';
import { jsonCall, modelFor } from '../../workers/inngest-jobs/context/llm.js';
import { localDate } from '../../workers/shared/db.js';
import { validKind } from '../../workers/shared/factKinds.js';
import {
  calendarRecord,
  changeRecord,
  chatRecord,
  deletedRecord,
  noteRecord,
  reviewRecord,
  splitRecord,
  todoRecord,
} from '../../workers/inngest-jobs/context/records.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag('--only');
const repeat = Math.max(1, Number(flag('--repeat') || 1));
const oldClock = args.includes('--old-clock');
const TZ = 'America/Los_Angeles';
const DAY_END = 3;
const PERSON = { first_name: 'Alex', pronouns: null, identity: {} };

const journal = (at, title, body, mood) => ({
  table: 'notes',
  id: `n-${at}`,
  at,
  text: `Wrote a journal entry: "${title}". ${body}${mood ? ` Mood: ${mood}.` : ''}`,
});
const said = (at, text) => ({ table: 'scope_chat_messages', id: `m-${at}`, at, text: `Said in chat: "${text}"` });

// Wednesday 7 October 2026 is their day until 3am on Thursday 8 October.
const SCENARIOS = [
  {
    id: 'late-interview-tomorrow',
    look: 'Written at 1:30am, still their Wednesday: the interview is on Thursday 8 October.',
    runAt: '2026-10-08T09:05:00Z',
    records: [journal('2026-10-08T08:30:00Z', 'Nervous', 'Big day tomorrow, the interview at Brightwater is at 10am.', 'anxious')],
    expect: [{ about: /interview|brightwater/i, date: '2026-10-08', wrong: ['2026-10-09'] }],
  },
  {
    id: 'late-dinner-tonight',
    look: 'Written at 1:10am about the evening just gone: the dinner was on Wednesday 7 October.',
    runAt: '2026-10-08T09:05:00Z',
    records: [journal('2026-10-08T08:10:00Z', 'Lovely evening', "Tonight we finally had dinner with Jo's parents at their place. It went better than I feared.", 'relieved')],
    expect: [{ about: /dinner|parents/i, date: '2026-10-07', wrong: ['2026-10-08'] }],
  },
  {
    id: 'late-garage-morning',
    look: 'Said at 12:50am: the morning is Thursday morning, 8 October.',
    runAt: '2026-10-08T09:05:00Z',
    records: [said('2026-10-08T07:50:00Z', 'I need to drop the car at the garage in the morning before work')],
    expect: [{ about: /garage|car/i, date: '2026-10-08', wrong: ['2026-10-07', '2026-10-09'] }],
  },
  {
    id: 'late-named-day',
    look: 'Said at 12:45am, naming a weekday: Friday is 9 October either way.',
    runAt: '2026-10-08T09:05:00Z',
    records: [said('2026-10-08T07:45:00Z', "I'm seeing Priya on Friday for lunch")],
    expect: [{ about: /priya|lunch/i, date: '2026-10-09', wrong: ['2026-10-10'] }],
  },
  {
    id: 'evening-tomorrow',
    look: 'Said at 9pm on Wednesday: tomorrow is Thursday 8 October.',
    runAt: '2026-10-08T05:05:00Z',
    records: [said('2026-10-08T04:00:00Z', 'Dentist tomorrow at 9, need to remember to floss lol')],
    expect: [{ about: /dentist/i, date: '2026-10-08', wrong: ['2026-10-09'] }],
  },

  ...STAGE_ONE(),
  ...STAGE_FOUR_D(),
  ...STAGE_FOUR_F(),
];

/**
 * Stage 4f: an occasion has one day. A plan made around it never becomes a
 * second day for it, a different day for it is asked about rather than kept,
 * a death said in passing is kept, a routine said with one day is standing,
 * and a fact they set aside stays set aside. Checked by the dates, timings,
 * updates and questions returned.
 */
function STAGE_FOUR_F() {
  const chat = (id, at, content, gremly) =>
    chatRecord({ id, chat_id: 'c-1', content, created_at: at }, gremly);
  const yearlyNotOn = (facts, monthDay) =>
    facts.filter((f) => f.timing === 'yearly' && String(f.about_date || '').slice(5, 10) !== monthDay);
  const said = (facts) => facts.map((f) => `${f.about_date || 'no date'} ${f.timing}: ${f.statement}`).join(' / ') || 'no fact';
  return [
    {
      id: 'birthday-trip-not-the-day',
      look: 'The ledger has their 35th on 30 April, as happened. A trip for the birthday leaves on the 25th: the trip is a plan of its own, never a second birthday.',
      runAt: '2026-04-21T03:00:00Z',
      facts: [{ id: 'fb1', statement: 'Alex turned 35 on 30 April.', state: 'happened', about_date: '2026-04-30', timing: 'day' }],
      records: [chat('m-trip', '2026-04-21T02:30:00Z', 'Booked Big Sur for my birthday, we leave on the 25th!', 'Any plans coming up?')],
      check: ({ facts }) => [
        { name: 'no birthday on a day but 30 April', ok: yearlyNotOn(facts, '04-30').length === 0, detail: said(facts) },
      ],
    },
    {
      id: 'birthday-two-days-asked',
      look: 'The ledger holds their birthday every year on 30 April. They say it is on the 25th: asked about, or put right, never kept as a second day.',
      runAt: '2026-04-11T03:00:00Z',
      facts: [{ id: 'fb2', statement: "Alex's birthday is on 30 April.", state: 'current', about_date: '2025-04-30', timing: 'yearly' }],
      records: [chat('m-bday', '2026-04-11T02:30:00Z', "It's my birthday on the 25th, so keep that weekend free", 'What does the rest of April look like?')],
      check: ({ facts, updates, questions }) => {
        const second = yearlyNotOn(facts, '04-30').length > 0;
        const settled = updates.some((u) => u.fact_ref === 'f1') || questions.some((q) => q.fact_ref === 'f1' || /birthday/i.test(q.question));
        return [
          { name: 'never a second day kept beside the first', ok: !second || settled, detail: `${said(facts)} | updates ${updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || 'none'} | questions ${questions.map((q) => q.question).join(' / ') || 'none'}` },
          { name: 'a question about it needs an answer', ok: !questions.some((q) => /birthday/i.test(q.question)) || questions.some((q) => /birthday/i.test(q.question) && q.matters === 'needs'), detail: questions.map((q) => `${q.matters}: ${q.question}`).join(' / ') || 'none' },
        ];
      },
    },
    {
      id: 'late-parent-kept',
      look: "Said in a journal on what would have been their dad's birthday: that he has died is kept, and his birthday comes every year.",
      runAt: '2026-10-13T03:00:00Z',
      records: [noteRecord({ id: 'n-dad', subtype: 'journal', title: 'Monday', body: 'Dad would have been 72 today. Quiet day. Called Mum for a long time.', created_at: '2026-10-13T01:00:00Z' })],
      check: ({ facts }) => [
        { name: 'that he has died is kept', ok: facts.some((f) => /died|passed away|death|late father|no longer alive|lost (his|her|their) (dad|father)/i.test(f.statement)), detail: said(facts) },
        { name: 'his birthday every year', ok: facts.some((f) => f.timing === 'yearly' && String(f.about_date || '').slice(5, 10) === '10-12'), detail: said(facts) },
      ],
    },
    {
      id: 'routine-kept-up',
      look: 'A routine said with the day it was done, and that they are keeping it up: a standing fact.',
      runAt: '2026-10-20T03:00:00Z',
      records: [noteRecord({ id: 'n-swim2', subtype: 'journal', title: 'Monday', body: 'Swam before work again. That is three mornings this week now, I am actually keeping it up.', created_at: '2026-10-20T00:10:00Z' })],
      check: ({ facts }) => [
        { name: 'a standing routine', ok: facts.some((f) => f.timing === 'standing'), detail: said(facts) },
      ],
    },
    {
      id: 'set-aside-left',
      look: 'A note they changed gave a fact they set aside as not part of their life: it stays as it is and is not added again.',
      runAt: '2026-11-12T17:00:00Z',
      facts: [{ id: 'fsa', statement: 'Alex added a note called test note to try the app.', state: 'set_aside', about_date: null, timing: 'day' }],
      records: [
        {
          ...noteRecord({ id: 'n-try', title: 'test note', body: 'trying the app again, ignore', created_at: '2026-11-12T16:30:00Z' }),
          kind: 'changed',
          factIds: ['fsa'],
        },
      ],
      check: ({ facts, updates }) => [
        { name: 'nothing added again', ok: facts.length === 0, detail: said(facts) },
        { name: 'the set aside fact left as it is', ok: !updates.some((u) => u.fact_ref === 'f1'), detail: updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || 'none' },
      ],
    },
    {
      id: 'question-already-waiting',
      look: 'The same thing is unclear again, and a question about it is already waiting: it is not asked twice.',
      runAt: '2026-11-12T17:00:00Z',
      facts: [{ id: 'fw', statement: 'Alex plans a weekend in Hudson with Jo from 6 to 8 November.', state: 'planned', about_date: '2026-11-06', about_date_end: '2026-11-08', timing: 'span' }],
      waiting: [{ question: 'Did the Hudson weekend go ahead, or was it moved?' }],
      records: [chat('m-hud', '2026-11-12T16:30:00Z', 'Not sure if Hudson is even happening now, Jo might have work', 'How was the weekend?')],
      check: ({ questions }) => [
        { name: 'nothing asked again', ok: !questions.some((q) => /hudson|weekend/i.test(q.question)), detail: questions.map((q) => q.question).join(' / ') || 'none' },
      ],
    },
  ];
}

/**
 * Stage 4d: what is said in passing is kept, with when it is true, and the
 * catch up adds only what was missed. Checked by the fields the reader
 * returns (date, timing, refs), never by wording.
 */
function STAGE_FOUR_D() {
  const chat = (id, at, content, gremly) =>
    chatRecord({ id, chat_id: 'c-1', content, created_at: at }, gremly);
  const fact = (id, statement, extra = {}) => ({ id, statement, state: 'current', about_date: null, ...extra });
  const yearlyOn = (facts, monthDay) =>
    facts.filter((f) => String(f.about_date || '').slice(5, 10) === monthDay && f.timing === 'yearly');
  return [
    {
      id: 'occasion-in-passing',
      look: 'Gremly wishes them a happy anniversary on the wrong day, and they say in passing when it is: the day is kept, every year.',
      runAt: '2026-11-07T01:00:00Z',
      records: [
        chat(
          'm-1',
          '2026-11-07T00:30:00Z',
          'Ha, not until the 12th! This is just a weekend away.',
          'Happy anniversary weekend to you both!',
        ),
      ],
      check: ({ facts }) => [
        { name: 'the anniversary on 11-12, every year', ok: yearlyOn(facts, '11-12').length > 0, detail: facts.map((f) => `${f.about_date || 'no date'} ${f.timing}`).join(', ') || 'no fact' },
      ],
    },
    {
      id: 'standing-said-today',
      look: 'How their mornings run, said on one day: a standing fact.',
      runAt: '2026-10-20T01:00:00Z',
      records: [
        noteRecord({ id: 'n-swim', title: 'Mornings', body: 'Swimming before work most days now, it keeps me sane.', created_at: '2026-10-19T23:00:00Z' }),
      ],
      check: ({ facts }) => [
        { name: 'a standing fact', ok: facts.some((f) => f.timing === 'standing'), detail: facts.map((f) => `${f.about_date || 'no date'} ${f.timing}`).join(', ') || 'no fact' },
      ],
    },
    {
      id: 'read-before-nothing-missed',
      look: 'A record read before, whose fact already says all it holds: nothing new, nothing changed.',
      runAt: '2026-11-12T17:00:00Z',
      facts: [fact('fr1', 'Alex plans to book a check up at the dentist.', { state: 'planned' })],
      records: [
        { ...todoRecord({ id: 't-dentist', title: 'Book a dentist check up', created_at: '2026-09-02T16:00:00Z' }), kind: 'read_before', factIds: ['fr1'] },
      ],
      check: ({ facts, updates }) => [
        { name: 'no new fact', ok: facts.length === 0, detail: facts.map((f) => f.statement).join(' / ') || 'none' },
        { name: 'no fact changed', ok: updates.length === 0, detail: updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || 'none' },
      ],
    },
    {
      id: 'read-before-missed-occasion',
      look: 'A record read before under older rules, where the day of an occasion was missed: the catch up adds it, every year, and changes nothing else.',
      runAt: '2026-11-12T17:00:00Z',
      facts: [fact('fr2', 'Alex has a weekend away with Jo from 6 to 8 November.', { state: 'happened', about_date: '2026-11-06', about_date_end: '2026-11-08' })],
      records: [
        {
          ...chat('m-2', '2026-11-07T00:30:00Z', 'Ha, not until the 12th! This is just a weekend away.', 'Happy anniversary weekend to you both!'),
          kind: 'read_before',
          factIds: ['fr2'],
        },
      ],
      check: ({ facts, updates }) => [
        { name: 'the anniversary on 11-12, every year', ok: yearlyOn(facts, '11-12').length > 0, detail: facts.map((f) => `${f.about_date || 'no date'} ${f.timing}`).join(', ') || 'no fact' },
        { name: 'no fact changed', ok: updates.length === 0, detail: updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || 'none' },
      ],
    },
  ];
}

/** The stage 1 scenarios: what changed and what went, checked by structure. */
function STAGE_ONE() {
  const runAt = '2026-10-08T03:00:00Z'; // 8pm on Wednesday 7 October
  const made = '2026-10-01T16:00:00Z';
  const pageCards = [
    ['What went well this week?', 'The garden project finally came together. We cleared the back bed on Saturday morning, turned the soil and planted the bulbs Jo picked up at the market. It took longer than planned because the old fence posts had rotted through and we had to dig them out one by one. By the afternoon my back was done in but the bed looked like a real garden for the first time since we moved.'],
    ['What was hard?', 'Work was heavy. The migration slipped again and I spent most of Tuesday on calls trying to work out who owns the billing service now that Sam has left. Nobody wants it. I said I would write up a proposal by Friday so at least there is something on paper.'],
    ['Who did you think about?', 'My sister Ana. Her move to Porto is in three weeks and she sounded stretched on the phone. I want to fly out for her birthday on 3 November and help with the boxes while I am there.'],
    ['What is next?', 'Book the flight to Porto for the first of November. Ask Priya to cover the Thursday stand up while I am away. Start the half marathon training plan on Monday 12 October, three runs a week, building to the race on 7 December.'],
  ];
  const pad = (t) => `${t} ${t}`; // a full page: about four thousand characters
  const pageBody = pageCards.map(([q, w]) => `${q}\n${pad(w)}`).join('\n\n');
  const page = {
    id: 'n-page',
    subtype: 'journal',
    title: 'Week in review',
    body: pageBody,
    created_at: '2026-10-08T02:30:00Z',
    views: {
      sweep_date: '2026-10-07',
      journal_page: {
        v: 1,
        tpl: 'weekly',
        cards: pageCards.map(([q, w]) => ({ q, html: `<p>${pad(w)}</p>` })),
        text: pageBody,
      },
    },
  };
  const fact = (id, statement, extra = {}) => ({ id, statement, state: 'planned', about_date: null, ...extra });
  return [
    {
      id: 'long-journal-page',
      look: 'A journal page of four prompts and about four thousand characters: facts come from the second half too.',
      runAt,
      records: splitRecord(noteRecord(page)),
      check: ({ facts }) => {
        const half = pageBody.slice(Math.floor(pageBody.length / 2)).toLowerCase();
        const late = facts.filter((f) => f.quote && half.includes(String(f.quote).toLowerCase().slice(0, 40)));
        return [{ name: 'a fact from the second half', ok: late.length > 0, detail: `${late.length} of ${facts.length}` }];
      },
    },
    {
      id: 'entry-added-next-morning',
      look: 'An entry written on Tuesday night, with a paragraph added on Wednesday morning: facts only for what is new.',
      runAt,
      facts: [fact('fa', 'Alex had a hard conversation with their manager about the reorg.', { state: 'happened', about_date: '2026-10-06' })],
      records: [
        {
          ...changeRecord(
            { table: 'notes', row_id: 'n-tue', at: '2026-10-07T15:00:00Z', fields: ['body'] },
            {
              id: 'n-tue',
              subtype: 'journal',
              title: 'Tuesday',
              body: 'Hard conversation with my manager about the reorg today. I held my ground.\n\nAdded this morning: she messaged first thing to say the team stays together, and I am now leading the platform group from November.',
              created_at: '2026-10-07T05:00:00Z',
            },
            TZ,
          ),
          factIds: ['fa'],
        },
      ],
      check: ({ facts }) => [
        {
          name: 'no second fact about the conversation',
          ok: !facts.some((f) => /conversation|held my ground/i.test(`${f.statement} ${f.quote}`) && !/platform|november|team stays/i.test(`${f.statement} ${f.quote}`)),
          detail: facts.map((f) => f.statement).join(' / ') || 'no fact',
        },
        { name: 'a fact from the added paragraph', ok: facts.some((f) => /platform|november|team stays/i.test(`${f.statement} ${f.quote}`)), detail: `${facts.length} facts` },
      ],
    },
    {
      id: 'date-changed-by-hand',
      look: 'A todo the ledger has a fact about is moved by hand from Thursday to Saturday: no second fact.',
      runAt,
      facts: [fact('fb', 'Alex will pick up the new glasses.', { about_date: '2026-10-10', item_table: 'todos' })],
      records: [
        {
          ...changeRecord(
            { table: 'todos', row_id: 't-glasses', at: '2026-10-07T17:00:00Z', fields: ['due_day'], dates: { due_day: ['2026-10-08', '2026-10-10'] } },
            { id: 't-glasses', title: 'Pick up the new glasses', due_day: '2026-10-10', sweep_reschedule_count: 1, created_at: made },
            TZ,
          ),
          factIds: ['fb'],
        },
      ],
      check: ({ facts }) => [{ name: 'no second fact', ok: !facts.some((f) => /glasses/i.test(f.statement)), detail: facts.map((f) => f.statement).join(' / ') || 'none' }],
    },
    {
      id: 'event-cancelled-on-card',
      look: 'An event the ledger holds as planned is archived from a change they accepted in chat: the plan is updated.',
      runAt,
      facts: [fact('fc', "Alex is going to Mia's birthday dinner on Saturday.", { about_date: '2026-10-10', item_table: 'notes' })],
      records: [
        {
          ...changeRecord(
            { table: 'notes', row_id: 'n-dinner', at: '2026-10-07T18:00:00Z', fields: ['archived'], dates: { archived: [false, true] } },
            { id: 'n-dinner', subtype: 'event', title: "Mia's birthday dinner", target_date: '2026-10-10', archived: true, archived_reason: 'archived in chat', created_at: made },
            TZ,
          ),
          factIds: ['fc'],
        },
      ],
      check: ({ updates, questions }) => [
        { name: 'the plan is updated or asked about', ok: updates.some((u) => u.fact_ref === 'f1') || questions.some((q) => q.fact_ref === 'f1'), detail: updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || 'no update' },
      ],
    },
    {
      id: 'entry-deleted',
      look: 'A todo is deleted; the fact from it is shown beside the deletion, and nothing new is made from it.',
      runAt,
      facts: [fact('fd', 'Alex plans to repaint the hall.', { state: 'planned' })],
      records: [{ ...deletedRecord({ table: 'todos', row_id: 't-paint', at: '2026-10-07T19:00:00Z' }), factIds: ['fd'] }],
      check: ({ facts, updates }) => [
        { name: 'no new fact from a deletion', ok: facts.length === 0, detail: facts.map((f) => f.statement).join(' / ') || 'none' },
        { name: 'the deletion alone changes no fact', ok: updates.length === 0, detail: updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || 'none' },
      ],
    },
    {
      id: 'moved-five-times-let-go',
      look: 'A todo moved five times is let go in the wrap up: the plan resting on it is updated or asked about.',
      runAt,
      facts: [fact('fe', 'Alex plans to call the bank about the mortgage.', { item_table: 'todos', about_date: '2026-10-07' })],
      records: [
        {
          ...changeRecord(
            { table: 'todos', row_id: 't-bank', at: '2026-10-08T02:00:00Z', fields: ['archived'], dates: { archived: [false, true] } },
            { id: 't-bank', title: 'Call the bank about the mortgage', due_day: '2026-10-07', archived: true, archived_reason: 'swept', sweep_reschedule_count: 5, created_at: made },
            TZ,
          ),
          factIds: ['fe'],
        },
      ],
      check: ({ updates, questions }) => [
        { name: 'the plan is updated or asked about', ok: updates.some((u) => u.fact_ref === 'f1') || questions.some((q) => q.fact_ref === 'f1'), detail: updates.map((u) => `${u.fact_ref} ${u.new_state}`).join(', ') || questions.map((q) => q.question).join(' / ') || 'nothing' },
      ],
    },
    {
      id: 'weekly-review',
      look: 'A weekly review with priorities and an intention in their words: read as theirs.',
      runAt,
      records: [
        reviewRecord(
          {
            id: 'w-1',
            status: 'done',
            week_start: '2026-10-05',
            read: { first: '2026-10-05', last: '2026-10-11', challenge: { headline: 'Thursday is overbooked' }, intention_drafts: ['Keep the evenings free'] },
            answers: {
              challenge: { agreed: true },
              priorities: [{ text: 'Get the billing proposal written', item_ids: [] }, { text: 'Book the Porto flight', item_ids: [] }],
              intention: 'Say no to anything new until the proposal is in',
              said: [{ step: 'intention', text: 'I keep saying yes to things and then drowning' }],
            },
          },
          new Map(),
          '2026-10-07T20:00:00Z',
        ),
      ],
      check: ({ facts }) => [{ name: 'a fact from the review', ok: facts.length > 0, detail: facts.map((f) => f.statement).join(' / ') || 'none' }],
    },
    {
      id: 'calendar-moved-then-cancelled',
      look: 'A calendar entry was moved, then its title says it is cancelled: the entry is listed as cancelled.',
      runAt,
      facts: [fact('fg', 'Alex has a physio appointment on Friday.', { about_date: '2026-10-09', item_table: 'synced_calendar_events' })],
      records: [
        {
          ...changeRecord(
            { table: 'synced_calendar_events', row_id: 'e-physio', at: '2026-10-07T21:00:00Z', fields: ['start_at', 'end_at', 'title'], dates: { start_at: ['2026-10-08T16:00:00Z', '2026-10-09T16:00:00Z'], end_at: ['2026-10-08T17:00:00Z', '2026-10-09T17:00:00Z'] } },
            { id: 'e-physio', title: 'Canceled: Physio with Dr Lee', start_at: '2026-10-09T16:00:00Z', end_at: '2026-10-09T17:00:00Z', is_all_day: false, created_at: made },
            TZ,
          ),
          factIds: ['fg'],
        },
        calendarRecord({ id: 'e-other', title: 'Team lunch', start_at: '2026-10-09T19:00:00Z', end_at: '2026-10-09T20:00:00Z', is_all_day: false, created_at: '2026-10-07T21:30:00Z' }, TZ),
      ],
      check: ({ calendar, recRef }) => [
        { name: 'the physio entry is cancelled', ok: calendar.some((c) => c.cancelled && recRef.get(c.ref)?.id === 'e-physio'), detail: JSON.stringify(calendar) },
        { name: 'the lunch is left alone', ok: !calendar.some((c) => recRef.get(c.ref)?.id === 'e-other'), detail: JSON.stringify(calendar) },
      ],
    },
    {
      id: 'private-journal',
      look: 'A journal entry they marked private: every fact from it is private.',
      runAt,
      records: [
        noteRecord({
          id: 'n-private',
          subtype: 'journal',
          title: 'Rough week',
          body: 'Second session with the counsellor today. We talked about the panic on the train. Jo is coming to the next one with me on the 21st.',
          created_at: '2026-10-07T22:00:00Z',
          views: { private_journal: true },
        }),
      ],
      check: ({ facts, recRef }) => {
        const own = facts.filter((f) => recRef.get(f.source_ref)?.private);
        return [
          { name: 'facts made', ok: facts.length > 0, detail: `${facts.length}` },
          { name: 'every fact private, as the model marked it', ok: own.every((f) => f.private), detail: own.map((f) => `${f.private ? 'private' : 'open'}: ${f.statement}`).join(' / ') },
        ];
      },
    },
  ];
}

async function runOne(s) {
  const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY };
  const at = new Date(s.runAt);
  const today = oldClock ? localDate(TZ, at) : readerToday(TZ, at, DAY_END);
  const { system, user, recRef, factRef } = readerRequest({
    today,
    person: PERSON,
    chunk: s.records,
    openFacts: s.facts || [],
    waiting: s.waiting || [],
    tz: TZ,
    ...(oldClock ? {} : { dayEndHour: DAY_END }),
  });
  const started = Date.now();
  try {
    const { output, model } = await jsonCall(env, {
      primary: modelFor(env, 'reader'),
      fallback: modelFor(env, 'readerFallback'),
      system,
      user,
      schema: READER_SCHEMA,
      maxTokens: 8000,
      effort: 'low',
      thinking: 'low',
    });
    // the dates as readChunk keeps them
    const facts = (output.new_facts || [])
      .filter((f) => recRef.has(f.source_ref))
      .map((f) => ({ ...f, about_date: validDate(f.about_date) }));
    const updates = output.fact_updates || [];
    const questions = output.questions || [];
    const calendar = output.calendar || [];
    // structure every scenario keeps: every ref it gives exists
    const refsOk = [
      ...(output.new_facts || []).map((f) => recRef.has(f.source_ref)),
      ...updates.map((u) => factRef.has(u.fact_ref) && recRef.has(u.source_ref)),
      ...(output.confirmations || []).map((c) => factRef.has(c.fact_ref) && recRef.has(c.source_ref)),
      ...calendar.map((c) => recRef.has(c.ref)),
    ];
    const kindless = (output.new_facts || []).filter((f) => !validKind(f.kind) || typeof f.health !== 'boolean');
    const structure = [
      { name: 'every ref exists', ok: refsOk.every(Boolean), detail: `${refsOk.filter((x) => !x).length} unknown` },
      { name: 'every new fact has a kind from the list and a health flag', ok: !kindless.length, detail: kindless.map((f) => `${f.kind}/${f.health}`).join(', ') || 'all' },
    ];
    if (s.check) {
      const checks = [...structure, ...s.check({ facts, updates, questions, calendar, recRef, factRef })];
      return { id: s.id, model, ms: Date.now() - started, ok: checks.every((c) => c.ok), checks, facts, updates, questions, calendar, today, user };
    }
    const checks = [...structure, ...s.expect.map((e) => {
      const hit = facts.filter((f) => e.about.test(`${f.statement} ${f.quote}`));
      const dates = hit.map((f) => f.about_date || 'none');
      // a fact can be about the day it was written (a feeling about the event),
      // so it passes when one fact has the date and none has a wrong one
      const ok = hit.some((f) => f.about_date === e.date) && !hit.some((f) => (e.wrong || []).includes(f.about_date));
      return { name: `${e.about} on ${e.date}`, ok, detail: dates.join(', ') || 'no fact' };
    })];
    return { id: s.id, model, ms: Date.now() - started, ok: checks.every((c) => c.ok), checks, facts, questions, today, user };
  } catch (err) {
    return { id: s.id, ms: Date.now() - started, ok: false, error: String(err?.message || err) };
  }
}

const scenarios = only ? SCENARIOS.filter((s) => only.split(',').includes(s.id)) : SCENARIOS;
const jobs = scenarios.flatMap((s) => Array.from({ length: repeat }, () => s));
console.log(`${READER_PROMPT_VERSION}${oldClock ? ' (old clock)' : ''}: ${jobs.length} reads`);
const results = await Promise.all(jobs.map(runOne));
for (const r of results) {
  const why = r.error || r.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ');
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.id} · ${r.ms}ms${why ? ` · ${why}` : ''}`);
  for (const f of r.facts || []) console.log(`      ${f.about_date || 'no date'} | ${f.statement}`);
  for (const u of r.updates || []) console.log(`      update ${u.fact_ref} -> ${u.new_state}: ${u.reason}`);
  for (const c of r.calendar || []) console.log(`      calendar ${c.ref} cancelled ${c.cancelled}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} of ${results.length} pass every check`);
const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Results: ${join(dir, 'results.json')}`);
