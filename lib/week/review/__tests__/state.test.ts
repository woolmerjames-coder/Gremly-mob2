/**
 * The weekly review's state (lib/week/review/state.ts): the steps a read
 * gives, what each card starts from, what was settled in words, what Gremly
 * is told, and what the Week button reads. All from ids, dates and numbers.
 */
import { reviewOn, reviewWith } from '../../model';
import {
  FALLBACK_HOURS,
  asksAboutDay,
  dateKey,
  daysPlanned,
  draftFor,
  gremlyPicks,
  hoursTotal,
  intentionOf,
  isPast,
  isWeekend,
  milestonesShown,
  prioritiesOf,
  rekeyed,
  settledFor,
  settledText,
  stepAfter,
  stepOf,
  stepsFor,
  summaryWeekButton,
  weekButton,
  weekCardToday,
  weekTurnContext,
  easedFor,
} from '../state';
import { ID, MON, SAT, SUN, THU, TUE, WED, WEEK_START, madeUpRead, madeUpRow } from './madeUpWeek';

const ON = reviewOn(SUN, 0);
const DAYS = daysPlanned(ON);
const OFF = [0, 6];

describe('the steps of a review', () => {
  it('are all seven when the read has something for each, ending with the board', () => {
    expect(stepsFor(madeUpRead(), SUN)).toEqual([
      'challenge',
      'priorities',
      'shape',
      'intention',
      'ahead',
      'needs_you',
      'board',
    ]);
  });

  it('leave out a step with nothing to show', () => {
    const thin = madeUpRead({ priority_options: [], milestones: [], needs_you: [] });
    expect(stepsFor(thin, SUN)).toEqual(['challenge', 'shape', 'intention', 'board']);
    // a read that could not be made has the challenge, the shape, the intention and the board still
    expect(stepsFor(null, SUN)).toEqual(['challenge', 'shape', 'intention', 'board']);
  });

  it('go on to the next one, and to done after the last', () => {
    const steps = stepsFor(madeUpRead(), SUN);
    expect(stepAfter(steps, 'challenge')).toBe('priorities');
    expect(stepAfter(steps, 'ahead')).toBe('needs_you');
    expect(stepAfter(steps, 'needs_you')).toBe('board');
    expect(stepAfter(steps, 'board')).toBe('done');
    const thin = stepsFor(madeUpRead({ priority_options: [], milestones: [], needs_you: [] }), SUN);
    expect(stepAfter(thin, 'challenge')).toBe('shape');
    expect(stepAfter(thin, 'intention')).toBe('board');
    // a step the read no longer has (its milestones have gone by): the next one it does have
    expect(stepAfter(thin, 'priorities')).toBe('shape');
    expect(stepAfter(thin, 'ahead')).toBe('board');
  });

  it('are read from the row: the challenge until it says otherwise, and done when finished', () => {
    expect(stepOf(madeUpRow())).toBe('challenge');
    expect(stepOf(madeUpRow({ answers: { step: 'shape' } }))).toBe('shape');
    expect(stepOf(madeUpRow({ answers: { step: 'done' } }))).toBe('done');
    expect(stepOf(madeUpRow({ answers: { step: 'board' } }))).toBe('board');
    expect(isPast('shape', 'board')).toBe(true);
    expect(stepOf(null)).toBe('challenge');
    expect(isPast('priorities', 'shape')).toBe(true);
    expect(isPast('shape', 'shape')).toBe(false);
    expect(isPast('needs_you', 'done')).toBe(true);
    expect(isPast('shape', undefined)).toBe(false);
  });
});

describe('the milestones a card shows', () => {
  it('are the read’s, with every step still ahead', () => {
    const shown = milestonesShown(madeUpRead(), SUN);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({
      key: ID.reports,
      goal: 'Reports handed in',
      date: '2026-10-23',
    });
    expect(shown[0].steps.map((s) => s.title)).toEqual([
      'Gather the grades',
      'Draft the first ten',
      'How are the reports going?',
    ]);
  });

  it('leave out a step whose day has gone when the read is used on a later day', () => {
    // Wednesday: Monday's step is behind them
    const shown = milestonesShown(madeUpRead(), WED);
    expect(shown[0].steps.map((s) => s.title)).toEqual([
      'Draft the first ten',
      'How are the reports going?',
    ]);
  });

  it('are not shown once the date is not ahead, or no step is left', () => {
    expect(milestonesShown(madeUpRead(), '2026-10-23')).toEqual([]);
    expect(milestonesShown(madeUpRead(), '2026-10-17')).toEqual([]);
    expect(stepsFor(madeUpRead(), '2026-10-17')).not.toContain('ahead');
    expect(milestonesShown(null, SUN)).toEqual([]);
  });
});

describe('what the cards start from', () => {
  it('is Gremly’s guess the first time, with nothing picked', () => {
    const d = draftFor(madeUpRow(), DAYS);
    expect(d.priorities).toEqual([]);
    expect(d.hours).toEqual({ normal_day: 2, busy_day: 0.5, weekend_day: 4 });
    expect(d.busy).toEqual([TUE, THU]);
    expect(d.datesOut).toEqual([]);
    expect(d.intention).toEqual({ pick: null, own: '' });
  });

  it('is last week’s hours when there are any, ahead of the guess', () => {
    const d = draftFor(madeUpRow(), DAYS, { normal_day: 3, weekend_day: 5 });
    // what last week did not set stays the guess
    expect(d.hours).toEqual({ normal_day: 3, busy_day: 0.5, weekend_day: 5 });
  });

  it('falls back to plain hours when there is neither', () => {
    const row = madeUpRow({ read: madeUpRead({ free_hours_guess: null }) });
    expect(draftFor(row, DAYS).hours).toEqual(FALLBACK_HOURS);
  });

  it('is what they settled once the review has been here before', () => {
    const row = madeUpRow({
      answers: {
        priorities: [{ text: 'Sort the boiler', item_ids: [ID.boiler] }],
        hours: { normal_day: 1.5, busy_day: 0, weekend_day: 3 },
        busy_days: [WED],
        dates_out: [`note:${ID.fair}`],
        intention: 'Leave school by five twice.',
      },
    });
    const d = draftFor(row, DAYS, { normal_day: 6, busy_day: 6, weekend_day: 6 });
    expect(d.priorities).toEqual([2]);
    expect(d.hours).toEqual({ normal_day: 1.5, busy_day: 0, weekend_day: 3 });
    expect(d.busy).toEqual([WED]);
    expect(d.datesOut).toEqual([`note:${ID.fair}`]);
    // one of Gremly's drafts: picked, not typed
    expect(d.intention).toEqual({ pick: 1, own: '' });
    const own = draftFor(madeUpRow({ answers: { intention: 'Sleep more' } }), DAYS);
    expect(own.intention).toEqual({ pick: null, own: 'Sleep more' });
  });

  it('keeps only the busy days among the days being planned', () => {
    // opened on Wednesday: Tuesday has gone
    const on = reviewWith(WED, 0, madeUpRow({ status: 'started' }));
    expect(draftFor(madeUpRow(), daysPlanned(on)).busy).toEqual([THU]);
  });

  it('reads the intention, the priorities and Gremly’s picks from the read', () => {
    const read = madeUpRead();
    expect(intentionOf(read, { pick: 0, own: '' })).toBe('Start the reports before Thursday.');
    expect(intentionOf(read, { pick: 0, own: '  My own  ' })).toBe('My own');
    expect(intentionOf(read, { pick: null, own: '' })).toBe('');
    expect(prioritiesOf(read, [2, 0])).toEqual([
      { text: 'Sort the boiler', item_ids: [ID.boiler] },
      { text: 'Get the reports started', item_ids: [ID.reports] },
    ]);
    // never more than three, and nothing the read does not have
    expect(prioritiesOf(read, [0, 1, 2, 3, 9])).toHaveLength(3);
    expect(gremlyPicks(read)).toEqual([0, 1]);
  });

  it('keys a deadline by the item it is, or by its place when it is not one of theirs', () => {
    const read = madeUpRead();
    expect(dateKey(read.coming_up[0], 0)).toBe(`note:${ID.parents}`);
    expect(dateKey(read.coming_up[2], 2)).toBe('2026-10-23:2');
  });

  it('adds up the free hours over the days being planned', () => {
    const hours = { normal_day: 2, busy_day: 0.5, weekend_day: 4 };
    // Monday to Sunday: three normal days, two busy, two days off
    expect(hoursTotal(DAYS, hours, [TUE, THU], OFF)).toBe(3 * 2 + 2 * 0.5 + 2 * 4);
    // a busy day off counts as busy
    expect(hoursTotal(DAYS, hours, [SAT], OFF)).toBe(5 * 2 + 0.5 + 4);
    expect(isWeekend([6, 0])).toBe(true);
    expect(isWeekend([5, 6])).toBe(false);
  });
});

describe('what was settled, in words', () => {
  const row = madeUpRow({
    status: 'started',
    answers: {
      step: 'needs_you',
      challenge: { agreed: true },
      priorities: [
        { text: 'Get the reports started', item_ids: [ID.reports] },
        { text: 'Two swims', item_ids: [] },
      ],
      hours: { normal_day: 2.5, busy_day: 1, weekend_day: 4 },
      busy_days: [TUE, THU],
      intention: 'Start the reports before Thursday.',
      intention_id: ID.fair,
      milestones: [{ about: ID.reports, goal: 'Reports handed in', steps: 3 }],
      needs_you: [
        { title: 'Sort the boiler', item_ids: [ID.boiler], decision: 'Later, back 12 Oct' },
      ],
    },
  });
  const ctx = { daysOff: OFF, days: DAYS };

  it('is their own message under each card', () => {
    expect(settledText('challenge', row, ctx)).toBe("That's about right");
    expect(settledText('priorities', row, ctx)).toBe('Get the reports started, Two swims');
    expect(settledText('shape', row, ctx)).toBe(
      'Busiest on Tue, Thu. About 2h 30m free on a normal day, 1h on a busy one, 4h at weekends.',
    );
    expect(settledText('intention', row, ctx)).toBe('“Start the reports before Thursday.”');
    expect(settledText('ahead', row, ctx)).toBe('Set up the steps for Reports handed in');
    expect(settledText('needs_you', row, ctx)).toBe("That's enough for these");
  });

  it('says so when a step was passed over', () => {
    const none = madeUpRow({ answers: { hours: { normal_day: 0, busy_day: 0, weekend_day: 0 } } });
    expect(settledText('challenge', none, ctx)).toBeNull();
    expect(settledText('priorities', none, ctx)).toBe('Nothing in particular');
    expect(settledText('intention', none, ctx)).toBe('No intention this week');
    expect(settledText('ahead', none, ctx)).toBe('Not now');
    expect(settledText('shape', none, { daysOff: [5, 6], days: DAYS })).toBe(
      'About no time free on a normal day, no time on a busy one, no time on a day off.',
    );
  });

  it('is told to Gremly with ids, how each thing is now and what it was', () => {
    const settled = settledFor(row, DAYS);
    expect(settled).toEqual([
      {
        kind: 'priority',
        item_ids: [ID.reports],
        title: 'Get the reports started',
        outcome: 'chosen',
      },
      { kind: 'priority', item_ids: [], title: 'Two swims', outcome: 'chosen' },
      {
        kind: 'hours',
        title: 'Free hours',
        outcome: '2h 30m on a normal day, 1h on a busy day, 4h on a day off',
        was: '2h on a normal day, 30m on a busy day, 4h on a day off',
      },
      { kind: 'busy_days', title: 'Busy days', outcome: 'Tue, Thu', was: 'Tue, Thu' },
      {
        kind: 'intention',
        id: ID.fair,
        type: 'note',
        title: 'Start the reports before Thursday.',
        outcome: 'kept',
      },
      { kind: 'milestone', title: 'Reports handed in', outcome: '3 steps set up' },
      {
        kind: 'needs_you',
        item_ids: [ID.boiler],
        title: 'Sort the boiler',
        outcome: 'Later, back 12 Oct',
      },
    ]);
  });

  it('holds back what a step has not settled yet', () => {
    // on the shape: the priorities are settled, the hours on the card are not
    const early = madeUpRow({
      status: 'started',
      answers: { ...row.answers, step: 'shape', milestones: [], needs_you: [] },
    });
    expect(settledFor(early, DAYS).map((s) => s.kind)).toEqual(['priority', 'priority']);
  });
});

describe('what Gremly is told about their week', () => {
  const base = {
    today: SUN,
    weeklyDay: 0,
    daysOff: OFF,
    thisWeek: null,
    review: null,
    on: null,
    intention: null,
    talking: null,
    hold: null,
    eased: [],
  };

  it('says which habits are paused or on a lighter version, so Gremly can change one', () => {
    const habits = [
      { id: 'h1', name: 'Run' },
      { id: 'h2', title: 'Swim' },
      { id: 'h3', name: 'Gone', archived: true },
    ];
    const row = (habit_id: string, mode: string, period_start: string, period_end: string) => ({
      habit_id,
      mode,
      period_start,
      period_end,
      floor_note: mode === 'floor' ? 'Two lengths' : null,
    });
    const eased = easedFor(
      habits,
      [
        row('h2', 'floor', TUE, WED),
        row('h1', 'pause', SUN, MON),
        // over already, a habit put away, a habit not theirs, a row that eases nothing
        row('h1', 'pause', '2026-09-01', '2026-09-07'),
        row('h3', 'pause', SUN, MON),
        row('h9', 'pause', SUN, MON),
        row('h1', 'keep', THU, SAT),
      ],
      SUN,
    );
    expect(eased).toEqual([
      { habit_id: 'h1', title: 'Run', mode: 'pause', first: SUN, last: MON, note: '' },
      {
        habit_id: 'h2',
        title: 'Swim',
        mode: 'lighter',
        first: TUE,
        last: WED,
        note: 'Two lengths',
      },
    ]);
    // it rides with their week whether or not a review is under way
    expect(weekTurnContext({ ...base, eased }).eased).toEqual(eased);
    // none eased is still sent: the list itself says this build can apply the change
    expect(weekTurnContext(base).eased).toEqual([]);
  });

  it('is their weekly day and where this week stands when no review is under way', () => {
    const ready = madeUpRow();
    const ctx = weekTurnContext({ ...base, thisWeek: ready });
    expect(ctx).toEqual({
      weekly_day: 0,
      days_off: OFF,
      review: { week_start: WEEK_START, span_start: WEEK_START, status: 'ready', kind: 'weekly' },
      extra_used: false,
      hours: null,
      busy_days: [],
      intention: null,
      eased: [],
    });
    expect(weekTurnContext(base).review).toBeNull();
    // the extra is used once the week's row is the extra's
    const extra = madeUpRow({ kind: 'extra', status: 'done' });
    expect(weekTurnContext({ ...base, today: WED, thisWeek: extra }).extra_used).toBe(true);
  });

  it('carries the review under way: where it is, the challenge, Gremly’s picks and what is settled', () => {
    const row = madeUpRow({
      status: 'started',
      answers: {
        step: 'shape',
        priorities: [{ text: 'Two swims', item_ids: [] }],
        hours: { normal_day: 2 },
        busy_days: [TUE],
      },
    });
    const ctx = weekTurnContext({
      ...base,
      thisWeek: row,
      review: row,
      on: ON,
      intention: { id: ID.fair, text: 'Fewer things, finished.' },
      hold: 'Which evening is the concert?',
    });
    expect(ctx.hours).toEqual({ normal_day: 2 });
    expect(ctx.busy_days).toEqual([TUE]);
    expect(ctx.intention).toEqual({ id: ID.fair, text: 'Fewer things, finished.' });
    expect(ctx.under_way).toMatchObject({
      step: 'shape',
      first: MON,
      last: '2026-10-11',
      week_start: WEEK_START,
      challenge: { headline: 'Reports are due while the week is already full.' },
      picks: [
        { text: 'Get the reports started', item_ids: [ID.reports] },
        { text: 'Clear the marking', item_ids: [ID.marking] },
      ],
      settled: [{ kind: 'priority', title: 'Two swims', outcome: 'chosen', item_ids: [] }],
      // the board joins later: nothing is placed here yet
      habit_days: [],
      placed: [],
      later: [],
      about: null,
      hold: 'Which evening is the concert?',
    });
  });

  it('names the one they opened to talk through', () => {
    const row = madeUpRow({ status: 'started', answers: { step: 'needs_you' } });
    const ctx = weekTurnContext({ ...base, thisWeek: row, review: row, on: ON, talking: 1 });
    expect(ctx.under_way?.about).toEqual({
      title: 'The Year 9 marking',
      item_ids: [ID.marking],
      stuck_because: 'It keeps slipping to the weekend.',
      question: 'What would make this one easier?',
    });
  });

  it('says a review finished in this thread is done, and leaves out one only made ready', () => {
    const done = madeUpRow({ status: 'done', answers: { step: 'done' } });
    expect(weekTurnContext({ ...base, thisWeek: done, review: done, on: ON }).under_way?.step).toBe(
      'done',
    );
    const ready = madeUpRow();
    expect(
      weekTurnContext({ ...base, thisWeek: ready, review: ready, on: ON }).under_way,
    ).toBeUndefined();
  });

  it('plans from today when a review is picked up part way through its week', () => {
    const row = madeUpRow({ status: 'started', answers: { step: 'intention' } });
    const on = reviewWith(WED, 0, row);
    const ctx = weekTurnContext({ ...base, today: WED, thisWeek: row, review: row, on });
    expect(ctx.under_way).toMatchObject({ first: WED, last: '2026-10-11', week_start: WEEK_START });
  });
});

describe('the Week button', () => {
  const row = (status: string, weekStart = WEEK_START) =>
    ({ status, week_start: weekStart }) as any;

  it('is highlighted on their weekly day and the two days after, until the review is done', () => {
    for (const day of [SUN, MON, TUE]) {
      expect(weekButton(day, 0, null)).toEqual({
        label: 'Plan your week',
        done: false,
        highlighted: true,
      });
      expect(weekButton(day, 0, row('ready')).highlighted).toBe(true);
      expect(weekButton(day, 0, row('started')).highlighted).toBe(true);
    }
  });

  it('leads Today on their weekly day only, until the review is done or put off for the week', () => {
    expect(weekCardToday(SUN, 0, null)).toBe(true);
    expect(weekCardToday(SUN, 0, row('ready'))).toBe(true);
    expect(weekCardToday(SUN, 0, row('started'))).toBe(true);
    expect(weekCardToday(SUN, 0, row('done'))).toBe(false);
    expect(weekCardToday(SUN, 0, row('skipped'))).toBe(false);
    // the days after keep the highlighted button, without the card
    for (const day of [MON, TUE, WED, SAT]) expect(weekCardToday(day, 0, null)).toBe(false);
    // and it follows their own weekly day
    expect(weekCardToday(WED, 3, null)).toBe(true);
    expect(weekCardToday(SUN, 3, null)).toBe(false);
  });

  it('reads Your week once the review is done, with no highlight', () => {
    for (const day of [SUN, TUE, WED, SAT]) {
      expect(weekButton(day, 0, row('done'))).toEqual({
        label: 'Your week',
        done: true,
        highlighted: false,
      });
    }
  });

  it('still reads Plan your week on other days, without the highlight', () => {
    for (const day of [WED, THU, SAT]) {
      expect(weekButton(day, 0, null)).toEqual({
        label: 'Plan your week',
        done: false,
        highlighted: false,
      });
    }
  });

  it('goes quiet once they have said not this week', () => {
    expect(weekButton(SUN, 0, row('skipped'))).toEqual({
      label: 'Plan your week',
      done: false,
      highlighted: false,
    });
  });

  it('counts only the review of the week they are in', () => {
    // last week's finished review says nothing about this one
    expect(weekButton(SUN, 0, row('done', '2026-09-28'))).toEqual({
      label: 'Plan your week',
      done: false,
      highlighted: true,
    });
  });

  it('follows a weekly day that is not Sunday', () => {
    // Wednesday is their weekly day
    expect(weekButton(WED, 3, null).highlighted).toBe(true);
    expect(weekButton('2026-10-09', 3, null).highlighted).toBe(true);
    expect(weekButton(SAT, 3, null).highlighted).toBe(false);
    expect(weekButton(SUN, 3, null).highlighted).toBe(false);
  });
});

describe('a review done on another day than their weekly day', () => {
  it('asks once whether to move the weekly day, and never for the weekly review itself', () => {
    const done = madeUpRow({ status: 'done', kind: 'extra' });
    expect(asksAboutDay(done, reviewOn(WED, 0))).toBe(true);
    expect(asksAboutDay(done, reviewOn(SAT, 0))).toBe(true);
    expect(asksAboutDay(madeUpRow({ status: 'done' }), reviewOn(SUN, 0))).toBe(false);
    expect(asksAboutDay(madeUpRow({ status: 'done' }), reviewOn(TUE, 0))).toBe(false);
    // a weekly review picked up later in its week is still the weekly one
    const started = madeUpRow({ status: 'started' });
    expect(asksAboutDay(started, reviewWith(WED, 0, started))).toBe(false);
    const asked = madeUpRow({ status: 'done', kind: 'extra', answers: { day_asked: true } });
    expect(asksAboutDay(asked, reviewOn(WED, 0))).toBe(false);
    expect(asksAboutDay(done, null)).toBe(false);
  });

  it('counts as the new week’s when that day becomes their weekly day', () => {
    // Wednesday's extra planned Wednesday to Sunday; with Wednesday as the
    // weekly day the week it counts for starts on Thursday
    expect(rekeyed(WED, 3, { span_start: WED })).toEqual({
      week_start: THU,
      span_start: THU,
    });
    // Saturday's review of next week, with Saturday as the weekly day: the
    // week starts on Sunday, and its first planned day stays Monday
    expect(rekeyed(SAT, 6, { span_start: '2026-10-12' })).toEqual({
      week_start: '2026-10-11',
      span_start: '2026-10-12',
    });
  });
});

describe('the button the weekly summary ends on', () => {
  const row = (status: string, weekStart = WEEK_START) =>
    ({ status, week_start: weekStart }) as any;

  it('is Plan next week on their weekly day, for the week that has just ended', () => {
    expect(summaryWeekButton(SUN, 0, null, SUN)).toEqual({ label: 'Plan next week', done: false });
    expect(summaryWeekButton(SUN, 0, row('ready'), SUN)).toEqual({
      label: 'Plan next week',
      done: false,
    });
    // a review begun and left is still theirs to plan
    expect(summaryWeekButton(SUN, 0, row('started'), SUN)?.done).toBe(false);
  });

  it('is Plan your week on the days after, while the review is still to do', () => {
    for (const day of [MON, TUE, WED, SAT]) {
      expect(summaryWeekButton(day, 0, null, SUN)).toEqual({
        label: 'Plan your week',
        done: false,
      });
    }
    // said not this week: the summary still offers it, since they came to it themselves
    expect(summaryWeekButton(MON, 0, row('skipped'), SUN)).toEqual({
      label: 'Plan your week',
      done: false,
    });
  });

  it('is Your week once the review is done', () => {
    for (const day of [SUN, MON, SAT]) {
      expect(summaryWeekButton(day, 0, row('done'), SUN)).toEqual({
        label: 'Your week',
        done: true,
      });
    }
    // last week's finished review is not this week's
    expect(summaryWeekButton(SUN, 0, row('done', '2026-09-28'), SUN)).toEqual({
      label: 'Plan next week',
      done: false,
    });
  });

  it('is nothing for an older summary, or one with no last day', () => {
    expect(summaryWeekButton(SUN, 0, null, '2026-09-27')).toBeNull();
    expect(summaryWeekButton(WED, 0, row('done'), '2026-09-27')).toBeNull();
    expect(summaryWeekButton(SUN, 0, null, null)).toBeNull();
    expect(summaryWeekButton(SUN, 0, null, undefined)).toBeNull();
  });

  it('goes by their own weekly day', () => {
    // a Wednesday weekly day: the week that has just ended is the one that ended on Wednesday
    expect(summaryWeekButton(WED, 3, null, WED)).toEqual({ label: 'Plan next week', done: false });
    expect(summaryWeekButton(THU, 3, null, WED)).toEqual({ label: 'Plan your week', done: false });
    expect(summaryWeekButton(WED, 3, null, SUN)).toBeNull();
  });

  it('reads a last day given with a time', () => {
    expect(summaryWeekButton(SUN, 0, null, `${SUN}T00:00:00Z`)).toEqual({
      label: 'Plan next week',
      done: false,
    });
  });
});
