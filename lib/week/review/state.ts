/**
 * The weekly review's state, worked out without side effects so it can be
 * tested: which steps a read gives, what each card starts from, what was
 * settled in words, what Gremly is told about the review (the week sent with
 * a message in today's thread), and what the Week button reads.
 *
 * The review's row (weekly_reviews) keeps the read Gremly made and the
 * person's answers. Where the review has got to is kept in the answers too
 * (answers.step), so a review left part way is picked up where it was, on any
 * day and in any thread. Everything here is decided from ids, dates and
 * numbers; nobody's words are read.
 */
import type { WeekTurnContext } from '../../cortex/CortexClient';
import { easesFrom } from '../habitWeek';
import { WEEK_LIMITS, type Milestone } from '../../changes/model';
import type { WeekAnswers, WeekRead, WeekReviewRow } from '../../repo/weekReviewRepo';
import {
  DEFAULT_DAYS_OFF,
  FALLBACK_HOURS,
  WEEK_STEPS,
  addDays,
  cycleOf,
  dayKind,
  daysOffOf,
  extraUsed,
  isDay,
  normHours,
  reviewOn,
  reviewWith,
  spanDays,
  type WeekHours,
  type WeekStep,
} from '../model';
import {
  WEEK_COPY,
  aheadText,
  dayName,
  hoursLabel,
  intentionQuote,
  shapeText,
  shortDay,
} from './words';

/** What a review opened today is (workers/shared/week.js reviewWith). */
export type ReviewOn = ReturnType<typeof reviewWith>;

/** The steps of the conversation, in order, ending with the week's board. */
export type ChatStep = Exclude<WeekStep, 'offer' | 'done'>;
const CHAT_STEPS: ChatStep[] = [
  'challenge',
  'priorities',
  'shape',
  'intention',
  'ahead',
  'needs_you',
  'board',
];

/** Hours a card starts from when neither last week nor Gremly's guess gives any (shared with the board). */
export { FALLBACK_HOURS };

/**
 * How many priorities they keep (the change model's own limit, which the
 * workers check a new one against), and how many moments the timeline has room for.
 */
export const MAX_PRIORITIES = WEEK_LIMITS.priorities;
export const TIMELINE_MAX = 5;

/** A milestone from the read, as its card shows it today. */
export interface ShownMilestone {
  /** The dated thing it leads up to: the card's key */
  key: string;
  goal: string;
  date: string;
  steps: Milestone['steps'];
}

/**
 * The read's milestones that can still be set up today: steps whose day has
 * gone are left out (a read made for the weekly day is used for two days
 * after it, and a review can be picked up later still), and a milestone with
 * no step left, or whose date is not ahead, is not shown.
 */
export function milestonesShown(read: WeekRead | null, today: string): ShownMilestone[] {
  const out: ShownMilestone[] = [];
  for (const m of read?.milestones ?? []) {
    if (!isDay(m.date) || m.date <= today) continue;
    const steps = (m.steps ?? []).filter((s) => isDay(s.by) && s.by >= today && s.by <= m.date);
    if (!steps.length) continue;
    out.push({ key: m.about?.id ?? `${m.goal}:${m.date}`, goal: m.goal, date: m.date, steps });
  }
  return out;
}

/** The steps a review goes through for a read: a step with nothing to show is left out. */
export function stepsFor(read: WeekRead | null, today: string): ChatStep[] {
  return CHAT_STEPS.filter((s) => {
    if (s === 'priorities') return (read?.priority_options ?? []).length > 0;
    if (s === 'ahead') return milestonesShown(read, today).length > 0;
    if (s === 'needs_you') return (read?.needs_you ?? []).length > 0;
    return true;
  });
}

/** The step after one: done when it was the last. */
export function stepAfter(steps: ChatStep[], step: WeekStep): ChatStep | 'done' {
  const i = steps.indexOf(step as ChatStep);
  if (i >= 0) return steps[i + 1] ?? 'done';
  // a step this read does not have: the first of its steps that comes later
  const at = WEEK_STEPS.indexOf(step);
  return steps.find((s) => WEEK_STEPS.indexOf(s) > at) ?? 'done';
}

/** Whether a step is behind the one the review is on: settled, and open to Change. */
export function isPast(step: WeekStep, at: WeekStep | undefined): boolean {
  return !!at && WEEK_STEPS.indexOf(step) < WEEK_STEPS.indexOf(at);
}

/**
 * The step a review is on, as its row has it: one of the conversation's
 * steps, or done. The challenge until the row says otherwise.
 */
export function stepOf(row: WeekReviewRow | null): ChatStep | 'done' {
  const s = row?.answers.step;
  if (s === 'done') return 'done';
  return s && (CHAT_STEPS as WeekStep[]).includes(s) ? (s as ChatStep) : 'challenge';
}

/** The days a review opened today plans, first to last. */
export function daysPlanned(on: ReviewOn): string[] {
  return spanDays(on.span_start, on.span_end);
}

// ── What each card starts from ──────────────────────────────────────────────

/** What the cards hold while they are being filled in: nothing here is saved until a step is settled. */
export interface WeekDraft {
  /** Indexes into the read's priority options */
  priorities: number[];
  hours: Required<WeekHours>;
  busy: string[];
  /** Deadlines taken off the list, by key (dateKey) */
  datesOut: string[];
  /** The draft picked (an index into the read's drafts), or their own words */
  intention: { pick: number | null; own: string };
  /** Steps left out of each milestone, by the milestone's key */
  stepsOut: Record<string, number[]>;
}

/** A moment on the deadlines list, by the dated thing it is when it is one of theirs. */
export function dateKey(c: WeekRead['coming_up'][number], index: number): string {
  return c.item ? `${c.item.type}:${c.item.id}` : `${c.when}:${index}`;
}

function hoursFrom(v: WeekHours | null | undefined): Partial<Required<WeekHours>> {
  const out: Partial<Required<WeekHours>> = {};
  for (const k of ['normal_day', 'busy_day', 'weekend_day'] as const) {
    const h = normHours(v?.[k]);
    if (h !== undefined) out[k] = h;
  }
  return out;
}

/**
 * What the cards start from: what was settled when the review has been here
 * before, otherwise last week's hours, then Gremly's guess. Busy days are
 * the read's, and only those among the days being planned.
 */
export function draftFor(
  row: WeekReviewRow | null,
  days: string[],
  lastHours: WeekHours | null = null,
): WeekDraft {
  const read = row?.read ?? null;
  const a = row?.answers ?? {};
  const options = priorityOptions(read, a);
  const drafts = read?.intention_drafts ?? [];
  const kept = typeof a.intention === 'string' ? a.intention.trim() : '';
  const pick = kept ? drafts.findIndex((d) => d.trim() === kept) : -1;
  const inSpan = (list: string[] | undefined) => (list ?? []).filter((d) => days.includes(d));
  return {
    priorities: (a.priorities ?? [])
      .map((p) => options.findIndex((o) => o.text === p.text))
      .filter((i) => i >= 0),
    hours: {
      ...FALLBACK_HOURS,
      ...hoursFrom(read?.free_hours_guess),
      ...hoursFrom(lastHours),
      ...hoursFrom(a.hours),
    },
    busy: a.busy_days ? inSpan(a.busy_days) : inSpan(read?.busy_days),
    datesOut: a.dates_out ?? [],
    intention: { pick: pick >= 0 ? pick : null, own: pick >= 0 ? '' : kept },
    stepsOut: {},
  };
}

/** The intention the card holds now: their own words when there are any, else the draft picked. */
export function intentionOf(read: WeekRead | null, d: WeekDraft['intention']): string {
  const own = d.own.trim();
  if (own) return own;
  return d.pick != null ? (read?.intention_drafts?.[d.pick] ?? '').trim() : '';
}

/** One thing they can keep as mattering most this week, as its chip on the card. */
export interface PriorityOption {
  text: string;
  item_ids: string[];
  /** Gremly's own pick among the read's options */
  star: boolean;
  /** Theirs: added in their own words through Gremly, and no option of the read's */
  own: boolean;
}

/**
 * What the priorities card offers: the read's options, then anything they
 * added to what matters most themselves (the change model's priority), which
 * the read knows nothing of. The card's draft holds indexes into this list,
 * and the read's options always come first, so those indexes stay as they are
 * when one of their own is added.
 */
export function priorityOptions(
  read: WeekRead | null,
  answers: WeekAnswers | null | undefined,
): PriorityOption[] {
  const fromRead = (read?.priority_options ?? []).map((o) => ({
    text: o.text,
    item_ids: o.item_ids ?? [],
    star: !!o.gremly_pick,
    own: false,
  }));
  const own = (answers?.priorities ?? [])
    .filter((p) => !fromRead.some((o) => o.text === p.text))
    .map((p) => ({ text: p.text, item_ids: p.item_ids ?? [], star: false, own: true }));
  return [...fromRead, ...own];
}

/**
 * The priorities picked, as the row keeps them.
 * @param answers the review's answers, for the ones they added themselves
 */
export function prioritiesOf(
  read: WeekRead | null,
  picks: number[],
  answers: WeekAnswers | null = null,
): WeekAnswers['priorities'] {
  const options = priorityOptions(read, answers);
  return picks
    .filter((i) => options[i])
    .slice(0, MAX_PRIORITIES)
    .map((i) => ({ text: options[i].text, item_ids: options[i].item_ids }));
}

/**
 * What Just plan it takes as mattering most: what they added themselves
 * first, since they said so in their own words, then Gremly's picks.
 */
export function guessedPriorities(
  read: WeekRead | null,
  answers: WeekAnswers | null | undefined,
): NonNullable<WeekAnswers['priorities']> {
  const own = priorityOptions(read, answers)
    .filter((o) => o.own)
    .map((o) => ({ text: o.text, item_ids: o.item_ids }));
  return [...own, ...(prioritiesOf(read, gremlyPicks(read)) ?? [])].slice(0, MAX_PRIORITIES);
}

/** Gremly's own picks for what matters most: what Just plan it takes. */
export function gremlyPicks(read: WeekRead | null): number[] {
  return (read?.priority_options ?? [])
    .map((o, i) => (o.gremly_pick ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, MAX_PRIORITIES);
}

/** The total free hours over the days being planned, for the line under the steppers. */
export function hoursTotal(
  days: string[],
  hours: WeekHours,
  busy: string[],
  daysOff: number[],
): number {
  return days.reduce(
    (sum, day) => sum + (hours[dayKind(day, { daysOff, busyDays: busy })] ?? 0),
    0,
  );
}

/** Whether their days off are Saturday and Sunday, so the card can say "weekend". */
export function isWeekend(daysOff: number[]): boolean {
  const off = daysOffOf(daysOff);
  const usual = daysOffOf(DEFAULT_DAYS_OFF);
  return off.length === usual.length && off.every((d, i) => d === usual[i]);
}

// ── What was settled, in words ──────────────────────────────────────────────

/** What a settled step came to, as the person's message under its card. */
export function settledText(
  step: WeekStep,
  row: WeekReviewRow,
  ctx: { daysOff: number[]; days: string[] },
): string | null {
  const a = row.answers;
  switch (step) {
    case 'challenge':
      return a.challenge?.agreed ? WEEK_COPY.agree : null;
    case 'priorities':
      return a.priorities?.length
        ? a.priorities.map((p) => p.text).join(', ')
        : WEEK_COPY.noPriorities;
    case 'shape':
      return shapeText(
        (a.busy_days ?? []).filter((d) => ctx.days.includes(d)),
        a.hours ?? {},
        isWeekend(ctx.daysOff) ? 'at weekends' : 'on a day off',
      );
    case 'intention':
      return a.intention ? intentionQuote(a.intention) : WEEK_COPY.noIntention;
    case 'ahead':
      return aheadText((a.milestones ?? []).map((m) => m.goal));
    case 'needs_you':
      return WEEK_COPY.enough;
    case 'board':
      return WEEK_COPY.weekPlanned;
    default:
      return null;
  }
}

type Settled = NonNullable<NonNullable<WeekTurnContext['under_way']>['settled']>;

/**
 * Everything settled so far, for Gremly: what kind of thing, the item it is
 * about when it is one, how it is now and what it was before.
 */
export function settledFor(row: WeekReviewRow, days: string[]): Settled {
  const a = row.answers;
  const read = row.read;
  const at = stepOf(row);
  const out: Settled = [];
  const names = (list: string[]) => list.map(shortDay).join(', ') || 'none';
  if (isPast('priorities', at)) {
    for (const p of a.priorities ?? []) {
      out.push({ kind: 'priority', item_ids: p.item_ids, title: p.text, outcome: 'chosen' });
    }
  }
  if (isPast('shape', at)) {
    const h = a.hours ?? {};
    const g = read?.free_hours_guess ?? null;
    const say = (v: WeekHours | null) =>
      v
        ? `${hoursLabel(v.normal_day)} on a normal day, ${hoursLabel(v.busy_day)} on a busy day, ${hoursLabel(v.weekend_day)} on a day off`
        : '';
    out.push({ kind: 'hours', title: 'Free hours', outcome: say(h), was: say(g) });
    out.push({
      kind: 'busy_days',
      title: 'Busy days',
      outcome: names((a.busy_days ?? []).filter((d) => days.includes(d))),
      was: names((read?.busy_days ?? []).filter((d) => days.includes(d))),
    });
  }
  if (isPast('intention', at) && a.intention) {
    out.push({
      kind: 'intention',
      ...(a.intention_id ? { id: a.intention_id, type: 'note' as const } : {}),
      title: a.intention,
      outcome: 'kept',
    });
  }
  for (const m of a.milestones ?? []) {
    out.push({
      kind: 'milestone',
      title: m.goal,
      outcome: m.steps === 1 ? 'one step set up' : `${m.steps} steps set up`,
    });
  }
  for (const n of a.needs_you ?? []) {
    out.push({ kind: 'needs_you', item_ids: n.item_ids, title: n.title, outcome: n.decision });
  }
  return out;
}

// ── What Gremly is told ─────────────────────────────────────────────────────

export interface WeekContextInput {
  today: string;
  weeklyDay: number;
  daysOff: number[];
  /** The review of the week they are in, as the app holds it */
  thisWeek: WeekReviewRow | null;
  /** The review under way in the thread on screen, when there is one, and what it is */
  review: WeekReviewRow | null;
  on: ReviewOn | null;
  /** The week's intention as its note has it */
  intention: { id: string | null; text: string } | null;
  /** The needs you card opened to talk through (an index into the read's) */
  talking: number | null;
  /** The question Gremly's last reply left the review waiting on */
  hold: string | null;
  /** The week's board as it stands (lib/week/board workingPicture), once there is one */
  board?: {
    placed: { id: string; day: string }[];
    later: { id: string; back_on: string }[];
    habit_days: { id: string; days: string[] }[];
  } | null;
  /** The habits paused or on a lighter version from today on (easedFor) */
  eased: NonNullable<WeekTurnContext['eased']>;
}

/**
 * The habits paused or on a lighter version from a day on, for what Gremly
 * is told about their week: each with its name and the days it runs. Only
 * habits still here.
 * @param rows their habit_adaptations rows
 */
export function easedFor(
  habits: { id: string; name?: string | null; title?: string | null; archived?: boolean | null }[],
  rows: Record<string, any>[],
  today: string,
): NonNullable<WeekTurnContext['eased']> {
  const names = new Map(
    habits.filter((h) => !h.archived).map((h) => [h.id, h.name || h.title || 'Habit']),
  );
  return easesFrom(rows, today)
    .filter((e) => names.has(e.habit_id))
    .slice(0, 40)
    .map((e) => ({
      habit_id: e.habit_id,
      title: names.get(e.habit_id) as string,
      mode: e.mode,
      first: e.first,
      last: e.last,
      note: e.note,
    }));
}

/**
 * Their week, sent with every message in today's thread (and in Ask Gremly,
 * without the review): their weekly day and days off, this week's review as
 * its row has it, and the review under way with everything settled so far.
 */
export function weekTurnContext(p: WeekContextInput): WeekTurnContext {
  const review = p.review;
  const read = review?.read ?? null;
  const live = !!review && !!p.on && !!read && ['started', 'done'].includes(review.status);
  // the shape belongs to the review under way when there is one, else to this week's
  const shapeOf = live ? review : p.thisWeek;
  const row = (r: WeekReviewRow | null) =>
    r
      ? { week_start: r.week_start, span_start: r.span_start, status: r.status, kind: r.kind }
      : null;
  const ctx: WeekTurnContext = {
    weekly_day: p.weeklyDay,
    days_off: p.daysOff,
    review: row(p.thisWeek),
    extra_used: extraUsed(p.thisWeek),
    hours: shapeOf?.answers.hours ?? null,
    busy_days: shapeOf?.answers.busy_days ?? [],
    intention: p.intention,
    // what matters most as it stands: sending it says this build can keep a new one
    priorities: (shapeOf?.answers.priorities ?? []).map((x) => x.text),
    eased: p.eased,
  };
  if (!live || !review || !p.on || !read) return ctx;
  const days = daysPlanned(p.on);
  const about = p.talking != null ? read.needs_you?.[p.talking] : null;
  ctx.under_way = {
    step: review.status === 'done' ? 'done' : stepOf(review),
    first: p.on.span_start,
    last: p.on.span_end,
    week_start: review.week_start,
    challenge: read.challenge
      ? { headline: read.challenge.headline, why: read.challenge.why }
      : null,
    picks: (read.priority_options ?? [])
      .filter((o) => o.gremly_pick)
      .map((o) => ({ text: o.text, item_ids: o.item_ids ?? [] })),
    settled: settledFor(review, days),
    // the board as it stands, none of it saved until they finish
    habit_days: (p.board?.habit_days ?? []).slice(0, 40),
    placed: (p.board?.placed ?? []).slice(0, 200),
    later: (p.board?.later ?? []).slice(0, 200),
    about: about
      ? {
          title: about.title,
          item_ids: about.item_ids ?? [],
          stuck_because: about.stuck_because,
          question: about.question,
        }
      : null,
    hold: p.hold,
  };
  return ctx;
}

// ── The Week button ─────────────────────────────────────────────────────────

/**
 * What the Week button on Today reads. Once this week's review is done it
 * reads Your week. Until then it reads Plan your week, and it is highlighted
 * from their weekly day through the two days after, unless they said not this
 * week.
 * @param row the review of the week they are in (lib/week/thisWeek)
 */
export function weekButton(
  today: string,
  weeklyDay: number,
  row: Pick<WeekReviewRow, 'status' | 'week_start'> | null,
): { label: string; done: boolean; highlighted: boolean } {
  const mine = row && row.week_start === cycleOf(today, weeklyDay).week_start ? row : null;
  if (mine?.status === 'done') return { label: WEEK_COPY.seeWeek, done: true, highlighted: false };
  return {
    label: WEEK_COPY.planWeek,
    done: false,
    highlighted: reviewOn(today, weeklyDay).promoted && mine?.status !== 'skipped',
  };
}

/**
 * Whether Today leads with Plan your week: on their weekly day itself, until
 * this week's review is done or they have said not this week. It is a card at
 * the top of Today, or a button on the weekly summary's banner while that is
 * showing (components/WeeklySummaryBanner).
 * @param row the review of the week they are in (lib/week/thisWeek)
 */
export function weekCardToday(
  today: string,
  weeklyDay: number,
  row: Pick<WeekReviewRow, 'status' | 'week_start'> | null,
): boolean {
  return cycleOf(today, weeklyDay).since === 0 && weekButton(today, weeklyDay, row).highlighted;
}

/**
 * The button the weekly summary ends on, beside Done: Plan next week on their
 * weekly day, Plan your week on the days after, and Your week once the review
 * is done. Null for any summary but the one of the week that has just ended:
 * an older week opened from the archive has no week ahead to plan.
 * @param summaryWeekEnd the last day of the week the summary covers
 * @param row the review of the week they are in (lib/week/thisWeek)
 */
export function summaryWeekButton(
  today: string,
  weeklyDay: number,
  row: Pick<WeekReviewRow, 'status' | 'week_start'> | null,
  summaryWeekEnd: string | null | undefined,
): { label: string; done: boolean } | null {
  const cycle = cycleOf(today, weeklyDay);
  // the week that has just ended is the one that ended on the weekly day this cycle began on
  if (!summaryWeekEnd || summaryWeekEnd.slice(0, 10) !== cycle.start) return null;
  const week = weekButton(today, weeklyDay, row);
  if (week.done) return { label: week.label, done: true };
  return { label: cycle.since === 0 ? WEEK_COPY.planNext : week.label, done: false };
}

/**
 * The week a finished review counts for once its day becomes their weekly
 * day: the week that starts the day after today. Its first planned day moves
 * inside that week when it was before it.
 */
export function rekeyed(
  today: string,
  newWeeklyDay: number,
  row: Pick<WeekReviewRow, 'span_start'>,
): { week_start: string; span_start: string } {
  const weekStart = cycleOf(today, newWeeklyDay).week_start;
  const last = addDays(weekStart, 6);
  const span =
    row.span_start < weekStart ? weekStart : row.span_start > last ? last : row.span_start;
  return { week_start: weekStart, span_start: span };
}

/** Whether the Done step asks about their weekly day: a review done on another day, asked once. */
export function asksAboutDay(row: WeekReviewRow, on: ReviewOn | null): boolean {
  return !!on && (on.kind === 'extra' || on.kind === 'brought_forward') && !row.answers.day_asked;
}

export { dayName };
