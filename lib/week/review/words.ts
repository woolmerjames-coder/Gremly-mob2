/**
 * The weekly review's fixed words: Gremly's lines between the cards, the
 * buttons, and how days and hours are written. Copy follows the approved
 * prototype (Weekly sweep prototype, "Sunday's weekly review"), with the day
 * and the counts worked out from data. No dashes as punctuation.
 *
 * Everything Gremly writes about the week itself (the challenge, the picks,
 * the drafts) comes from the weekly read; these are only the fixed sentences
 * around it.
 */
import { weekdayOf, type ReviewKind, type WeekHours } from '../model';

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** "Sunday" for a weekday, 0 Sunday to 6 Saturday. */
export function dayName(weekday: number): string {
  return DAY_NAMES[weekday] ?? '';
}

/** "Mon" for a YYYY-MM-DD day. */
export function shortDay(day: string): string {
  return DAY_SHORT[weekdayOf(day)];
}

/** "M" for a YYYY-MM-DD day. */
export function dayLetter(day: string): string {
  return DAY_SHORT[weekdayOf(day)][0];
}

/** "20 Oct" for a YYYY-MM-DD day. */
export function shortDate(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1] ?? ''}`.trim();
}

/** "Mon 5" for a YYYY-MM-DD day: a step's day on a milestone card. */
export function stepWhen(day: string): string {
  return `${shortDay(day)} ${Number(day.split('-')[2])}`;
}

/** When something is: the day's name inside the days being planned, the date outside them. */
export function whenLabel(day: string, first: string, last: string): string {
  return day >= first && day <= last ? shortDay(day) : shortDate(day);
}

/** "Mon 5 to Sun 11 Oct" for the days a review plans. */
export function spanLabel(first: string, last: string): string {
  return `${stepWhen(first)} to ${shortDay(last)} ${shortDate(last)}`;
}

/** "2h 30m" for hours in half hour steps; "0h" for none. */
export function hoursLabel(hours: number | null | undefined): string {
  const mins = Math.round((hours ?? 0) * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h && !m) return '0h';
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "two" for 2, "12" for 12. */
export function countWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

export type DayPartName = 'morning' | 'afternoon' | 'evening';

export const WEEK_COPY = {
  kicker: 'YOUR WEEKLY REVIEW',
  start: "Let's do it",
  skip: 'Not this week',
  notNow: 'Not now',
  tryAgain: 'Try again',
  carryOn: 'Carry on',
  justPlan: 'Just plan it',
  change: 'Change',
  save: 'Save',
  skipStep: 'Skip this',

  loadingLine: 'Give me a minute to look at everything.',
  loadingTitle: 'Gremly is reading your week',
  loadingHint: 'This can take a minute.',
  loadFailed: "I couldn't get your week ready just now. Want to try again?",
  stopped: "No problem. It's here whenever you want it.",

  challengeIntro: "I've had a look at everything. Here's how this week looks to me.",
  challengeKicker: 'THE BIG CHALLENGE',
  comingOff: 'COMING OFF',
  comingUp: 'COMING UP',
  youAdded: 'YOU ADDED',
  agree: "That's about right",
  disagree: 'Not quite',
  tellMe: "Tell me what I've got wrong, and I'll take it into the week.",
  challengeHint: "Anything I've missed?",

  prioritiesIntro:
    "So what matters most this week? Pick up to three. The ones with a star are where I'd start.",
  noPriorities: 'Nothing in particular',

  shapeIntro: "Good. A bit about the shape of the week, so I don't overfill it.",
  deadlines: 'Deadlines and big moments',
  noDeadlines: 'Nothing with a date in the next few weeks.',
  addOne: 'Add one',
  add: 'Add',
  busiest: 'Busiest days',
  busyGuess: 'My guess. Tap a day to change it.',
  busySet: "I'll keep these days light.",
  freeHours: 'Free hours for todos and habits',
  freeHoursHint: "Outside work and anything fixed. Change it to what's real.",
  normalDay: 'A normal day',
  busyDay: 'A busy day',
  weekendDay: 'A weekend day',
  dayOff: 'A day off',
  noneThisWeek: 'None this week',
  markBusy: 'Mark busy days above',
  shapeDone: "That's the shape",

  intentionIntro: 'One line to hold onto this week? Here are a few, or write your own.',
  ownWords: 'Or in your own words',
  keepThis: 'Keep this one',
  noIntention: 'No intention this week',

  legendTodo: 'Todo',
  legendCheck: 'Gremly checks in at the wrap up',
  aheadNext: 'Next',
  setUpDone: 'Set up. Tap to undo',
  setUp: 'Set up',

  talk: 'Talk it through',
  enough: "That's enough for these",

  noAnswer: "I couldn't get to that just now. Try me again in a moment.",
  stepFailed: "Something went wrong there, so that isn't saved yet. Try it again.",
  openFailed: "I couldn't open your week just now. Try again in a moment.",
  holdHint: 'Answer Gremly to carry on',
  typeHint: 'Tell Gremly anything',

  doneKicker: 'YOUR WEEK',
  doneLine: "That's your week. It's here whenever you want to look at it again.",
  guessed: "I've gone with my best guesses for the rest. Change anything that isn't right.",
  resumed: "Let's pick your week up where we left it.",
  yourWeek: "Here's the week you planned.",
  planWeek: 'Plan your week',
  seeWeek: 'Your week',
  planNext: 'Plan next week',
  planAgainLine:
    "Want to plan the rest of this week again? I'll take a fresh look at everything first. There's one of these a week.",
  planAgain: 'Plan the rest of it',
} as const;

/** The reasons under a needs you question: taps that go to Gremly as their words. */
export const TALK_REASONS = [
  'Feels too big',
  'Not sure it matters',
  'Waiting on something',
  'Just no time',
];

/** Gremly's opening line, by what the review is and when it is opened. */
export function openerLine(o: {
  kind: ReviewKind;
  /** Days since their weekly day: 0 on the day itself */
  since: number;
  weekday: number;
  part: DayPartName;
}): string {
  if (o.kind === 'brought_forward')
    return "Want to plan next week a day early? I'll take a fresh look at everything first. Got ten minutes?";
  if (o.kind === 'extra')
    return "Want to plan the rest of this week together? I'll take a fresh look at everything first. Got ten minutes?";
  if (o.since === 0)
    return `${dayName(o.weekday)} ${o.part}, the best time to look at the week together. Got ten minutes?`;
  return "The week has started, and there's still time to plan the rest of it together. Got ten minutes?";
}

/** Gremly's line after Not this week. */
export function skippedLine(kind: ReviewKind, weeklyDay: number): string {
  return kind === 'weekly'
    ? `No problem. Your week stays as it is, and I'll ask again next ${dayName(weeklyDay)}.`
    : 'No problem. Your week stays as it is.';
}

/** The button under the priorities: how many they picked. */
export function prioritiesButton(n: number, editing: boolean): string {
  if (editing) return WEEK_COPY.save;
  if (!n) return WEEK_COPY.skipStep;
  return n === 1 ? 'This one' : `These ${countWord(n)}`;
}

/** What they settled on the shape, as their message. */
export function shapeText(busy: string[], hours: WeekHours, offLabel: string): string {
  const days = busy.length ? `Busiest on ${busy.map(shortDay).join(', ')}. ` : '';
  const w = (h: number | undefined) => (h ? hoursLabel(h) : 'no time');
  return `${days}About ${w(hours.normal_day)} free on a normal day, ${w(hours.busy_day)} on a busy one, ${w(hours.weekend_day)} ${offLabel}.`;
}

/** An intention in quotes, exactly as they kept it. */
export function intentionQuote(text: string): string {
  return `“${text.trim()}”`;
}

/** Gremly's line above the milestone cards. */
export function aheadIntro(n: number): string {
  const what = n === 1 ? 'one thing is' : `${countWord(n)} things are`;
  return `Looking further out, ${what} big enough to plan backwards from. Want steps along the way? Tap any step to leave it out.`;
}

export function setUpButton(steps: number): string {
  return steps === 1 ? 'Set up this step' : `Set up these ${countWord(steps)} steps`;
}

/** What they settled on what is ahead, as their message. */
export function aheadText(goals: string[]): string {
  if (!goals.length) return WEEK_COPY.notNow;
  const list =
    goals.length === 1
      ? goals[0]
      : `${goals.slice(0, -1).join(', ')} and ${goals[goals.length - 1]}`;
  return `Set up the steps for ${list}`;
}

/** Gremly's line above the needs you cards. */
export function needsYouIntro(n: number): string {
  return n === 1
    ? 'This one needs you most. Tap it to talk it through, or leave it be.'
    : `These ${countWord(n)} need you most. Tap one to talk it through, or leave them be.`;
}

/** Their message when they open one to talk it through. */
export function talkOpener(title: string): string {
  return `Let's talk about this one: ${title}`;
}

/** The Done step's question after a review done on another day than their weekly day. */
export function moveDayQuestion(today: number): string {
  return `One more thing. You planned this on a ${dayName(today)}. Want ${dayName(today)} to be your weekly day from now on?`;
}
export function keepDayButton(weeklyDay: number): string {
  return `Keep ${dayName(weeklyDay)}`;
}
export function moveDayButton(today: number): string {
  return `Make it ${dayName(today)}`;
}
export function dayKeptLine(weeklyDay: number): string {
  return `${dayName(weeklyDay)} it stays.`;
}
export function dayMovedLine(today: number): string {
  return `Done. Your weekly review is on ${dayName(today)}s from now on, and this one counts as this week's.`;
}
/** Their weekly day moved, and the week that starts tomorrow already had a review of its own. */
export function dayMovedTakenLine(today: number): string {
  return `Done. Your weekly review is on ${dayName(today)}s from now on. The week that starts tomorrow already has a review of its own, so this one stays with the week it was made for.`;
}
/** Their weekly day moved, and the review could not be counted for the new week. */
export function dayMovedNotCountedLine(today: number): string {
  return `Your weekly review is on ${dayName(today)}s from now on. I couldn't count this one as this week's just now, so it stays with the week it was made for.`;
}
/** Added when the review moved to the new week and its intention could not be brought with it. */
export const INTENTION_LEFT =
  "I couldn't bring your intention across with it, so set it again if you want it kept.";
export const DAY_MOVE_FAILED =
  "I couldn't move your weekly day just now. It's in Settings, under Your week.";

/** The summary tiles on the Done card. */
export function doneTiles(n: {
  priorities: number;
  steps: number;
  talked: number;
}): { num: string; label: string }[] {
  return [
    {
      num: String(n.priorities),
      label: n.priorities === 1 ? 'thing that matters most' : 'things that matter most',
    },
    {
      num: String(n.steps),
      label: n.steps === 1 ? "step set up for what's coming" : "steps set up for what's coming",
    },
    {
      num: String(n.talked),
      label: n.talked === 1 ? 'thing talked through' : 'things talked through',
    },
  ];
}
