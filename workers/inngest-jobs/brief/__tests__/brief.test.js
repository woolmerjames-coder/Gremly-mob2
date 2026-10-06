/**
 * @jest-environment node
 *
 * The brief's data rules, in the worker: the offer, behind this week, the
 * shape of the day, the ID check, yesterday's reaction and when a brief is due.
 */
import { decideOffer, planLabel, questionButtons } from '../offer';
import { dayOfWeekNumber, isBehindThisWeek, mondayOf, weeklyTarget } from '../behind';
import {
  clashesOf,
  dayPartAt,
  isCancelledEntry,
  ritualDayFor,
  shapeOfDay,
  minutesIn,
  localStartIso,
} from '../data';
import {
  checkRefs,
  clockTime,
  noDashes,
  renderBriefInput,
  stripRefs,
  sweepLine,
  sweptWhen,
} from '../writer';
import { summariseThread, summariseWrap } from '../reaction';
import { dueForBrief, fallbackOffer } from '../index';

jest.mock('../../context/daily', () => ({ buildDcoV4: jest.fn(), writeDco: jest.fn() }));

const free = (pairs) => pairs.map(([from, to]) => ({ from, to }));

describe('offer rule', () => {
  const base = {
    returnDay: false,
    overdue: 0,
    unsorted: 2,
    candidates: 4,
    freeWindows: free([[795, 1320]]),
    now: 465,
  };

  it('does not offer to plan a day that already has a locked plan', () => {
    expect(decideOffer({ ...base, planned: 3 }).kind).toBe('none');
    // Sweep still comes first when it is needed
    expect(decideOffer({ ...base, planned: 3, overdue: 2 }).kind).toBe('sweep');
  });

  it('plans on a tidy day with a clear stretch ahead', () => {
    const o = decideOffer(base);
    expect(o.kind).toBe('plan');
    expect(o.buttons.map((b) => b.label)).toEqual([
      'Plan my afternoon',
      'What can wait?',
      'Not today',
    ]);
    expect(o.buttons[0].primary).toBe(true);
  });

  it('offers Sweep first with anything past its date, or more than five unsorted', () => {
    expect(decideOffer({ ...base, overdue: 1 }).kind).toBe('sweep');
    expect(decideOffer({ ...base, unsorted: 6 }).kind).toBe('sweep');
    expect(decideOffer({ ...base, unsorted: 5 }).kind).toBe('plan');
    expect(decideOffer({ ...base, overdue: 3 }).buttons.map((b) => b.label)).toEqual([
      'Sweep first',
      'Plan anyway',
      'Not today',
    ]);
  });

  it('on a return day offers Sweep first kindly, with Catch me up and Just today', () => {
    const o = decideOffer({ ...base, returnDay: true, overdue: 3 });
    expect(o.kind).toBe('return');
    expect(o.buttons.map((b) => b.label)).toEqual(['Sweep first', 'Catch me up', 'Just today']);
  });

  it('a return day with nothing waiting falls back to the usual rule', () => {
    expect(decideOffer({ ...base, returnDay: true, unsorted: 0 }).kind).toBe('plan');
  });

  it('offers nothing without a 45 minute stretch or anything to plan', () => {
    expect(decideOffer({ ...base, freeWindows: free([[795, 835]]) }).kind).toBe('none');
    expect(decideOffer({ ...base, candidates: 0 }).kind).toBe('none');
    // the stretch has to be ahead of now
    expect(decideOffer({ ...base, freeWindows: free([[600, 700]]), now: 680 }).kind).toBe('none');
  });

  it('names the plan for the part of the day the clear stretch starts in', () => {
    expect(planLabel(9 * 60)).toBe('Plan my day');
    expect(planLabel(13 * 60)).toBe('Plan my afternoon');
    expect(planLabel(18 * 60)).toBe('Plan my evening');
  });

  it("turns a question's answers into buttons, with Something else and Skip", () => {
    const b = questionButtons(['Friday', 'Saturday', 'friday', '']);
    expect(b.map((x) => x.label)).toEqual(['Friday', 'Saturday', 'Something else', 'Skip']);
    expect(b[1]).toMatchObject({ action: 'answer', value: 'Saturday' });
  });

  it("has words for every offer when the writer's cannot be used", () => {
    for (const k of ['return', 'sweep', 'plan', 'none']) expect(fallbackOffer(k)).toBeTruthy();
  });
});

describe('behind this week (worker copy of the app rule)', () => {
  it('matches the app', () => {
    expect(mondayOf('2026-09-30')).toBe('2026-09-28');
    expect(mondayOf('2026-10-04')).toBe('2026-09-28');
    expect(dayOfWeekNumber('2026-09-30')).toBe(3);
    const h = (t) => ({ cadence: 'weekly', target_per_period: t, subtype: 'start_habit' });
    expect(isBehindThisWeek(h(3), 0, 3)).toBe(true);
    expect(isBehindThisWeek(h(2), 0, 3)).toBe(false);
    expect(weeklyTarget({ cadence: 'daily' })).toBeNull();
    expect(
      weeklyTarget({ cadence: 'weekly', subtype: 'break_habit', target_per_period: 3 }),
    ).toBeNull();
  });
});

describe('the shape of the day', () => {
  const meetings = [
    { id: 'a', start: 480, end: 510 },
    { id: 'b', start: 510, end: 555 },
    { id: 'g', start: 720, end: 750 },
    { id: 'h', start: 735, end: 795 },
  ];

  it('merges busy time and finds the clear stretches from 8am to 10pm', () => {
    const s = shapeOfDay(meetings);
    expect(s.busy).toEqual([
      { from: 480, to: 555 },
      { from: 720, to: 795 },
    ]);
    expect(s.free).toEqual([
      { from: 555, to: 720 },
      { from: 795, to: 1320 },
    ]);
  });

  it('finds clashes', () => {
    expect(clashesOf(meetings).map(([x, y]) => `${x.id}-${y.id}`)).toEqual(['g-h']);
  });

  it('knows the part of the day and the ritual day', () => {
    expect(dayPartAt(465)).toBe('morning');
    expect(dayPartAt(720)).toBe('afternoon');
    expect(dayPartAt(1030)).toBe('evening');
    expect(ritualDayFor('2026-10-01', 150, 3)).toBe('2026-09-30');
    expect(ritualDayFor('2026-10-01', 200, 3)).toBe('2026-10-01');
    expect(ritualDayFor('2026-10-01', 10, 0)).toBe('2026-10-01');
  });

  it("reads local time in the person's timezone", () => {
    expect(minutesIn('America/Los_Angeles', '2026-09-30T14:45:00Z')).toBe(7 * 60 + 45);
    expect(localStartIso('America/Los_Angeles', '2026-09-30')).toBe('2026-09-30T07:00:00.000Z');
    expect(localStartIso('Europe/London', '2026-10-01')).toBe('2026-09-30T23:00:00.000Z');
  });
});

describe('when a brief is due', () => {
  it('is 20 minutes before the morning time, until noon', () => {
    const pref = { timezone: 'America/Los_Angeles', morning_time: '08:00:00' };
    expect(dueForBrief(pref, new Date('2026-10-01T14:39:00Z'))).toBeNull(); // 7:39
    expect(dueForBrief(pref, new Date('2026-10-01T14:40:00Z'))).toBe('2026-10-01'); // 7:40
    expect(dueForBrief(pref, new Date('2026-10-01T18:59:00Z'))).toBe('2026-10-01'); // 11:59
    expect(dueForBrief(pref, new Date('2026-10-01T19:00:00Z'))).toBeNull(); // noon
    expect(dueForBrief({}, new Date('2026-10-01T14:45:00Z'))).toBe('2026-10-01');
  });
});

describe("the writer's ID check", () => {
  const refs = new Map([
    ['c1', { type: 'calendar', id: 'cal-1' }],
    ['t1', { type: 'todo', id: 'todo-1' }],
  ]);

  it('keeps lines whose refs were all in the input and drops the rest', () => {
    const out = checkRefs(
      {
        lines: [
          { text: 'Standup at 8.', refs: ['c1'] },
          { text: 'And the dentist.', refs: ['t9'] },
          { text: 'Clear from 1:15.', refs: [] },
        ],
        offer_refs: ['t1'],
      },
      refs,
    );
    expect(out.lines).toEqual([
      { text: 'Standup at 8.', ids: ['cal-1'] },
      { text: 'Clear from 1:15.', ids: [] },
    ]);
    expect(out.dropped).toEqual([{ text: 'And the dentist.', bad: ['t9'] }]);
    expect(out.offerOk).toBe(true);
    expect(checkRefs({ lines: [], offer_refs: ['x'] }, refs).offerOk).toBe(false);
  });

  it('takes refs out of the text', () => {
    expect(stripRefs('Checkout at 10am, then the flight. [c1, c2]')).toBe(
      'Checkout at 10am, then the flight.',
    );
    expect(stripRefs('Pack the charger (t1) before you go.')).toBe(
      'Pack the charger before you go.',
    );
    expect(stripRefs('Call Mum at 6pm.')).toBe('Call Mum at 6pm.');
    const out = checkRefs({ lines: [{ text: 'Standup at 8 [c1].', refs: ['c1'] }] }, refs);
    expect(out.lines[0].text).toBe('Standup at 8.');
  });

  it('writes times the way people say them', () => {
    expect(clockTime(480)).toBe('8am');
    expect(clockTime(510)).toBe('8:30am');
    expect(clockTime(720)).toBe('12pm');
    expect(clockTime(0)).toBe('12am');
    expect(clockTime(1335)).toBe('10:15pm');
  });

  it('never lets a dash through', () => {
    expect(noDashes('Busy morning — then clear')).toBe('Busy morning, then clear');
    expect(noDashes('8–9')).toBe('8, 9');
  });

  it('gives the model refs for what it may name', () => {
    const g = {
      today: '2026-09-30',
      now: 465,
      part: 'morning',
      ret: null,
      meetings: [
        { id: 'cal-1', title: 'NA standup', start: 480, end: 510 },
        { id: 'cal-2', title: '1:1', start: 720, end: 750 },
        { id: 'cal-3', title: 'Paid search', start: 735, end: 795 },
      ],
      allDay: [],
      clashes: [
        [
          { id: 'cal-2', end: 750 },
          { id: 'cal-3', end: 795 },
        ],
      ],
      busy: [
        { from: 480, to: 510 },
        { from: 720, to: 795 },
      ],
      free: [
        { from: 510, to: 720 },
        { from: 795, to: 1320 },
      ],
      dayShape: null,
      todosDue: [{ id: 'todo-1', title: 'Buy Oat Milk' }],
      habitsForToday: [{ id: 'hab-1', title: 'Social posts', done: 0, target: 3, behind: true }],
      claims: [],
      reach: {
        type: 'fact',
        id: 'fact-9',
        statement: 'Car service light is on',
        why: 'They mentioned it last week',
        facts: [],
      },
      anchors: [{ date: '2026-10-13', label: 'Anniversary with Dave', short_label: 'Anniversary' }],
      overdue: 0,
      unsorted: 2,
      reaction: null,
      question: null,
    };
    const offer = decideOffer({
      returnDay: false,
      overdue: 0,
      unsorted: 2,
      candidates: 3,
      freeWindows: g.free,
      now: g.now,
    });
    const { text, refs: r } = renderBriefInput(g, offer);
    expect(text).toContain('c2 overlaps c3');
    expect(text).toContain('TIME NOW: 7:45am');
    expect(text).toContain('c1 | 8am to 8:30am | still ahead | NA standup');
    expect(text).toContain('clear stretches 8:30am to 12pm, 1:15pm to 10pm');
    expect(text).toContain('t1 | Buy Oat Milk');
    expect(text).toContain('behind for the week');
    expect(text).toContain('r1 | Car service light is on');
    expect(text).toContain('"Plan my day" is offered');
    expect(r.get('r1')).toEqual({ type: 'fact', id: 'fact-9' });
  });

  it('leaves out clashes that are over and starts a stretch that has begun from now', () => {
    const g = {
      today: '2026-09-30',
      now: 760,
      part: 'afternoon',
      ret: null,
      meetings: [
        { id: 'cal-1', title: 'Standup', start: 540, end: 600 },
        { id: 'cal-2', title: 'Fee planning', start: 570, end: 600 },
      ],
      allDay: [],
      clashes: [
        [
          { id: 'cal-1', end: 600 },
          { id: 'cal-2', end: 600 },
        ],
      ],
      busy: [{ from: 540, to: 600 }],
      free: [
        { from: 480, to: 540 },
        { from: 600, to: 1320 },
      ],
      dayShape: null,
      todosDue: [],
      habitsForToday: [],
      claims: [],
      reach: null,
      anchors: [],
      overdue: 0,
      unsorted: 0,
      reaction: null,
      question: null,
    };
    const offer = decideOffer({
      returnDay: false,
      overdue: 0,
      unsorted: 0,
      candidates: 1,
      freeWindows: g.free,
      now: g.now,
    });
    const { text } = renderBriefInput(g, offer);
    expect(text).toContain('CLASHES STILL AHEAD: none.');
    expect(text).toContain('clear stretches now to 10pm');
    expect(text).toContain('the clear stretch from now');

    // a plan made last night, and the wrap up it was made in
    const planned = {
      ...g,
      planned: [{ type: 'todo', id: 'todo-7', start: 900, title: 'Call the bank' }],
      wrap: "LAST NIGHT'S WRAP UP: they finished it.",
    };
    const none = decideOffer({
      ...offer,
      returnDay: false,
      overdue: 0,
      unsorted: 0,
      candidates: 1,
      freeWindows: g.free,
      now: g.now,
      planned: 1,
    });
    const t2 = renderBriefInput(planned, none).text;
    expect(t2).toContain(
      'ALREADY PLANNED FOR TODAY (they said yes to this plan earlier, and it is on the day card; ref | time | title):\np1 | 3pm | Call the bank',
    );
    expect(t2).toContain("LAST NIGHT'S WRAP UP: they finished it.");
    expect(t2).toContain('They already said yes to a plan for today');
    expect(t2).not.toMatch(/locked/i);
  });
});

describe("yesterday's reaction", () => {
  it('says what they did with the thread, without judging it', () => {
    const msgs = [
      { role: 'assistant', content: 'Morning', metadata_json: { type: 'brief-text' } },
      { role: 'user', content: 'Plan my afternoon', metadata_json: { type: 'brief-reply' } },
      {
        role: 'system',
        metadata_json: {
          type: 'brief-plan',
          status: 'replaced',
          items: [
            { id: 'a', title: 'Social posts', start: 795 },
            { id: 'b', title: 'Oat milk', start: 930 },
            { id: 'c', title: 'Run', start: 1050 },
          ],
        },
      },
      { role: 'user', content: 'move the run after 6', metadata_json: null },
      {
        role: 'system',
        metadata_json: {
          type: 'brief-plan',
          status: 'locked',
          items: [
            { id: 'a', title: 'Social posts', start: 795 },
            { id: 'c', title: 'Run', start: 1080 },
          ],
        },
      },
    ];
    const s = summariseThread({ seen_at: '2026-09-30T15:00:00Z' }, msgs);
    expect(s).toContain('they opened it');
    expect(s).toContain('tapped "Plan my afternoon"');
    expect(s).toContain('said yes to a plan: Social posts at 1:15pm, Run at 6pm');
    expect(s).toContain('took out Oat milk');
    expect(s).toContain('moved Run');
    expect(s).toContain('said "move the run after 6"');
    expect(summariseThread({}, [])).toBe('they did not open it');
  });

  it('leaves the evening wrap up out: it is not a reaction to the brief', () => {
    const msgs = [
      { role: 'assistant', content: 'Morning', metadata_json: { type: 'brief-text' } },
      { role: 'user', content: 'Not today', metadata_json: { type: 'brief-reply' } },
      // the evening, in the same thread
      { role: 'assistant', content: 'Evening', metadata_json: { type: 'brief-text', wrap: true } },
      { role: 'user', content: 'Sweep now', metadata_json: { type: 'brief-reply', wrap: true } },
      {
        role: 'user',
        content: 'Tired but pleased with today.',
        metadata_json: { type: 'brief-reply', wrap: true },
      },
      // Plan tomorrow, made at the close
      {
        role: 'system',
        metadata_json: {
          type: 'brief-plan',
          status: 'locked',
          date: '2026-10-01',
          items: [{ id: 'a', title: 'Car service', start: 510 }],
        },
      },
    ];
    const s = summariseThread({ seen_at: '2026-09-30T15:00:00Z', ritual_day: '2026-09-30' }, msgs);
    expect(s).toBe('they opened it; tapped "Not today"');
  });

  it('leaves the weekly review out too: its taps and what was typed in it are not about the brief', () => {
    const week = { week: true };
    const msgs = [
      { role: 'assistant', content: 'Morning', metadata_json: { type: 'brief-text' } },
      { role: 'user', content: 'Not today', metadata_json: { type: 'brief-reply' } },
      // the weekly review, in the same thread
      {
        role: 'system',
        content: '',
        metadata_json: { type: 'week-card', card: 'opening', ...week },
      },
      {
        role: 'assistant',
        content: 'Got ten minutes?',
        metadata_json: { type: 'brief-offer', ...week },
      },
      { role: 'user', content: "Let's do it", metadata_json: { type: 'brief-reply', ...week } },
      {
        role: 'user',
        content: 'My sister is staying on Thursday',
        metadata_json: { type: 'brief-reply', action: 'week_typed', ...week },
      },
    ];
    const s = summariseThread({ seen_at: '2026-10-04T15:00:00Z', ritual_day: '2026-10-04' }, msgs);
    expect(s).toBe('they opened it; tapped "Not today"');
  });
});

describe("last night's wrap up, for the morning brief", () => {
  const base = { started_at: '2026-10-08T04:10:00Z', items: [], decisions: [] };

  it('says how it ended, what was sorted and what moved to today, by name', () => {
    const s = summariseWrap(
      {
        ...base,
        step: 'done',
        path: 'cards',
        finished_at: '2026-10-08T04:31:00Z',
        journal: 'written',
        decisions: [
          { title: 'Do the expense report', out: 'kept', fields: { day: '2026-10-08' } },
          { title: 'Call the bank', out: 'kept', fields: { day: '2026-10-08' } },
          { title: 'Book the eye test', out: 'kept', fields: { later: '2026-10-14' } },
          { title: 'Old idea', out: 'let_go' },
          { title: 'Undone one', out: 'let_go', undone_at: '2026-10-08T04:20:00Z' },
          { title: 'Fix the shed', out: 'left' },
        ],
      },
      '2026-10-08',
    );
    expect(s).toBe(
      'LAST NIGHT\'S WRAP UP: they finished it; they sorted 5 cards: moved "Do the expense report" and "Call the bank" to today, kept 1 for other days or as it was, let 1 go, left 1 for another time; they wrote in their journal.',
    );
  });

  it('says where one that was not finished stopped, and a clear or skipped night', () => {
    expect(summariseWrap({ ...base, step: 'partial', path: 'cards' }, '2026-10-08')).toBe(
      "LAST NIGHT'S WRAP UP: they stopped part way through the cards.",
    );
    expect(
      summariseWrap({ ...base, step: 'done', path: 'clear', journal: 'mood' }, '2026-10-08'),
    ).toBe(
      "LAST NIGHT'S WRAP UP: they finished it; nothing was waiting to sort; they noted how the day felt.",
    );
    expect(summariseWrap({ ...base, step: 'journal', path: 'skip' }, '2026-10-08')).toBe(
      "LAST NIGHT'S WRAP UP: they stopped at the journal; they moved on without sorting the cards.",
    );
    expect(summariseWrap({ ...base, step: 'declined', journal: 'written' }, '2026-10-08')).toBe(
      "LAST NIGHT'S WRAP UP: they said not tonight to the cards; they wrote in their journal.",
    );
  });

  it('is nothing when no wrap up was started', () => {
    expect(summariseWrap(null, '2026-10-08')).toBeNull();
    expect(summariseWrap({ step: 'offer' }, '2026-10-08')).toBeNull();
  });
});

describe('cancelled calendar entries', () => {
  it('are left out by id or by title', () => {
    const ids = new Set(['row-1']);
    expect(isCancelledEntry({ id: 'row-1', title: 'Social connect' }, ids)).toBe(true);
    expect(isCancelledEntry({ id: 'row-2', title: 'Canceled: iProspect Town Hall' }, ids)).toBe(
      true,
    );
    expect(isCancelledEntry({ id: 'row-3', title: 'Cancellation policy review' }, ids)).toBe(false);
    expect(isCancelledEntry({ id: 'row-5', title: 'Cancelled flights review' }, ids)).toBe(false);
    expect(isCancelledEntry({ id: 'row-4', title: 'Search connect' }, undefined)).toBe(false);
  });
});

describe('the Sweep number the brief may name', () => {
  const g = { tz: 'America/Los_Angeles', today: '2026-10-02', overdue: 0, unsorted: 6 };
  const sweep = {
    all: 10,
    quick: 6,
    pastDay: 0,
    noDay: 6,
    other: 0,
    notes: 0,
    newSince: 6,
    lastSweepAt: '2026-10-02T03:41:00Z', // 8:41pm on 1 October in Los Angeles
  };

  it('is the quick sweep, the number the day card shows, and says the drops are new', () => {
    // 2 October: ten cards in the evening Sweep, but only the six drops since last night need a decision
    const line = sweepLine({ ...g, sweep });
    expect(line).toMatch(/^6, the number the day card shows and the quick sweep holds/);
    expect(line).toContain('6 todos with no day yet');
    expect(line).toContain('All of them were added after their last Sweep (last night)');
    expect(line).not.toMatch(/\b10\b/);
  });

  it('says how many are new when only some are', () => {
    const line = sweepLine({ ...g, sweep: { ...sweep, quick: 8, pastDay: 2, newSince: 6 } });
    expect(line).toContain('2 past their dates, 6 todos with no day yet');
    expect(line).toContain('6 of them were added after their last Sweep');
  });

  it('says nothing is waiting when everything has been decided', () => {
    const line = sweepLine({ ...g, sweep: { ...sweep, quick: 0, noDay: 0, newSince: 0 } });
    expect(line).toMatch(/^nothing/);
  });

  it('names no number when Sweep could not be counted', () => {
    const line = sweepLine({ overdue: 2, unsorted: 3, sweep: null });
    expect(line).toContain('name no number');
    expect(line).not.toContain('the number the day card');
  });
});

describe('when the last Sweep was, as they would say it', () => {
  const tz = 'America/Los_Angeles';
  it('reads it in their own time zone', () => {
    expect(sweptWhen('2026-10-02T03:41:00Z', tz, '2026-10-02')).toBe('last night');
    expect(sweptWhen('2026-10-02T07:30:00Z', tz, '2026-10-02')).toBe('last night');
    expect(sweptWhen('2026-10-02T14:05:00Z', tz, '2026-10-02')).toBe('this morning');
    expect(sweptWhen('2026-10-01T20:00:00Z', tz, '2026-10-02')).toBe('yesterday afternoon');
    expect(sweptWhen('2026-09-28T03:00:00Z', tz, '2026-10-02')).toBe('on Sunday');
    expect(sweptWhen(null, tz, '2026-10-02')).toBeNull();
  });
});
