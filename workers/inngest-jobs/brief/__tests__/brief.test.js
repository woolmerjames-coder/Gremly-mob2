/**
 * @jest-environment node
 *
 * The brief's data rules, in the worker: the offer, behind this week, the
 * shape of the day, the ID check, yesterday's reaction and when a brief is due.
 */
import { decideOffer, planLabel, questionButtons } from '../offer';
import { dayOfWeekNumber, isBehindThisWeek, mondayOf, weeklyTarget } from '../behind';
import { clashesOf, dayPartAt, ritualDayFor, shapeOfDay, minutesIn, localStartIso } from '../data';
import { checkRefs, noDashes, renderBriefInput } from '../writer';
import { summariseThread } from '../reaction';
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
      clashes: [[{ id: 'cal-2' }, { id: 'cal-3' }]],
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
    expect(text).toContain('t1 | Buy Oat Milk');
    expect(text).toContain('behind for the week');
    expect(text).toContain('r1 | Car service light is on');
    expect(text).toContain('"Plan my day" is offered');
    expect(r.get('r1')).toEqual({ type: 'fact', id: 'fact-9' });
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
    expect(s).toContain('locked in a plan: Social posts at 13:15, Run at 18:00');
    expect(s).toContain('took out Oat milk');
    expect(s).toContain('moved Run');
    expect(s).toContain('said "move the run after 6"');
    expect(summariseThread({}, [])).toBe('they did not open it');
  });
});
