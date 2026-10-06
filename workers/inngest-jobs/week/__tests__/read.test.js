/**
 * @jest-environment node
 */
// The weekly read (workers/inngest-jobs/week/read.js): what it is given, the
// figures code works out for it, and the check on what comes back. The people
// here are made up.

import {
  READ_LIMITS,
  READ_SCHEMA,
  TODO_LIST_MAX,
  WEEK_READ_VERSION,
  bookedMinutes,
  checkRead,
  figuresOf,
  habitAllowance,
  habitSentence,
  lengthWords,
  monthsBefore,
  readSystem,
  renderRead,
  runWeekRead,
  shapeHabit,
  shapeTodo,
  storedRead,
  todosToList,
  theirDays,
} from '../read';
import { jsonCall } from '../../context/llm';

jest.mock('../../context/llm', () => ({
  ...jest.requireActual('../../context/llm'),
  jsonCall: jest.fn(),
}));

// Sunday 4 October 2026: the review plans Monday 5 to Sunday 11
const TODAY = '2026-10-04';
const DAYS = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];

const todo = (id, o = {}) => ({
  id,
  title: o.title ?? `Todo ${id}`,
  minutes: o.minutes ?? null,
  created: o.created ?? '2026-09-20',
  moved: o.moved ?? 0,
  due_day: o.due_day ?? null,
  deadline: o.deadline ?? null,
  back_on: o.back_on ?? null,
});
const habit = (id, o = {}) => ({
  id,
  title: o.title ?? `Habit ${id}`,
  cadence: o.cadence ?? 'weekly',
  target: o.cadence === 'daily' ? null : (o.target ?? 3),
  days_active: o.days_active ?? [],
  breaking: !!o.breaking,
  minutes: o.minutes ?? null,
  start_date: o.start_date ?? null,
  end_date: o.end_date ?? null,
  last_week: o.last_week ?? 0,
  before: o.before ?? 0,
  planned: o.planned ?? [],
});

function gathered(over = {}) {
  return {
    tz: 'Europe/London',
    today: TODAY,
    now: 15 * 60 + 10,
    first: DAYS[0],
    last: DAYS[6],
    week_start: DAYS[0],
    days_off: [0, 6],
    person: { first_name: 'Robin' },
    worlds: [
      {
        name: 'Work',
        phase: 'active',
        summary: 'A report is due this month.',
        priorities: ['Finish the report'],
      },
    ],
    chapters: [],
    todos: [
      todo('todo-a', {
        title: 'Write the report',
        minutes: 120,
        deadline: '2026-10-20',
        moved: 11,
        created: '2026-05-01',
      }),
      todo('todo-b', { title: 'Book the venue', minutes: 20, due_day: '2026-10-06' }),
      todo('todo-c', { title: 'Call the plumber' }),
    ],
    done: [{ title: 'Send the invoice' }],
    habits: [
      habit('habit-run', { title: 'Run', target: 3, minutes: 40, last_week: 1, before: 2 }),
      habit('habit-read', { title: 'Read', cadence: 'daily', last_week: 4, before: 10 }),
      habit('habit-smoke', { title: 'No cigarettes', breaking: true }),
    ],
    dated: [
      {
        type: 'note',
        id: 'note-conf',
        what: 'event',
        title: 'Conference',
        date: '2026-10-28',
        end: '2026-10-29',
        time: '09:00',
      },
      {
        type: 'calendar_event',
        id: 'event-dinner',
        what: 'event',
        title: 'Dinner',
        date: '2026-10-09',
        end: null,
        time: '19:30',
      },
    ],
    calendar: {
      connected: true,
      days: DAYS.map((day, i) => ({
        day,
        meetings:
          i === 0
            ? [
                { title: 'Standup', start: 540, end: 570 },
                { title: 'Review', start: 560, end: 620 },
              ]
            : [],
        all_day: i === 4 ? ['Offsite'] : [],
      })),
    },
    last_review: null,
    ...over,
  };
}

/** A whole reply the check takes as it is, to change one part of in a test. */
function reply(over = {}) {
  return {
    challenge: {
      headline: 'The report needs a start',
      why: 'It is due on the twentieth and has moved eleven times.',
    },
    evidence: [
      { figure: '11', label: 'times the report has moved' },
      { figure: '3', label: 'open todos' },
    ],
    coming_off: 'You sent the invoice last week.',
    coming_up: [
      { about: 'd2', when: '2026-10-28', what: 'The conference' },
      { about: 'd1', when: '2026-10-09', what: 'Dinner on Friday' },
    ],
    priority_options: [
      { text: 'Start the report', why: 'It is due soon.', gremly_pick: true, item_ids: ['t2'] },
      { text: 'Book the venue', why: 'It is on Tuesday.', gremly_pick: false, item_ids: ['t1'] },
    ],
    intention_drafts: [
      'I will start the report early.',
      'I will keep evenings free.',
      'I will ask for help.',
    ],
    free_hours_guess: {
      normal_day: 2,
      busy_day: 0.5,
      weekend_day: 4,
      reason: 'A guess from your calendar.',
    },
    busy_days: ['2026-10-05'],
    milestones: [
      {
        goal: 'Be ready for the conference',
        about: 'd2',
        steps: [
          { title: 'Draft the talk', by: '2026-10-14', minutes: 90, kind: 'todo' },
          { title: 'See how the talk is going', by: '2026-10-21', minutes: 5, kind: 'check_in' },
        ],
      },
    ],
    needs_you: [
      {
        item_ids: ['t2'],
        title: 'The report',
        stuck_because: 'It keeps moving.',
        question: 'What is the first page?',
      },
    ],
    habit_days: [
      { habit_id: 'h1', days: ['2026-10-06', '2026-10-08'], reason: 'Two runs builds back.' },
    ],
    ...over,
  };
}

const check = (out, g = gathered()) => checkRead(out, g, renderRead(g));

describe('small sums', () => {
  it('says a length in hours and minutes', () => {
    expect(lengthWords(45)).toBe('45 minutes');
    expect(lengthWords(60)).toBe('1 hour');
    expect(lengthWords(330)).toBe('5 hours 30 minutes');
    expect(lengthWords(0)).toBe('0 minutes');
  });

  it('counts months back, staying inside a shorter month', () => {
    expect(monthsBefore('2026-10-04', 3)).toBe('2026-07-04');
    expect(monthsBefore('2026-05-31', 3)).toBe('2026-02-28');
    expect(monthsBefore('2026-01-15', 3)).toBe('2025-10-15');
  });

  it('counts booked time once where meetings overlap', () => {
    expect(
      bookedMinutes([
        { start: 540, end: 570 },
        { start: 560, end: 620 },
      ]),
    ).toBe(80);
    expect(
      bookedMinutes([
        { start: 540, end: 600 },
        { start: 550, end: 560 },
        { start: 700, end: 730 },
      ]),
    ).toBe(90);
    expect(bookedMinutes([])).toBe(0);
  });
});

describe('what the read is given', () => {
  it('shapes a todo from its row', () => {
    expect(
      shapeTodo({
        id: 'x',
        name: 'Renew passport',
        title: 'old title',
        due_day: '2026-10-06',
        target_date: '2026-02-30',
        time_estimate_minutes: 0,
        created_at: '2026-06-02T08:00:00Z',
        sweep_reschedule_count: 12,
        resurface_at: '2026-10-20',
      }),
    ).toEqual({
      id: 'x',
      title: 'Renew passport',
      minutes: null,
      created: '2026-06-02',
      moved: 12,
      due_day: '2026-10-06',
      // a date that does not exist is no date
      deadline: null,
      back_on: '2026-10-20',
      timed: false,
    });
    // a time of day makes it an appointment
    expect(shapeTodo({ id: 'y', due_day: '2026-10-06', due_time: '10:00' }).timed).toBe(true);
  });

  it('counts the days a habit was logged, last week and the three weeks before', () => {
    const progress = [
      { habit_id: 'h', occurred_day: '2026-10-04' },
      { habit_id: 'h', occurred_day: '2026-10-04' },
      { habit_id: 'h', occurred_day: '2026-09-28' },
      { habit_id: 'h', occurred_day: '2026-09-27' },
      { habit_id: 'h', occurred_day: '2026-09-07' },
      { habit_id: 'h', occurred_day: '2026-09-06' },
      { habit_id: 'other', occurred_day: '2026-10-03' },
    ];
    const h = shapeHabit(
      { id: 'h', name: 'Swim', cadence: 'weekly', target_per_period: 2, time_estimate_minutes: 45 },
      { progress, plans: [{ habit_id: 'h', planned_date: '2026-10-07' }], today: TODAY },
    );
    expect(h).toMatchObject({
      title: 'Swim',
      cadence: 'weekly',
      target: 2,
      minutes: 45,
      // the same day logged twice is one day; the 6th of September is past four weeks
      last_week: 2,
      before: 2,
      planned: ['2026-10-07'],
      breaking: false,
    });
    expect(shapeHabit({ id: 'd' }, { today: TODAY })).toMatchObject({
      cadence: 'daily',
      target: null,
    });
    expect(shapeHabit({ id: 'm', cadence: 'monthly' }, { today: TODAY }).target).toBe(1);
    // a weekly habit with no count kept aims for one, never for nothing
    expect(
      shapeHabit({ id: 'z', cadence: 'weekly', target_per_period: 0 }, { today: TODAY }).target,
    ).toBe(1);
  });

  it('lets a habit go on no more days than they aim for', () => {
    expect(habitAllowance(habit('a', { target: 3 }), DAYS)).toBe(3);
    // fewer days left than the target
    expect(habitAllowance(habit('a', { target: 5 }), DAYS.slice(4))).toBe(3);
    expect(habitAllowance(habit('a', { cadence: 'daily' }), DAYS)).toBe(7);
    // set days: Monday, Wednesday and Friday
    expect(habitAllowance(habit('a', { cadence: 'daily', days_active: [1, 3, 5] }), DAYS)).toBe(3);
    expect(habitAllowance(habit('a', { breaking: true }), DAYS)).toBe(0);
    // it only starts on Thursday
    expect(habitAllowance(habit('a', { cadence: 'daily', start_date: '2026-10-08' }), DAYS)).toBe(
      4,
    );
  });

  it('says how a habit is going in a sentence', () => {
    expect(
      habitSentence(habit('a', { target: 3, minutes: 45, last_week: 1, before: 0 }), TODAY),
    ).toBe(
      'aiming for 3 a week, about 45 minutes each, done 1 time last week and 0 times in the three weeks before.',
    );
    expect(habitSentence(habit('a', { cadence: 'daily', last_week: 4, before: 10 }), TODAY)).toBe(
      'aiming for every day, done 4 times last week and 10 times in the three weeks before.',
    );
    expect(habitSentence(habit('a', { cadence: 'daily', days_active: [1, 3] }), TODAY)).toContain(
      'aiming for 2 set days a week',
    );
    expect(habitSentence(habit('a', { breaking: true }), TODAY)).toBe(
      'a habit they are breaking, so it is not put on days.',
    );
    expect(
      habitSentence(habit('a', { start_date: '2026-09-28', planned: ['2026-10-06'] }), TODAY),
    ).toContain('They started it on 2026-09-28. Already planned on 2026-10-06.');
  });
});

describe('the figures', () => {
  it('are worked out over every open todo', () => {
    const todos = [
      todo('a', { minutes: 90, created: '2026-01-10', moved: 10 }),
      todo('b', { minutes: null, created: '2026-07-03', moved: 9, due_day: '2026-10-01' }),
      todo('c', { minutes: 60, created: '2026-07-05', deadline: '2026-10-07' }),
      todo('d', { created: '2026-10-01', due_day: '2026-10-05', deadline: '2026-09-30' }),
    ];
    expect(figuresOf(todos, TODAY, DAYS)).toEqual({
      open: 4,
      // 90 + 30 + 60 + 30 minutes: a todo with no length counts as thirty
      hours: 4,
      // added before 4 July
      old: 2,
      moved: 1,
      gone: 2,
      dated: 2,
    });
    expect(figuresOf([], TODAY, DAYS)).toMatchObject({ open: 0, hours: 0 });
  });

  it('lists every todo while they fit, the dated ones first', () => {
    const g = gathered();
    expect(todosToList(g.todos, TODAY).map((t) => t.id)).toEqual(['todo-b', 'todo-a', 'todo-c']);
  });

  it('lists the dated, the most moved, the oldest and the newest when there are too many', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      todo(`n${String(i).padStart(3, '0')}`, {
        created: `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`,
        moved: i % 50 === 0 ? 20 : 0,
        deadline: i % 60 === 0 ? '2026-10-10' : null,
      }),
    );
    const listed = todosToList(many, TODAY);
    expect(listed).toHaveLength(TODO_LIST_MAX);
    const ids = new Set(listed.map((t) => t.id));
    // every dated one and every one moved many times is in
    for (const t of many.filter((x) => x.deadline || x.moved)) expect(ids.has(t.id)).toBe(true);
    const byAge = [...many].sort((a, b) => a.created.localeCompare(b.created));
    expect(ids.has(byAge[0].id)).toBe(true);
    expect(ids.has(byAge[byAge.length - 1].id)).toBe(true);
    // the same list every time
    expect(todosToList(many, TODAY).map((t) => t.id)).toEqual(listed.map((t) => t.id));
    // and the figures still count them all
    const r = renderRead(gathered({ todos: many }));
    expect(r.figures.open).toBe(300);
    expect(r.listed).toBe(TODO_LIST_MAX);
    expect(r.text).toContain(
      `Only ${TODO_LIST_MAX} of them are listed below: the dated ones, the most moved, the oldest and the newest.`,
    );
  });
});

describe('what the model reads', () => {
  const r = renderRead(gathered());

  it('gives now, the days being planned and their days off', () => {
    expect(r.text).toContain('NOW: Sunday 2026-10-04, 3:10pm.');
    expect(r.text).toContain(
      'THE DAYS BEING PLANNED: 7 days, Monday 2026-10-05 to Sunday 2026-10-11.',
    );
    expect(r.text).toContain('Saturday 2026-10-10 (a day off); Sunday 2026-10-11 (a day off)');
  });

  it('keeps the order it was tested in', () => {
    const order = [
      'NOW:',
      'WORLDS,',
      'CHAPTERS',
      'DATED THINGS AHEAD',
      'THE CALENDAR',
      'HABITS',
      'THE WEEK JUST GONE',
      'FIGURES',
      'OPEN TODOS',
    ].map((h) => r.text.indexOf(`\n${h}`) + (h === 'NOW:' ? 1 : 0));
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]))).toBe(true);
  });

  it('states the figures exactly', () => {
    expect(r.text).toContain(
      'FIGURES (worked out exactly, use these rather than adding up yourself): 3 open todos adding up to about 3 hours. 1 of them were added more than three months ago. 1 have been moved to another day ten times or more. 0 have a day or a date that has already gone by. 1 have a day or a date on the days being planned.',
    );
    expect(renderRead(gathered({ todos: [] })).text).toContain(
      'FIGURES (worked out exactly): they have no open todos.',
    );
  });

  it('gives every todo, habit and dated thing a short id', () => {
    expect([...r.refs.todos]).toEqual([
      ['t1', 'todo-b'],
      ['t2', 'todo-a'],
      ['t3', 'todo-c'],
    ]);
    expect([...r.refs.habits.keys()]).toEqual(['h1', 'h2', 'h3']);
    // a todo with a date can be what a milestone leads up to, under its own id
    expect(r.refs.dated.get('t2')).toEqual({
      type: 'todo',
      id: 'todo-a',
      title: 'Write the report',
      date: '2026-10-20',
    });
    expect(r.refs.dated.get('d1')).toMatchObject({ id: 'event-dinner', date: '2026-10-09' });
    expect(r.refs.dated.get('d2')).toMatchObject({ id: 'note-conf', date: '2026-10-28' });
    expect(r.text).toContain('d1 | 2026-10-09 Friday, in 5 days, at 7:30pm | event | Dinner');
    expect(r.text).toContain(
      't2 | 2026-10-20 Tuesday, in 16 days | a todo is due by | Write the report',
    );
    expect(r.text).toContain(
      'd2 | 2026-10-28 Wednesday, in 24 days, until 2026-10-29, at 9am | event | Conference',
    );
    expect(r.text).toContain(
      't2 | Write the report | 120 minutes | added 2026-05-01 | moved 11 times | due by 2026-10-20',
    );
    expect(r.text).toContain(
      't3 | Call the plumber | no length set | added 2026-09-20 | never moved | no date',
    );
  });

  it('gives the calendar with booked time worked out, or says none is connected', () => {
    expect(r.text).toContain(
      'Monday 2026-10-05: 2 meetings, 1 hour 20 minutes booked: 9am to 9:30am Standup; 9:20am to 10:20am Review.',
    );
    expect(r.text).toContain('Friday 2026-10-09: nothing booked. All day: Offsite.');
    expect(r.text).toContain('Across those days: 2 meetings, 1 hour 20 minutes booked.');
    expect(renderRead(gathered({ calendar: { connected: false, days: [] } })).text).toContain(
      'THE CALENDAR: none is connected, so their meetings are not known.',
    );
  });

  it('gives last week from its review, when there was one', () => {
    expect(r.text).toContain('Todos done in the last seven days (1): Send the invoice.');
    // with no review to go on, nothing is said about one
    expect(r.text).not.toContain('weekly review');
    const last = {
      week_start: '2026-09-21',
      reviewed: true,
      intention: 'Leave on time',
      priorities: [
        { text: 'Start the report', of: 3, done: 1 },
        { text: 'Rest', of: 0, done: 0 },
      ],
      hours: { normal_day: 2, busy_day: 0.5, weekend_day: 4 },
    };
    const withLast = renderRead(gathered({ done: [], last_review: last })).text;
    expect(withLast).toContain('No todos were done in the last seven days.');
    // said by the week it planned: it was two weeks ago here, not last week
    expect(withLast).toContain('Their last weekly review planned the week starting 2026-09-21.');
    expect(withLast).toContain('Their intention for the week starting 2026-09-21: "Leave on time"');
    expect(withLast).toContain(
      'Their priorities in that review: Start the report (1 of 3 todos done); Rest.',
    );
    expect(withLast).toContain(
      'The free hours they set in that review: 2 on a normal day, 0.5 on a busy day, 4 on a day off.',
    );
    // an extra review reads this same week's own review
    expect(
      renderRead(gathered({ last_review: { ...last, week_start: '2026-10-05' } })).text,
    ).toContain('Their last weekly review planned the week starting 2026-10-05, this same week.');
    // an intention kept with no review
    const only = renderRead(
      gathered({
        last_review: {
          week_start: '2026-09-28',
          reviewed: false,
          intention: 'Rest more',
          priorities: [],
          hours: null,
        },
      }),
    ).text;
    expect(only).not.toContain('Their last weekly review');
    expect(only).toContain('Their intention for the week starting 2026-09-28: "Rest more"');
  });

  it('says so when there are more dated things than it lists, and keeps what Gremly holds', () => {
    const held = Array.from({ length: 58 }, (_, i) => ({
      type: 'note',
      id: `note-${String(i).padStart(2, '0')}`,
      what: 'note',
      title: `Note ${i}`,
      date: '2026-11-10',
      end: null,
      time: null,
    }));
    const wholeDays = Array.from({ length: 10 }, (_, i) => ({
      type: 'synced_event',
      id: `cal-${i}`,
      what: 'on their calendar, all day',
      title: `Bin day ${i}`,
      date: '2026-10-06',
      end: null,
      time: null,
    }));
    // 58 held, a todo due by a date, and ten whole days: one over what is listed
    const many = renderRead(gathered({ dated: [...wholeDays, ...held] }));
    const lines = many.text.split('\n');
    expect(lines.filter((l) => l.includes('| note | Note ')).length).toBe(58);
    expect(lines.filter((l) => l.includes('Bin day')).length).toBe(1);
    expect(many.text).toContain('9 more dated things are not listed.');
    expect(r.text).not.toContain('not listed.');
  });
});

describe('the prompt', () => {
  const system = readSystem({ first_name: 'Robin' });

  it('is the same for everyone, with the person after it', () => {
    expect(readSystem({ first_name: 'Ada' }).fixed).toBe(system.fixed);
    expect(system.varying).toBe('Their first name is Robin.');
    expect(readSystem(null).varying).toBe('Their name is not known.');
  });

  it('carries the health rule and the part week rule', () => {
    expect(system.fixed).toContain('Some of what you know is about their health, body or mind.');
    expect(system.fixed).toContain(
      'The days being planned may be the rest of this week rather than a whole week.',
    );
  });

  it('has no dashes, in the rules or in the schema', () => {
    const dash = /[\u2013\u2014]| - |--/;
    expect(system.fixed).not.toMatch(dash);
    expect(JSON.stringify(READ_SCHEMA)).not.toMatch(dash);
  });
});

describe('what comes back', () => {
  it('is kept with real ids, real days and dates taken from their own items', () => {
    const { read, dropped } = check(reply());
    expect(dropped).toEqual([]);
    expect(read.challenge.headline).toBe('The report needs a start');
    expect(read.priority_options.map((p) => p.item_ids)).toEqual([['todo-a'], ['todo-b']]);
    expect(read.needs_you[0].item_ids).toEqual(['todo-a']);
    expect(read.habit_days).toEqual([
      {
        habit_id: 'habit-run',
        days: ['2026-10-06', '2026-10-08'],
        reason: 'Two runs builds back.',
      },
    ]);
    // in date order, each with the item it is
    expect(read.coming_up).toEqual([
      {
        when: '2026-10-09',
        what: 'Dinner on Friday',
        item: { type: 'calendar_event', id: 'event-dinner' },
      },
      { when: '2026-10-28', what: 'The conference', item: { type: 'note', id: 'note-conf' } },
    ]);
    expect(read.milestones).toEqual([
      {
        goal: 'Be ready for the conference',
        date: '2026-10-28',
        steps: [
          { title: 'Draft the talk', by: '2026-10-14', kind: 'todo', minutes: 90 },
          { title: 'See how the talk is going', by: '2026-10-21', kind: 'check_in', minutes: 5 },
        ],
        about: { type: 'note', id: 'note-conf', title: 'Conference' },
      },
    ]);
    expect(read.free_hours_guess).toEqual({
      normal_day: 2,
      busy_day: 0.5,
      weekend_day: 4,
      reason: 'A guess from your calendar.',
    });
    expect(read.busy_days).toEqual(['2026-10-05']);
  });

  it('drops an id it was never given, and counts it', () => {
    const { read, dropped } = check(
      reply({
        priority_options: [
          { text: 'Start', why: '', gremly_pick: true, item_ids: ['t2', 't99', 'todo-a'] },
        ],
        needs_you: [{ item_ids: ['t42'], title: 'Mystery', stuck_because: 'x', question: 'y' }],
        habit_days: [{ habit_id: 'h9', days: ['2026-10-06'], reason: '' }],
      }),
    );
    expect(read.priority_options[0].item_ids).toEqual(['todo-a']);
    expect(read.needs_you).toEqual([]);
    expect(read.habit_days).toEqual([]);
    expect(dropped.map((d) => `${d.what}:${d.why}`)).toEqual([
      'priority_item:unknown_id',
      'priority_item:unknown_id',
      'needs_you_item:unknown_id',
      'needs_you:no_items',
      'habit_days:unknown_id',
    ]);
  });

  it('keeps to the limits: five options, three picks, four figures, three drafts', () => {
    const option = (i) => ({ text: `Option ${i}`, why: '', gremly_pick: true, item_ids: [] });
    const { read, dropped } = check(
      reply({
        priority_options: [1, 2, 3, 4, 5, 6].map(option),
        evidence: [1, 2, 3, 4, 5].map((n) => ({ figure: `${n}`, label: 'things' })),
        intention_drafts: ['One.', 'Two.', 'Three.', 'Four.'],
      }),
    );
    expect(read.priority_options).toHaveLength(READ_LIMITS.priorities);
    expect(read.priority_options.map((p) => p.gremly_pick)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(read.evidence).toHaveLength(READ_LIMITS.evidence);
    expect(read.intention_drafts).toEqual(['One.', 'Two.', 'Three.']);
    expect(dropped.filter((d) => d.why === 'too_many').map((d) => d.what)).toEqual([
      'evidence',
      'priority_pick',
      'priority_pick',
      'priority',
      'intention',
    ]);
  });

  it('takes a coming up date from the data, and only one that is ahead and within six weeks', () => {
    const { read, dropped } = check(
      reply({
        coming_up: [
          // the model's own date for one of their items is not used
          { about: 'd1', when: '2026-12-25', what: 'Dinner' },
          { about: '', when: '2026-10-12', what: 'The clocks change soon' },
          { about: '', when: '2026-10-03', what: 'Yesterday' },
          { about: '', when: '2027-01-01', what: 'Too far' },
          { about: '', when: 'next Friday', what: 'Not a date' },
          { about: 'd77', when: '2026-10-13', what: 'An id it was not given' },
        ],
      }),
    );
    expect(read.coming_up).toEqual([
      { when: '2026-10-09', what: 'Dinner', item: { type: 'calendar_event', id: 'event-dinner' } },
      { when: '2026-10-12', what: 'The clocks change soon', item: null },
      { when: '2026-10-13', what: 'An id it was not given', item: null },
    ]);
    expect(dropped.map((d) => d.why)).toEqual([
      'date_outside',
      'date_outside',
      'date_outside',
      'unknown_id',
    ]);
  });

  it('keeps hours in half hours and busy days inside the days being planned', () => {
    const { read, dropped } = check(
      reply({
        free_hours_guess: { normal_day: 2.26, busy_day: -1, weekend_day: 40, reason: 'A guess.' },
        busy_days: ['2026-10-05', '2026-10-12', 'Monday', '2026-10-05'],
      }),
    );
    expect(read.free_hours_guess).toEqual({ normal_day: 2.5, reason: 'A guess.' });
    expect(read.busy_days).toEqual(['2026-10-05']);
    expect(dropped.map((d) => `${d.what}:${d.why}`)).toEqual([
      'free_hours:bad_value:busy_day',
      'free_hours:bad_value:weekend_day',
      'busy_day:day_outside',
      'busy_day:day_outside',
    ]);
    expect(check(reply({ free_hours_guess: null })).read.free_hours_guess).toBeNull();
  });

  it('only keeps a milestone for a dated thing more than a week out, with steps that lead up to it', () => {
    const step = (by, kind = 'todo') => ({ title: `By ${by}`, by, minutes: 30, kind });
    const { read, dropped } = check(
      reply({
        milestones: [
          // dinner is five days away
          { goal: 'Dinner', about: 'd1', steps: [step('2026-10-07')] },
          // nothing dated behind it
          { goal: 'Learn Spanish', about: '', steps: [step('2026-10-20')] },
          // a todo with a deadline can be led up to; one step is past it, one before today
          {
            goal: 'The report',
            about: 't2',
            steps: [
              step('2026-10-12'),
              step('2026-10-21'),
              step('2026-10-01'),
              step('2026-10-19', 'review'),
            ],
          },
          // no step survives
          { goal: 'The conference', about: 'd2', steps: [step('2026-11-30')] },
        ],
      }),
    );
    expect(read.milestones).toEqual([
      {
        goal: 'The report',
        date: '2026-10-20',
        steps: [{ title: 'By 2026-10-12', by: '2026-10-12', kind: 'todo', minutes: 30 }],
        about: { type: 'todo', id: 'todo-a', title: 'Write the report' },
      },
    ]);
    expect(dropped.map((d) => `${d.what}:${d.why}`)).toEqual([
      'milestone:within_a_week',
      'milestone:no_dated_thing',
      'milestone_step:step_outside',
      'milestone_step:step_outside',
      'milestone_step:bad_step',
      'milestone_step:step_outside',
      'milestone:no_steps',
    ]);
  });

  it('never plans a habit on more days than they aim for, or on a day it does not run', () => {
    const { read, dropped } = check(
      reply({
        habit_days: [
          {
            habit_id: 'h1',
            days: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
            reason: '',
          },
          { habit_id: 'h3', days: ['2026-10-06'], reason: 'A habit they are breaking' },
          { habit_id: 'h2', days: ['2026-10-06', '2026-10-20'], reason: '' },
          { habit_id: 'h2', days: ['2026-10-07'], reason: 'Twice' },
        ],
      }),
    );
    expect(read.habit_days).toEqual([
      { habit_id: 'habit-run', days: ['2026-10-05', '2026-10-06', '2026-10-07'], reason: '' },
      { habit_id: 'habit-read', days: ['2026-10-06'], reason: '' },
    ]);
    expect(dropped.map((d) => `${d.what}:${d.why}`)).toEqual([
      'habit_day:over_target',
      'habit_day:over_target',
      'habit_day:day_outside',
      'habit_days:twice',
    ]);
  });

  it('takes the dashes out of what Gremly wrote', () => {
    const { read } = check(
      reply({
        challenge: { headline: 'The report — again', why: 'It moved 11 times – a lot.' },
        coming_off: 'A  quiet   week.',
      }),
    );
    expect(read.challenge).toEqual({
      headline: 'The report, again',
      why: 'It moved 11 times, a lot.',
    });
    expect(read.coming_off).toBe('A quiet week.');
  });

  it('is no read at all without a challenge', () => {
    expect(() => check(reply({ challenge: { headline: '  ', why: 'x' } }))).toThrow(
      'the read came back without a challenge',
    );
    expect(() => check(null)).toThrow('the read came back without a challenge');
  });
});

describe('the call', () => {
  beforeEach(() => {
    jsonCall.mockResolvedValue({ output: reply(), model: 'gpt-6-luna' });
  });

  it('asks the weekly read model at medium effort and hands back the checked read', async () => {
    const g = gathered();
    const out = await runWeekRead({}, g);
    const asked = jsonCall.mock.calls[0][1];
    expect(asked.primary).toEqual({ provider: 'openai', model: 'gpt-6-luna' });
    expect(asked.fallback).toEqual({ provider: 'google', model: 'gemini-3.8-flash' });
    expect(asked.effort).toBe('medium');
    expect(asked.schema).toBe(READ_SCHEMA);
    expect(asked.user).toBe(renderRead(g).text);
    expect(out.model).toBe('gpt-6-luna');
    expect(out.prompt_version).toBe(WEEK_READ_VERSION);
    expect(out.dropped).toEqual([]);
    expect(out.figures).toEqual({
      open: 3,
      hours: 3,
      old: 1,
      moved: 1,
      gone: 0,
      dated: 1,
      listed: 3,
    });

    const kept = storedRead(g, out, new Date('2026-10-04T14:10:00Z'));
    expect(kept).toMatchObject({
      version: WEEK_READ_VERSION,
      made_at: '2026-10-04T14:10:00.000Z',
      made_on: TODAY,
      model: 'gpt-6-luna',
      effort: 'medium',
      first: '2026-10-05',
      last: '2026-10-11',
      figures: out.figures,
      dropped: 0,
    });
    expect(kept.challenge.headline).toBe('The report needs a start');
  });

  it('takes low effort for the midweek extra, and the read says which it was made at', async () => {
    const g = gathered();
    const out = await runWeekRead({}, g, { effort: 'low' });
    expect(jsonCall.mock.calls[0][1].effort).toBe('low');
    expect(jsonCall.mock.calls[0][1].thinking).toBe('low');
    expect(storedRead(g, out).effort).toBe('low');
  });
});

describe('the days they chose themselves', () => {
  const todos = [
    todo('a', { due_day: '2026-10-07' }),
    todo('b', { due_day: '2026-10-08' }),
    // a day that has gone by, a day in a week further out, and no day
    todo('c', { due_day: '2026-10-01' }),
    todo('d', { due_day: '2026-10-14' }),
    todo('e'),
  ];

  it('are every todo on a day being planned', () => {
    expect([...theirDays(gathered({ todos }))]).toEqual(['a', 'b']);
  });

  it('leave out a day that Gremly’s last spread of this same week gave, unless it has moved since', () => {
    const g = gathered({
      todos,
      last_review: {
        week_start: DAYS[0],
        reviewed: true,
        put: { a: '2026-10-07', b: '2026-10-06' },
      },
    });
    expect([...theirDays(g)]).toEqual(['b']);
  });

  it('are marked on the list the read is given, and only those', () => {
    const text = renderRead(gathered({ todos })).text;
    expect(text).toContain('| day 2026-10-07, which they chose');
    expect(text).toContain('| day 2026-10-08, which they chose');
    expect(text).toContain('| day 2026-10-01\n');
    expect(text).toContain('| day 2026-10-14\n');
    // the spread says which are still theirs, once they may have freed some
    const some = renderRead(gathered({ todos }), { theirs: new Set(['b']) }).text;
    expect(some).toContain('| day 2026-10-07\n');
    expect(some).toContain('| day 2026-10-08, which they chose');
  });

  it('are theirs to decide, which the read is told', () => {
    expect(readSystem({ first_name: 'Robin' }).fixed).toContain(
      'Some todos are on a day they chose themselves. Those days are their own decisions and are not yours to change: take them as given when you weigh how much the week already holds.',
    );
  });
});
