/**
 * Their week in the morning brief (the weekly review): the check in on a
 * habit they planned for today, and the offer of the weekly review while it
 * is still to do.
 *
 * The worker that writes the brief puts both on the brief's last message as
 * facts (workers/inngest-jobs/brief/index.js): checkin, the habit, and
 * review_offer. Nothing about them is in that message's own words or buttons,
 * so an app build that does not know them shows the offer as it always has.
 * Here the message is read with the day as the app holds it now:
 *
 * - While the habit is still planned for today, not done and not quieted, the
 *   message is shown as the check in: Still on, Move it to the day left in
 *   their week with the most room, Skip this week. Once it is answered, the
 *   offer itself follows as a new message.
 * - While the review is still to do, Plan my week is shown beside the offer's
 *   own buttons.
 *
 * Which habit, and the day it can move to, are the rules shared with the
 * worker (workers/shared/habitWeek.js): dates, ids and numbers, never words.
 * Gremly's words here are fixed, since they answer a tap.
 */
import { useMemo } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { useThisWeek } from '../week/thisWeek';
import { addDays, briefOffersReview, busyFor, hoursFor, weekdayOf } from '../week/model';
import {
  QUIET_FIELD,
  checkInOpen,
  daysLeft,
  easeOn,
  moveDayFor,
  moveDaysFor,
  plannedOn,
  roomLeft,
  weekAround,
} from '../week/habitWeek';
import { dayName } from '../week/review/words';
import type { WeekReviewRow } from '../repo/weekReviewRepo';
import type { BriefOfferMeta, OfferButton } from './types';

type Item = Record<string, any>;

export const CHECKIN_COPY = {
  /** lighter: the habit is on a lighter version today; its words, or '' when it has none */
  ask: (title: string, moveTo: string | null, lighter: string | null = null) => {
    const counts =
      lighter === null
        ? ''
        : lighter
          ? // their words sit inside the sentence, so no full stop of ours follows one of theirs
            ` “${lighter}” counts as the lighter version.`
          : ' The lighter version counts.';
    return moveTo
      ? `You planned ${title} for today. Still on?${counts} If not, ${weekdayWord(moveTo)} has room.`
      : `You planned ${title} for today. Still on?${counts}`;
  },
  keep: 'Still on',
  move: (day: string) => `Move it to ${weekdayWord(day)}`,
  skip: 'Skip this week',
  kept: (title: string) => `Nice. ${title} stays on for today.`,
  moved: (title: string, day: string) => `Done. ${title} is on ${weekdayWord(day)} now.`,
  skipped: (title: string) =>
    `No problem. It's off today, and I won't ask about ${title} again this week.`,
  failed: "I couldn't save that just now, so it's still on for today.",
  /** They did it, or took it off today, between the brief and the tap */
  settled: (title: string) => `${title} is already sorted for today, so I've left it as it is.`,
  planWeek: 'Plan my week',
  notToday: 'Not today',
  reviewHint: "Your week isn't planned yet.",
  reviewAsk: "Your week isn't planned yet. Want to do that now?",
} as const;

function weekdayWord(day: string): string {
  return dayName(weekdayOf(day));
}

/** The day as the app holds it now, for the brief's week hooks. */
export interface BriefWeekFacts {
  /**
   * The check in still on for a habit, with the day it can move to, or null
   * when it is no longer on: done, off today, quieted, paused, or another
   * day's thread. lighter is what its lighter version is when it is on one
   * today ('' when it was given no words), and null otherwise.
   */
  checkIn: (
    habitId: string,
  ) => { title: string; moveTo: string | null; lighter: string | null } | null;
  /**
   * The days several habits still on for today can move to, each given its
   * day in turn so no day is filled twice (the evening's habits card).
   */
  moveDays: (habitIds: string[]) => Map<string, string>;
  /** The weekly review is still to do, on one of the mornings it is offered */
  reviewOffer: boolean;
}

export interface WeekFactsInput {
  /** The day of the thread the brief is in */
  date: string;
  /** The person's day now */
  today: string;
  habits: Item[];
  habitPlans: Item[];
  habitProgress: Item[];
  /** Their pauses and lighter versions (habit_adaptations rows) */
  eases: Item[];
  todos: Item[];
  weeklyDay: number;
  daysOff: number[];
  /** The review of the week they are in, once the week has been read */
  review: Pick<WeekReviewRow, 'week_start' | 'status' | 'answers' | 'read'> | null;
  /** The week has been read: until then nothing is said about the review */
  loaded: boolean;
}

/** The facts, from the day's data. Pure. */
export function weekFactsFrom(p: WeekFactsInput): BriefWeekFacts {
  const live = p.date === p.today;
  const planned = plannedOn(p.habitPlans, p.today);
  const doneToday = new Set(
    p.habitProgress.filter((x) => x.occurred_day === p.today).map((x) => x.habit_id as string),
  );
  const days = daysLeft(p.today, p.weeklyDay);
  // the week's shape is its review's; without one, the hours every board falls back to
  const row =
    p.review && p.review.week_start === weekAround(p.today, p.weeklyDay).first ? p.review : null;
  // Their weekly day decides which days are left and when the week ends, so
  // nothing is said of a habit's week until it has been read: the day the app
  // starts with is only a stand in.
  const known = live && p.loaded;
  const open = (habitId: string) => {
    const habit = known ? p.habits.find((h) => h.id === habitId) : null;
    return habit && checkInOpen(habit, { today: p.today, planned, doneToday, eases: p.eases })
      ? habit
      : null;
  };
  const room = () =>
    roomLeft({
      days,
      hours: hoursFor(row?.answers, row?.read),
      daysOff: p.daysOff,
      busyDays: busyFor(row?.answers, row?.read, days),
      todos: p.todos,
      habits: p.habits,
      plans: p.habitPlans,
    });
  return {
    checkIn: (habitId) => {
      const habit = open(habitId);
      if (!habit) return null;
      const ease = easeOn(p.eases, habit.id, p.today);
      return {
        title: (habit.name || habit.title || 'Habit') as string,
        moveTo: moveDayFor({ habit, days, plans: p.habitPlans, room: room(), eases: p.eases }),
        lighter: ease?.mode === 'lighter' ? ease.note : null,
      };
    },
    moveDays: (habitIds) =>
      moveDaysFor({
        habits: habitIds.map(open).filter((h): h is Item => !!h),
        days,
        plans: p.habitPlans,
        room: room(),
        eases: p.eases,
      }),
    reviewOffer: live && p.loaded && briefOffersReview(p.today, p.weeklyDay, p.review),
  };
}

function inputFromStores(date: string, today: string): WeekFactsInput {
  const s = useGremlyStore.getState() as any;
  const w = useThisWeek.getState();
  return {
    date,
    today,
    habits: s.habits ?? [],
    habitPlans: s.habitPlans ?? [],
    habitProgress: s.habitProgress ?? [],
    eases: s.habitAdaptations ?? [],
    todos: s.todos ?? [],
    weeklyDay: w.weeklyDay,
    daysOff: w.daysOff,
    review: w.review,
    loaded: w.loaded,
  };
}

/**
 * The facts as the stores hold them now, for a tap or a typed message. today
 * is the person's day; the evening wrap up hands in its own, which is that day.
 */
export function briefWeekFacts(
  date: string,
  today: string = getDateService().ritualDay(),
): BriefWeekFacts {
  return weekFactsFrom(inputFromStores(date, today));
}

/** The facts for the screen that draws the thread: they follow the stores. */
export function useBriefWeekFacts(date: string | null): BriefWeekFacts | null {
  const habits = useGremlyStore((s: any) => s.habits) as Item[];
  const habitPlans = useGremlyStore((s: any) => s.habitPlans) as Item[];
  const habitProgress = useGremlyStore((s: any) => s.habitProgress) as Item[];
  const eases = useGremlyStore((s: any) => s.habitAdaptations) as Item[];
  const todos = useGremlyStore((s: any) => s.todos) as Item[];
  const weeklyDay = useThisWeek((w) => w.weeklyDay);
  const daysOff = useThisWeek((w) => w.daysOff);
  const review = useThisWeek((w) => w.review);
  const loaded = useThisWeek((w) => w.loaded);
  const today = getDateService().ritualDay();
  return useMemo(
    () =>
      date
        ? weekFactsFrom({
            date,
            today,
            habits: habits ?? [],
            habitPlans: habitPlans ?? [],
            habitProgress: habitProgress ?? [],
            eases: eases ?? [],
            todos: todos ?? [],
            weeklyDay,
            daysOff,
            review,
            loaded,
          })
        : null,
    [
      date,
      today,
      habits,
      habitPlans,
      habitProgress,
      eases,
      todos,
      weeklyDay,
      daysOff,
      review,
      loaded,
    ],
  );
}

/** What an offer shows: its words, its buttons, and the quiet line under them. */
export interface OfferView {
  content: string;
  buttons: OfferButton[];
  hint?: string;
  /** Shown as the habit check in, not as the offer itself */
  checkIn: boolean;
}

/** The check in a message is waiting on, when it is still on. */
export function checkInWaiting(
  meta: BriefOfferMeta,
  facts: BriefWeekFacts | null,
): { habit_id: string; title: string; moveTo: string | null; lighter: string | null } | null {
  const c = meta.checkin;
  if (!c || c.asked || meta.chosen || !facts) return null;
  const on = facts.checkIn(c.habit_id);
  return on
    ? { habit_id: c.habit_id, title: on.title, moveTo: on.moveTo, lighter: on.lighter }
    : null;
}

/**
 * An offer as it is shown. A message that was answered as the check in keeps
 * the check in's words for good; one still waiting shows it while the habit
 * is still on; otherwise the offer shows as itself, with Plan my week beside
 * its buttons while the review is still to do.
 */
export function shownOffer(
  content: string,
  meta: BriefOfferMeta,
  facts: BriefWeekFacts | null,
): OfferView {
  if (meta.checkin?.asked) {
    return { content: CHECKIN_COPY.ask(meta.checkin.title, null), buttons: [], checkIn: true };
  }
  // a brief with nothing of its own to offer asked about the week instead: once answered, it still reads so
  if (meta.review_offer && !meta.buttons.length && meta.chosen) {
    return { content: CHECKIN_COPY.reviewAsk, buttons: [], checkIn: false };
  }
  const waiting = checkInWaiting(meta, facts);
  if (waiting) {
    return {
      content: CHECKIN_COPY.ask(waiting.title, waiting.moveTo, waiting.lighter),
      buttons: [
        { id: 'habit_keep', label: CHECKIN_COPY.keep, action: 'habit_keep', primary: true },
        ...(waiting.moveTo
          ? [
              {
                id: 'habit_move',
                label: CHECKIN_COPY.move(waiting.moveTo),
                action: 'habit_move' as const,
                value: waiting.moveTo,
              },
            ]
          : []),
        { id: 'habit_skip', label: CHECKIN_COPY.skip, action: 'habit_skip' },
      ],
      checkIn: true,
    };
  }
  if (meta.review_offer && facts?.reviewOffer && !meta.chosen) {
    const planWeek: OfferButton = {
      id: 'plan_week',
      label: CHECKIN_COPY.planWeek,
      action: 'plan_week',
    };
    // a brief with nothing of its own to offer asks about the week instead of signing off
    if (!meta.buttons.length) {
      return {
        content: CHECKIN_COPY.reviewAsk,
        buttons: [
          { ...planWeek, primary: true },
          { id: 'not_today', label: CHECKIN_COPY.notToday, action: 'not_today' },
        ],
        hint: meta.hint,
        checkIn: false,
      };
    }
    return {
      content,
      buttons: [...meta.buttons, planWeek],
      hint: meta.hint ?? CHECKIN_COPY.reviewHint,
      checkIn: false,
    };
  }
  return { content, buttons: meta.buttons, hint: meta.hint, checkIn: false };
}

/** What a tap on the check in came to: Gremly's words, and whether the habit's week is shown. */
export interface CheckInOutcome {
  text: string;
  /** The habit's week is drawn under Gremly's reply */
  week: boolean;
}

const plansOf = (habitId: string): Set<string> =>
  new Set(
    ((useGremlyStore.getState() as any).habitPlans ?? [])
      .filter((p: Item) => p.habit_id === habitId)
      .map((p: Item) => String(p.planned_date).slice(0, 10)),
  );

/**
 * Move a habit from one day it is planned on to another it is not: the new
 * day is saved first, then the old one comes off, and the new day is taken
 * back if it does not, so a habit's days move whole or not at all. False when
 * nothing was moved. Used by the morning check in and by the evening's habits
 * card (lib/wrapup).
 */
export async function moveHabitDay(habitId: string, from: string, to: string): Promise<boolean> {
  const store = useGremlyStore.getState() as any;
  if (from === to || plansOf(habitId).has(to)) return false;
  await store.setHabitPlan(habitId, to);
  if (!plansOf(habitId).has(to)) return false;
  await store.removeHabitPlan(habitId, from);
  if (plansOf(habitId).has(from)) {
    await store.removeHabitPlan(habitId, to);
    // neither change held: said, since the habit is now planned on both days
    if (plansOf(habitId).has(to)) {
      console.warn(
        `[Week] a habit could not be moved and is left planned on both days: ${habitId}, ${from} and ${to}`,
      );
    }
    return false;
  }
  return true;
}

/**
 * Do what a tap on the check in asks. Still on changes nothing. Move takes
 * the habit off today and puts it on the day the button named. Skip takes it
 * off today and quiets its check ins until their week ends.
 *
 * The store's habit writers put their own change back when a save fails and
 * do not throw, so what was saved is read back rather than assumed.
 */
export async function applyCheckIn(
  habitId: string,
  action: 'habit_keep' | 'habit_move' | 'habit_skip',
  moveTo: string | null,
): Promise<CheckInOutcome> {
  const store = useGremlyStore.getState() as any;
  const today = getDateService().ritualDay();
  const habit = (store.habits ?? []).find((h: Item) => h.id === habitId) as Item | undefined;
  const title = (habit?.name || habit?.title || 'It') as string;
  if (!habit || !briefWeekFacts(today).checkIn(habitId)) {
    return { text: CHECKIN_COPY.settled(title), week: !!habit };
  }
  if (action === 'habit_keep') return { text: CHECKIN_COPY.kept(title), week: true };

  if (action === 'habit_move') {
    const moved = !!moveTo && (await moveHabitDay(habitId, today, moveTo));
    return {
      text: moved ? CHECKIN_COPY.moved(title, moveTo as string) : CHECKIN_COPY.failed,
      week: true,
    };
  }

  // Skip this week: the quiet is saved first, so a check in is never silenced without its day coming off
  const until = weekAround(today, useThisWeek.getState().weeklyDay).last;
  const views = { ...(habit.views ?? {}) };
  try {
    await store.updateHabit(habitId, { views: { ...views, [QUIET_FIELD]: until } });
  } catch (err) {
    console.warn('[DailyBrief] could not quiet the habit check in:', err);
    return { text: CHECKIN_COPY.failed, week: true };
  }
  await store.removeHabitPlan(habitId, today);
  if (plansOf(habitId).has(today)) {
    await store
      .updateHabit(habitId, { views })
      .catch((err: unknown) => console.warn('[DailyBrief] could not undo the quiet:', err));
    return { text: CHECKIN_COPY.failed, week: true };
  }
  return { text: CHECKIN_COPY.skipped(title), week: true };
}

/** One day of a habit's week, for the dots under Gremly's reply. */
export interface HabitWeekDay {
  day: string;
  state: 'done' | 'today' | 'planned' | 'none';
}

/**
 * The seven days of the week a day is in, for one habit: done, today while
 * the habit is still on for it, a day ahead it is planned on, or nothing.
 */
export function habitWeekDays(p: {
  habitId: string;
  day: string;
  today: string;
  weeklyDay: number;
  habitPlans: Item[];
  habitProgress: Item[];
}): HabitWeekDay[] {
  const { first } = weekAround(p.day, p.weeklyDay);
  const done = new Set(
    p.habitProgress.filter((x) => x.habit_id === p.habitId).map((x) => x.occurred_day as string),
  );
  const planned = new Set(
    p.habitPlans
      .filter((x) => x.habit_id === p.habitId && (!x.status || x.status === 'planned'))
      .map((x) => String(x.planned_date).slice(0, 10)),
  );
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(first, i);
    const state = done.has(day)
      ? 'done'
      : !planned.has(day) || day < p.today
        ? 'none'
        : day === p.today
          ? 'today'
          : 'planned';
    return { day, state };
  });
}
