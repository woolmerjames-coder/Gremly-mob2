/**
 * Their week in the morning brief (lib/brief/checkIn.ts): the check in on a
 * habit they planned for today, the offer of the weekly review, and what a
 * tap on the check in does.
 */
import {
  CHECKIN_COPY,
  applyCheckIn,
  checkInWaiting,
  habitWeekDays,
  shownOffer,
  weekFactsFrom,
  type BriefWeekFacts,
  type WeekFactsInput,
} from '../checkIn';
import type { BriefOfferMeta } from '../types';

// Thursday 8 October 2026; their weekly day is Sunday, so the week is Monday 5 to Sunday 11
const TODAY = '2026-10-08';

const mockStore: Record<string, any> = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(() => undefined, { getState: () => mockStore }),
}));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({ ritualDay: () => '2026-10-08' }),
}));
const mockWeek: Record<string, any> = {};
jest.mock('../../week/thisWeek', () => ({
  useThisWeek: Object.assign(() => undefined, { getState: () => mockWeek }),
}));

const strength = {
  id: 'h1',
  name: 'Strength',
  cadence: 'weekly',
  target_per_period: 3,
  time_estimate_minutes: 45,
};
const plan = (habit_id: string, planned_date: string, status = 'planned') => ({
  habit_id,
  planned_date,
  status,
});

function input(over: Partial<WeekFactsInput> = {}): WeekFactsInput {
  return {
    date: TODAY,
    today: TODAY,
    habits: [strength],
    habitPlans: [plan('h1', TODAY), plan('h1', '2026-10-05')],
    habitProgress: [{ habit_id: 'h1', occurred_day: '2026-10-05' }],
    todos: [],
    weeklyDay: 0,
    daysOff: [6, 0],
    review: null,
    loaded: true,
    ...over,
  };
}

function offer(over: Partial<BriefOfferMeta> = {}): BriefOfferMeta {
  return {
    type: 'brief-offer',
    kind: 'plan',
    brief_id: 'b1',
    buttons: [
      { id: 'plan', label: 'Plan my day', action: 'plan', primary: true },
      { id: 'not_today', label: 'Not today', action: 'not_today' },
    ],
    ...over,
  };
}

describe('the day as the app holds it', () => {
  it('has the check in while the habit is still planned for today, with the day it can move to', () => {
    // no review: the hours every board falls back to (2 on a normal day, 4 on a day off)
    expect(weekFactsFrom(input()).checkIn('h1')).toEqual({
      title: 'Strength',
      moveTo: '2026-10-10',
    });
  });

  it('reads the room from the review of the week they are in', () => {
    const review = {
      week_start: '2026-10-05',
      status: 'done',
      answers: { hours: { normal_day: 3, busy_day: 1, weekend_day: 0.5 }, busy_days: [] },
      read: null,
    } as any;
    // their days off hold half an hour, so Friday is the day with room
    expect(weekFactsFrom(input({ review })).checkIn('h1')?.moveTo).toBe('2026-10-09');
    // another week's review says nothing about this one
    const other = { ...review, week_start: '2026-09-28' };
    expect(weekFactsFrom(input({ review: other })).checkIn('h1')?.moveTo).toBe('2026-10-10');
  });

  it('has no day to move to when nothing left in their week can take it', () => {
    const todos = ['2026-10-09', '2026-10-10', '2026-10-11'].map((due_day, i) => ({
      id: `t${i}`,
      due_day,
      time_estimate_minutes: 240,
    }));
    expect(weekFactsFrom(input({ todos })).checkIn('h1')).toEqual({
      title: 'Strength',
      moveTo: null,
    });
  });

  it('has no check in once the habit is done, off today, quieted, or gone', () => {
    const done = input({ habitProgress: [{ habit_id: 'h1', occurred_day: TODAY }] });
    expect(weekFactsFrom(done).checkIn('h1')).toBeNull();
    expect(weekFactsFrom(input({ habitPlans: [] })).checkIn('h1')).toBeNull();
    const quiet = { ...strength, views: { checkins_quiet_until: '2026-10-11' } };
    expect(weekFactsFrom(input({ habits: [quiet] })).checkIn('h1')).toBeNull();
    expect(weekFactsFrom(input({ habits: [] })).checkIn('h1')).toBeNull();
    expect(weekFactsFrom(input()).checkIn('h-other')).toBeNull();
  });

  it('says nothing of a habit’s week until their weekly day has been read', () => {
    // Before the read the app holds a stand in weekly day. Theirs is
    // Thursday, so today ends their week: there is no day to move to, and a
    // skip must not quiet the days of the week that starts tomorrow.
    const unread = weekFactsFrom(input({ loaded: false }));
    expect(unread.checkIn('h1')).toBeNull();
    expect(unread.moveDays(['h1']).size).toBe(0);
    const read = weekFactsFrom(input({ weeklyDay: 4 }));
    expect(read.checkIn('h1')).toEqual({ title: 'Strength', moveTo: null });
  });

  it('gives several habits their days to move to in turn, so none lands on a day another filled', () => {
    const long = { ...strength, id: 'h2', name: 'Long run', time_estimate_minutes: 150 };
    const longer = { ...strength, id: 'h3', name: 'Garden', time_estimate_minutes: 150 };
    const done = { ...strength, id: 'h4', name: 'Stretch' };
    const facts = weekFactsFrom(
      input({
        habits: [long, longer, strength, done],
        habitPlans: [plan('h2', TODAY), plan('h3', TODAY), plan('h1', TODAY), plan('h4', TODAY)],
        habitProgress: [{ habit_id: 'h4', occurred_day: TODAY }],
        // Sunday is nearly full, so Saturday is the one day with room for a long one
        todos: [{ id: 't1', due_day: '2026-10-11', time_estimate_minutes: 200 }],
      }),
    );
    // each alone would be sent to Saturday
    expect(facts.checkIn('h2')?.moveTo).toBe('2026-10-10');
    expect(facts.checkIn('h3')?.moveTo).toBe('2026-10-10');
    // together, the first takes it, the second has nowhere, and the short one goes where room is left
    const days = facts.moveDays(['h2', 'h3', 'h1', 'h4', 'h-gone']);
    expect([...days.entries()]).toEqual([
      ['h2', '2026-10-10'],
      ['h1', '2026-10-09'],
    ]);
  });

  it("is live in the thread of the person's own day only", () => {
    const old = weekFactsFrom(input({ date: '2026-10-07' }));
    expect(old.checkIn('h1')).toBeNull();
    expect(old.reviewOffer).toBe(false);
  });

  it('offers the review on the two mornings after their weekly day, until it is done', () => {
    // Thursday is too late: the review is no longer put forward
    expect(weekFactsFrom(input()).reviewOffer).toBe(false);
    const monday = { date: '2026-10-05', today: '2026-10-05' };
    expect(weekFactsFrom(input(monday)).reviewOffer).toBe(true);
    const done = { week_start: '2026-10-05', status: 'done', answers: {}, read: null } as any;
    expect(weekFactsFrom(input({ ...monday, review: done })).reviewOffer).toBe(false);
    // until the week has been read, nothing is said about the review
    expect(weekFactsFrom(input({ ...monday, loaded: false })).reviewOffer).toBe(false);
  });
});

describe('how an offer is shown', () => {
  const on: BriefWeekFacts = {
    checkIn: (id) => (id === 'h1' ? { title: 'Strength', moveTo: '2026-10-10' } : null),
    moveDays: () => new Map(),
    reviewOffer: false,
  };
  const off: BriefWeekFacts = {
    checkIn: () => null,
    moveDays: () => new Map(),
    reviewOffer: false,
  };
  const reviewing: BriefWeekFacts = {
    checkIn: () => null,
    moveDays: () => new Map(),
    reviewOffer: true,
  };
  const riding = offer({ checkin: { habit_id: 'h1', title: 'Strength' } });

  it('shows the check in while the habit is still on, with its own buttons', () => {
    const view = shownOffer('Want to plan the afternoon?', riding, on);
    expect(view.checkIn).toBe(true);
    expect(view.content).toBe(
      'You planned Strength for today. Still on? If not, Saturday has room.',
    );
    expect(view.buttons).toEqual([
      { id: 'habit_keep', label: 'Still on', action: 'habit_keep', primary: true },
      { id: 'habit_move', label: 'Move it to Saturday', action: 'habit_move', value: '2026-10-10' },
      { id: 'habit_skip', label: 'Skip this week', action: 'habit_skip' },
    ]);
    expect(checkInWaiting(riding, on)).toEqual({
      habit_id: 'h1',
      title: 'Strength',
      moveTo: '2026-10-10',
    });
  });

  it('leaves Move out when no day left can take it', () => {
    const nowhere: BriefWeekFacts = {
      checkIn: () => ({ title: 'Strength', moveTo: null }),
      moveDays: () => new Map(),
      reviewOffer: false,
    };
    const view = shownOffer('Want to plan the afternoon?', riding, nowhere);
    expect(view.content).toBe('You planned Strength for today. Still on?');
    expect(view.buttons.map((b) => b.action)).toEqual(['habit_keep', 'habit_skip']);
  });

  it('shows the offer itself once the habit is no longer on, or the app does not know the day', () => {
    for (const facts of [off, null]) {
      const view = shownOffer('Want to plan the afternoon?', riding, facts);
      expect(view).toMatchObject({ content: 'Want to plan the afternoon?', checkIn: false });
      expect(view.buttons).toBe(riding.buttons);
      expect(checkInWaiting(riding, facts)).toBeNull();
    }
  });

  it('keeps the words of the check in on a message that was answered as one', () => {
    const asked = offer({
      checkin: { habit_id: 'h1', title: 'Strength', asked: true },
      chosen: { id: 'habit_keep', at: 'now' },
    });
    // whatever the day is now, and with no buttons left
    for (const facts of [on, off, null]) {
      expect(shownOffer('Want to plan the afternoon?', asked, facts)).toEqual({
        content: 'You planned Strength for today. Still on?',
        buttons: [],
        checkIn: true,
      });
    }
    expect(checkInWaiting(asked, on)).toBeNull();
  });

  it('shows the offer itself when one of its own buttons was tapped', () => {
    const tapped = offer({
      checkin: { habit_id: 'h1', title: 'Strength' },
      chosen: { id: 'plan', at: 'now' },
    });
    expect(shownOffer('Want to plan the afternoon?', tapped, on)).toMatchObject({
      content: 'Want to plan the afternoon?',
      checkIn: false,
    });
  });

  it('puts Plan my week beside the offer while the review is still to do', () => {
    const meta = offer({ review_offer: true });
    const view = shownOffer('Want to plan the afternoon?', meta, reviewing);
    expect(view.content).toBe('Want to plan the afternoon?');
    expect(view.buttons.map((b) => b.action)).toEqual(['plan', 'not_today', 'plan_week']);
    expect(view.buttons[2]).toEqual({
      id: 'plan_week',
      label: 'Plan my week',
      action: 'plan_week',
    });
    expect(view.hint).toBe(CHECKIN_COPY.reviewHint);
    // done since the brief was written: the offer is as it was
    expect(shownOffer('Want to plan the afternoon?', meta, off).buttons).toBe(meta.buttons);
    // and once a button is tapped the extra one goes with the rest
    const tapped = { ...meta, chosen: { id: 'plan', at: 'now' } };
    expect(shownOffer('Want to plan the afternoon?', tapped, reviewing).buttons).toBe(meta.buttons);
  });

  it('asks about the week when the brief had nothing of its own to offer', () => {
    const quiet = offer({ kind: 'none', buttons: [], review_offer: true });
    const view = shownOffer('Have a good day.', quiet, reviewing);
    expect(view.content).toBe(CHECKIN_COPY.reviewAsk);
    expect(view.buttons).toEqual([
      { id: 'plan_week', label: 'Plan my week', action: 'plan_week', primary: true },
      { id: 'not_today', label: 'Not today', action: 'not_today' },
    ]);
    // answered, it still reads as what was asked
    const answered = { ...quiet, chosen: { id: 'not_today', at: 'now' } };
    expect(shownOffer('Have a good day.', answered, off)).toMatchObject({
      content: CHECKIN_COPY.reviewAsk,
      buttons: [],
    });
    // with the review done since, the brief just signs off
    expect(shownOffer('Have a good day.', quiet, off).content).toBe('Have a good day.');
  });

  it('shows the check in before the offer of the review when a message carries both', () => {
    const both = offer({ checkin: { habit_id: 'h1', title: 'Strength' }, review_offer: true });
    const facts: BriefWeekFacts = { ...on, reviewOffer: true };
    expect(shownOffer('Want to plan?', both, facts).checkIn).toBe(true);
  });
});

describe('a tap on the check in', () => {
  const setHabitPlan = jest.fn();
  const removeHabitPlan = jest.fn();
  const updateHabit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockWeek, { weeklyDay: 0, daysOff: [6, 0], review: null, loaded: true });
    Object.assign(mockStore, {
      habits: [{ ...strength, views: { minddrop_stage: 'enriched' } }],
      habitPlans: [plan('h1', TODAY), plan('h1', '2026-10-05')],
      habitProgress: [],
      todos: [],
      setHabitPlan,
      removeHabitPlan,
      updateHabit,
    });
    // the store's writers, saving as asked
    setHabitPlan.mockImplementation(async (id: string, day: string) => {
      mockStore.habitPlans = [...mockStore.habitPlans, plan(id, day)];
    });
    removeHabitPlan.mockImplementation(async (id: string, day: string) => {
      mockStore.habitPlans = mockStore.habitPlans.filter(
        (p: any) => !(p.habit_id === id && p.planned_date === day),
      );
    });
    updateHabit.mockImplementation(async (id: string, patch: any) => {
      mockStore.habits = mockStore.habits.map((h: any) => (h.id === id ? { ...h, ...patch } : h));
    });
  });
  const days = () => mockStore.habitPlans.map((p: any) => p.planned_date).sort();

  it('Still on changes nothing', async () => {
    expect(await applyCheckIn('h1', 'habit_keep', null)).toEqual({
      text: 'Nice. Strength stays on for today.',
      week: true,
    });
    expect(setHabitPlan).not.toHaveBeenCalled();
    expect(removeHabitPlan).not.toHaveBeenCalled();
    expect(updateHabit).not.toHaveBeenCalled();
  });

  it('Move takes it off today and puts it on the day the button named', async () => {
    expect(await applyCheckIn('h1', 'habit_move', '2026-10-10')).toEqual({
      text: 'Done. Strength is on Saturday now.',
      week: true,
    });
    expect(days()).toEqual(['2026-10-05', '2026-10-10']);
    expect(updateHabit).not.toHaveBeenCalled();
  });

  it('Move leaves it on today when the new day could not be saved', async () => {
    setHabitPlan.mockImplementation(async () => undefined);
    expect((await applyCheckIn('h1', 'habit_move', '2026-10-10')).text).toBe(CHECKIN_COPY.failed);
    expect(days()).toEqual(['2026-10-05', TODAY]);
    expect(removeHabitPlan).not.toHaveBeenCalled();
  });

  it('Move puts the new day back when today could not be taken off', async () => {
    removeHabitPlan.mockImplementationOnce(async () => undefined);
    expect((await applyCheckIn('h1', 'habit_move', '2026-10-10')).text).toBe(CHECKIN_COPY.failed);
    expect(days()).toEqual(['2026-10-05', TODAY]);
  });

  it('Skip takes it off today and quiets its check ins until the week ends', async () => {
    expect(await applyCheckIn('h1', 'habit_skip', null)).toEqual({
      text: "No problem. It's off today, and I won't ask about Strength again this week.",
      week: true,
    });
    expect(days()).toEqual(['2026-10-05']);
    // the quiet runs to Sunday, the last day of their week, and nothing else in views is lost
    expect(updateHabit).toHaveBeenCalledWith('h1', {
      views: { minddrop_stage: 'enriched', checkins_quiet_until: '2026-10-11' },
    });
  });

  it('Skip changes nothing when the quiet could not be saved', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    updateHabit.mockRejectedValueOnce(new Error('offline'));
    expect((await applyCheckIn('h1', 'habit_skip', null)).text).toBe(CHECKIN_COPY.failed);
    expect(days()).toEqual(['2026-10-05', TODAY]);
    expect(removeHabitPlan).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Skip lifts the quiet again when today could not be taken off', async () => {
    removeHabitPlan.mockImplementationOnce(async () => undefined);
    expect((await applyCheckIn('h1', 'habit_skip', null)).text).toBe(CHECKIN_COPY.failed);
    expect(updateHabit).toHaveBeenLastCalledWith('h1', { views: { minddrop_stage: 'enriched' } });
    expect(mockStore.habits[0].views.checkins_quiet_until).toBeUndefined();
  });

  it('says so, and changes nothing, when they did it between the brief and the tap', async () => {
    mockStore.habitProgress = [{ habit_id: 'h1', occurred_day: TODAY }];
    expect(await applyCheckIn('h1', 'habit_move', '2026-10-10')).toEqual({
      text: "Strength is already sorted for today, so I've left it as it is.",
      week: true,
    });
    expect(setHabitPlan).not.toHaveBeenCalled();
    expect(removeHabitPlan).not.toHaveBeenCalled();
  });
});

describe("a habit's week, for the dots", () => {
  const week = (over: Record<string, unknown> = {}) =>
    habitWeekDays({
      habitId: 'h1',
      day: TODAY,
      today: TODAY,
      weeklyDay: 0,
      habitPlans: [plan('h1', TODAY), plan('h1', '2026-10-10'), plan('h2', '2026-10-09')],
      habitProgress: [
        { habit_id: 'h1', occurred_day: '2026-10-05' },
        { habit_id: 'h2', occurred_day: '2026-10-06' },
      ],
      ...over,
    }).map((d) => `${d.day.slice(8)}:${d.state}`);

  it('is the seven days of their week: done, today, planned, or nothing', () => {
    expect(week()).toEqual([
      '05:done',
      '06:none',
      '07:none',
      '08:today',
      '09:none',
      '10:planned',
      '11:none',
    ]);
  });

  it('marks today only while the habit is still on for it', () => {
    const moved = [plan('h1', '2026-10-10'), plan('h1', '2026-10-11')];
    expect(week({ habitPlans: moved }).slice(3)).toEqual([
      '08:none',
      '09:none',
      '10:planned',
      '11:planned',
    ]);
    const done = [{ habit_id: 'h1', occurred_day: TODAY }];
    expect(week({ habitProgress: done })[3]).toBe('08:done');
  });

  it('never shows a day already gone as planned', () => {
    const missed = [plan('h1', '2026-10-06'), plan('h1', '2026-10-10', 'rescheduled')];
    expect(week({ habitPlans: missed, habitProgress: [] })).toEqual([
      '05:none',
      '06:none',
      '07:none',
      '08:none',
      '09:none',
      '10:none',
      '11:none',
    ]);
  });

  it('follows their own weekly day', () => {
    // a Wednesday weekly day: Thursday 8 starts the week
    expect(week({ weeklyDay: 3 }).map((d) => d.slice(0, 2))).toEqual([
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
    ]);
  });
});
