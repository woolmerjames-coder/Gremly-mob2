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

  // the week's board
  weekPlanned: 'Week planned',
  boardTitle: 'Plan your week',
  boardDone: 'Done',
  planMyWeek: 'Plan my week',
  openWeek: 'Open your week',
  fitting: 'Gremly is fitting your week',
  fittingHint: 'This takes about twenty seconds.',
  spreadFailed:
    "I couldn't spread your week just now. You can place things yourself, or have me try again.",
  boardSaving: 'Saving your week',
  tabDays: 'Days',
  tabHabits: 'Habits',
  tabLater: 'Later',
  moveTo: 'Move it to',
  later: 'Later',
  gremlyPick: "Gremly's pick",
  busyNote: "A busy day, so I've kept it light",
  closeTray: 'Close',
  nothingOnDay: 'Nothing on this day yet.',
  habitsIntro: "Pick the days you'll do each one. I've started you off away from the busy days.",
  noHabits: 'No habits to plan this week.',
  laterIntro:
    "Nothing here is lost. Each one has a day it comes back: it shows up on Today and in that night's wrap up. Tap one to give it a day this week instead.",
  laterIntroLoose:
    "Each of these comes back on its day, on Today and in that night's wrap up. The ones with no day yet wait until you give them one. Tap one to give it a day this week.",
  noDayYet: 'No day yet',
  laterEmpty: 'Nothing is waiting in Later.',
  newStep: 'New step',
  thisMonth: 'This month',
  addedThisMonth: 'Added this month',
  everythingElse: 'Everything else',
  boardUndo: 'Undo',
  boardUndone: 'Taken back. Your week is on the board again, and nothing is saved.',
  boardUndoFailed: "I couldn't take all of that back. Have a look at your week before you go on.",
  boardClose: 'Back',

  // their own days: the question, picking which to keep, and the days they overfill
  keepAll: 'Keep my days',
  keepSome: 'Keep some',
  keepNone: 'Rearrange it all',
  keepPickHint: 'Tap a pin to free one for me to place. The rest stay where you put them.',
  keepPickDone: "That's it",
  keepTimed: 'Has a time',
  yourDay: 'Your day',
  overfullFitting: 'Gremly is working out what could move',
  overfullNone:
    "I couldn't work out what to move just now. You can change the day yourself, or leave it.",
  overfullStuck:
    "Everything on it belongs there, so I'd leave it. You can still change it yourself.",
  takeMoves: 'Move these',
  changeMyself: "I'll change it myself",
  leaveIt: 'Leave it',

  // Your week: the week they planned, read back, and changed by hand
  weekIntention: 'YOUR INTENTION',
  weekPriorities: 'What matters most',
  weekDays: 'Day by day',
  weekNothing: 'Nothing was on this day.',
  notDone: 'Not done',
  changeWeek: 'Change your week',
  openConversation: 'Open the conversation',
  planRestAgain: 'Plan the rest of it again',
  weekNotPlanned: "This week isn't planned yet.",
  weekPlanningAgain:
    "You're planning this week again. Finish it in today's chat and it will be here.",
  carryOnPlanning: 'Carry on planning',
  backFromLater: 'Back from Later',
  comesBack: 'Comes back from Later',
  weekUnread: "I couldn't read your week just now. Try again in a moment.",
  changeSaved: 'Saved. Your week is changed.',
  changeUndone: 'Taken back. Your week is as it was.',
  changeFailed: "I couldn't save all of that, so nothing is changed. Try it again.",
  changeUndoFailed: "I couldn't take all of that back. Have a look at your week.",
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
  /** Todos on a day, habit sessions with a day, and steps set up for what is coming */
  todos: number;
  habits: number;
  steps: number;
}): { num: string; label: string }[] {
  return [
    {
      num: String(n.todos),
      label: n.todos === 1 ? 'todo spread across the week' : 'todos spread across the week',
    },
    {
      num: String(n.habits),
      label: n.habits === 1 ? 'habit session with a day' : 'habit sessions with a day',
    },
    {
      num: String(n.steps),
      label: n.steps === 1 ? "step set up for what's coming" : "steps set up for what's coming",
    },
  ];
}

// ── The week's board ────────────────────────────────────────────────────────

/** "1h 30m" for minutes; "45m" under an hour; "0m" for none. */
export function minsLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

/** "9h" for minutes, to the nearest hour: the board's totals. */
export function hoursRound(minutes: number): string {
  return `${Math.round(Math.max(0, minutes) / 60)}h`;
}

/** Gremly's line above the board's card, from the board as it stands. */
export function boardIntro(t: {
  /** Minutes: everything on the board, the room the days give, what the habits take */
  all: number;
  room: number;
  habits: number;
  /**
   * How many todos Gremly put on a day, how many are on a day by their own
   * hand, and how many wait in Later
   */
  gremly: number;
  own: number;
  later: number;
}): string {
  if (!t.gremly && !t.own && !t.later)
    return 'Now the week itself. Nothing is waiting on your list, so the days are clear. Add anything you like.';
  const todos = (n: number) => (n === 1 ? 'one todo' : `${n} todos`);
  const rest = t.later ? 'the rest wait in Later' : 'nothing is left for Later';
  let spread = 'So nothing is on the days yet, and it all waits in Later.';
  if (t.gremly && t.own) {
    spread = `So I've spread ${todos(t.gremly)} across the days, around the ${t.own === 1 ? 'one' : t.own} you'd already placed, priorities first, and ${rest}.`;
  } else if (t.gremly) {
    spread = `So I've spread ${todos(t.gremly)} across the days, priorities first, and ${rest}.`;
  } else if (t.own) {
    spread = `So I've left the ${todos(t.own)} you'd already placed where ${t.own === 1 ? 'it is' : 'they are'}, and ${rest}.`;
  }
  return `Now the week itself. Everything on your list would take about ${hoursRound(t.all)}, and you have about ${hoursRound(Math.max(0, t.room - t.habits))} once your habits are in. ${spread} Move anything you like.`;
}

export function roomLine(minutes: number): string {
  return `Your room this week: about ${hoursRound(minutes)}`;
}

/** What a day has left: "1h 15m free", or "20m over". */
export function leftLabel(left: number): string {
  return left >= 0 ? `${minsLabel(left)} free` : `${minsLabel(-left)} over`;
}

export function addToDay(day: string): string {
  return `+ Add to ${shortDay(day)}`;
}

/**
 * Under a habit on the board: how many of the days they aim for, among the
 * days being planned, have a day.
 */
export function habitPlanned(planned: number, target: number): string {
  return `${planned} of ${target} planned`;
}

/**
 * How long a todo has been around, for its row on the board: "Since Aug,
 * moved 3×". Nothing for one added this month, and New step for a step set up
 * in the review. It counts as old once it has been moved fifteen times.
 */
export function ageLabel(
  t: { created: string | null; moved: number; step: boolean },
  today: string,
): { text: string; old: boolean; show: boolean } {
  if (t.step) return { text: WEEK_COPY.newStep, old: false, show: true };
  if (!t.created || t.created.slice(0, 7) >= today.slice(0, 7)) {
    return { text: '', old: false, show: false };
  }
  const month = MONTH_SHORT[Number(t.created.slice(5, 7)) - 1] ?? '';
  // another year says so, or "Since Oct" could mean this one
  const year = t.created.slice(0, 4) === today.slice(0, 4) ? '' : ` ${t.created.slice(0, 4)}`;
  return {
    text: `Since ${month}${year}${t.moved ? `, moved ${t.moved}×` : ''}`,
    old: t.moved >= 15,
    show: true,
  };
}

/** The day something comes back: "Mon 12" this month, "2 Nov" in another. */
export function backWhen(day: string, today: string): string {
  return day.slice(0, 7) === today.slice(0, 7) ? stepWhen(day) : shortDate(day);
}

/** "Back Mon 12" this month, "Back 2 Nov" in another. */
export function backLabel(day: string, today: string): string {
  return `Back ${backWhen(day, today)}`;
}

// ── Your week: the week they planned, read back ────────────────────────────

/** A day's row in Your week, as its words need it (lib/week/yourWeek.ts WeekDayView). */
interface DayRead {
  when: 'past' | 'today' | 'ahead';
  planned: number | null;
  done: number;
  alsoDone: number;
  todos: { state: string }[];
  habits: { planned: boolean; done: boolean }[];
}

/** How a day went, or what it holds, in a few words: "3 of 4 done, and 2 more". */
export function dayTally(d: DayRead): string {
  const open =
    d.todos.filter((t) => t.state === 'open').length +
    d.habits.filter((h) => h.planned && !h.done).length;
  if (d.when === 'ahead') {
    if (d.planned) return `${d.planned} planned${d.done ? `, ${d.done} done` : ''}`;
    return open ? `${open} planned` : 'Nothing planned';
  }
  if (d.planned) {
    return `${d.done} of ${d.planned} done${d.alsoDone ? `, and ${d.alsoDone} more` : ''}`;
  }
  if (d.alsoDone) return `${d.alsoDone} done`;
  return open ? `${open} to do` : 'Nothing planned';
}

/** "Wed 7", with Today before it on the day itself. */
export function weekDayLabel(day: string, today: string): string {
  return day === today ? `Today, ${stepWhen(day)}` : stepWhen(day);
}

/**
 * What became of a todo, beside its name in Your week. Nothing for one that
 * is done (its tick says so) or is open on a day still to come.
 * @param first the first day of the week shown
 * @param last its last day
 */
export function todoStateLabel(
  t: { state: string; to: string | null },
  when: 'past' | 'today' | 'ahead',
  first: string,
  last: string,
  today: string,
): string | null {
  if (t.state === 'open') return when === 'past' ? WEEK_COPY.notDone : null;
  if (t.state === 'moved') return t.to ? `Moved to ${whenLabel(t.to, first, last)}` : 'Moved';
  // put off until a day that has come: it is back with them, waiting to be given a day
  if (t.state === 'back') return when === 'ahead' ? WEEK_COPY.comesBack : WEEK_COPY.backFromLater;
  if (t.state === 'later') {
    if (!t.to) return 'No day now';
    return t.to <= today ? WEEK_COPY.backFromLater : `In Later, back ${backWhen(t.to, today)}`;
  }
  if (t.state === 'let_go') return 'Let go';
  return null;
}

/** What is waiting in Later, as one line under the days. */
export function laterLine(count: number, next: string | null, today: string): string {
  if (!count || !next) return WEEK_COPY.laterEmpty;
  return count === 1
    ? `One thing is waiting in Later. It comes back ${backWhen(next, today)}.`
    : `${count} things are waiting in Later. The next comes back ${backWhen(next, today)}.`;
}

// ── Their own days: the question, and the days they overfill ────────────────

/** "Wednesday", "Wednesday and Friday", "Monday, Wednesday and Friday". */
function dayNames(days: string[]): string {
  const names = days.map((d) => DAY_NAMES[weekdayOf(d)]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Gremly's question about the days they gave their todos themselves, with
 * the days those overfill named before they answer.
 * @param count how many of their todos are on days of their own
 * @param over the over-full days
 */
export function keepQuestion(count: number, over: string[]): string {
  const ask = `You've already put ${count === 1 ? 'one todo' : `${count} todos`} on the days we're planning. Shall I plan around them, or would you rather I rearranged them?`;
  if (!over.length) return ask;
  return `${ask} ${dayNames(over)} ${over.length === 1 ? 'holds more than it has' : 'hold more than they have'} room for.`;
}

/** What they chose for their own days, as their answer under the card. */
export function keptText(keep: 'all' | 'some' | 'none'): string {
  return keep === 'none'
    ? WEEK_COPY.keepNone
    : keep === 'some'
      ? WEEK_COPY.keepSome
      : WEEK_COPY.keepAll;
}

/** A day's load against its hours, while they pick what to keep: "3h 5m of 2h". */
export function loadLabel(load: number, minutes: number): string {
  return `${minsLabel(load)} of ${minsLabel(minutes)}`;
}

/** Gremly's line on the card for one over-full day. */
export function overfullLine(day: string, over: number, moves: number): string {
  const lead = `${DAY_NAMES[weekdayOf(day)]} holds ${minsLabel(over)} more than it has room for.`;
  if (!moves) return lead;
  return `${lead} ${moves === 1 ? "Here's the one thing I'd move" : "Here's what I'd move"}, if you agree.`;
}

/** Where a suggested move would take a todo: "Fri", or "Later, back Mon 12". */
export function moveTarget(to: string | null, backOn: string | null, today: string): string {
  if (to) return shortDay(to);
  return backOn ? `Later, back ${backWhen(backOn, today)}` : WEEK_COPY.later;
}

/** Said under the moves when taking them all would still leave the day over. */
export function stillLine(still: number): string {
  return `That would still leave it ${minsLabel(still)} over.`;
}

/** The board's title when it is opened to change one over-full day by hand. */
export function changeDayTitle(day: string): string {
  return `Change ${DAY_NAMES[weekdayOf(day)]}`;
}

/** What they chose for an over-full day, as their answer under the card. */
export function relievedText(day: string, how: 'moved' | 'changed' | 'left'): string {
  const name = DAY_NAMES[weekdayOf(day)];
  if (how === 'moved') return `Move these off ${name}`;
  return how === 'changed' ? `I changed ${name} myself` : `Leave ${name} as it is`;
}
