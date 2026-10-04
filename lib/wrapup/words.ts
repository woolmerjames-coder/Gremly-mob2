/**
 * Gremly's words in the evening wrap up.
 *
 * Every line here is a fixed sentence filled in from the day: it answers a tap
 * or states a count, so no model writes it. They are all in this one file so
 * that Gremly's own words can replace them later (step 10 of the agent plan)
 * without the flow changing. Copy follows the approved prototype (Gremly
 * Evening Thread, version 2, "This build").
 *
 * No dashes as punctuation. Days are counted from the person's day, which
 * after midnight is still yesterday until their day ends: then tomorrow is
 * named by its weekday so nobody has to work out which day is meant.
 */

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "three", then "12" past nine. */
export function numberWord(n: number): string {
  return n >= 0 && n < NUMBERS.length ? NUMBERS[n] : String(n);
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "a", "a and b", "a, b and c". */
export function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What "tomorrow" is called tonight, and the day being wrapped up. */
export interface WrapDay {
  /** "Wednesday": the day being wrapped up */
  weekday: string;
  /** "tomorrow", or its weekday after midnight */
  tomorrow: string;
  /** True after midnight, before their day ends */
  late: boolean;
}

const tomorrowCap = (d: WrapDay) => cap(d.tomorrow);

function things(n: number): string {
  return `${numberWord(n)} ${n === 1 ? 'thing' : 'things'}`;
}

/** "about a minute", "about two minutes": twenty seconds a card. */
export function sweepMinutes(cards: number): string {
  const minutes = Math.max(1, Math.round((cards * 20) / 60));
  return minutes === 1 ? 'about a minute' : `about ${numberWord(minutes)} minutes`;
}

export const WRAP_COPY = {
  // the offer's buttons
  sweepNow: 'Sweep now',
  planWeek: 'Plan my week',
  notTonight: 'Not tonight',
  finishOne: 'Finish it',
  finishMany: 'Finish them',
  leaveOne: 'Leave it',
  leaveMany: 'Leave them',
  // the journal
  journalAsk: 'How was today?',
  journalAskOnly: 'Of course. How was today?',
  journalWrite: 'Write a few lines',
  journalMood: 'Just pick a mood',
  journalSkip: 'Skip tonight',
  journalOnly: 'Just the journal',
  journalSaved: 'Saved in your journal.',
  journalMoodAsk: 'Sure. How did today feel?',
  journalMoodSaved: "Saved. That's tonight's reflection.",
  journalSkipped: 'No problem.',
  journalFailed: "I couldn't save that just now. It is still in the box if you want to try again.",
  journalPlaceholder: 'Write a few lines…',
  journalTag: 'Saving to your journal',
  // Gremly's questions
  questionTag: 'Answering Gremly',
  questionType: 'Type an answer',
  questionOther: 'Something else',
  questionSkip: 'Skip',
  answered: 'Thanks, saved.',
  answerFailed: "I couldn't save that just now, so I'll ask again another time.",
  questionSkipped: "No problem, I'll ask another time.",
  savedEvent: 'Saved your answer',
  // the cards
  allSorted: 'All sorted.',
  everythingPlaced: 'Everything has a place now.',
  leaveRest: "Sure. They'll be in the morning brief.",
  leaveRestOne: "Sure. It'll be in the morning brief.",
  // still open today
  stillHeading: 'Still open today',
  stillHint: 'Untick any to leave',
  stillLeave: 'Leave them',
  stillLeaveOne: 'Leave it',
  stillMoved: 'Moved',
  stillLeft: 'No problem, they stay where they are.',
  stillLeftOne: 'No problem, it stays where it is.',
  // habits
  habitsHeading: 'Habits still open',
  habitsHint: 'Tap what happened',
  habitsSavedHeading: "Tonight's check in",
  habitsSave: 'Save check in',
  habitsNone: 'Nothing tonight',
  habitsAll: 'All habits',
  held: 'Held it',
  notHeld: 'Not today',
  habitsLogged: 'Logged.',
  habitsNothing: "No problem. They'll be there tomorrow.",
  // the rest
  notTonightReply: "No problem. It'll all be here tomorrow, and nothing's lost.",
  planTomorrowSet: "Done. It'll be on Today when you wake up.",
  thatsTomorrow: "That's tomorrow",
  nightButton: 'Night, Gremly',
  weekToast: 'The week planner',
} as const;

/** Gremly's first line: the day, by name. */
export function openerLine(d: WrapDay, firstName: string | null, evening: boolean): string {
  const name = firstName ? `, ${firstName}` : '';
  if (d.late) return `Still up${name}? Here's your ${d.weekday}.`;
  if (evening) return `Evening${name}. Here's your ${d.weekday}.`;
  return `Here's your ${d.weekday} so far${name ? `${name}.` : '.'}`;
}

/** What was on today's plan and did not happen, said once. */
export function missedLine(titles: string[], hasCards: boolean): string {
  const where = hasCards ? 'after the cards' : 'in a moment';
  if (titles.length === 1) {
    return `One thing you planned didn't happen: ${titles[0]}. I'll bring it up ${where}.`;
  }
  return `${cap(things(titles.length))} you planned didn't happen. I'll bring them up ${where}.`;
}

/** The offer: how many cards, and about how long. */
export function offerLine(cards: number, d: WrapDay): string {
  const when = d.late ? `before ${d.tomorrow}` : 'tonight';
  if (cards === 1) return `One thing to sort ${when}. Want to go through it?`;
  return `${cap(things(cards))} to sort ${when}, ${sweepMinutes(cards)}. Want to go through them?`;
}

/** A night with no cards. */
export function clearLine(planned: { done: number; total: number } | null, late: boolean): string {
  const when = late ? 'left to sort' : 'to sort tonight';
  if (planned && planned.total > 0 && planned.done >= planned.total) {
    return `Everything you planned got done, and there's nothing ${when}.`;
  }
  return `Nothing ${when}.`;
}

export function moveAllButton(d: WrapDay): string {
  return `Move it all to ${d.tomorrow}`;
}

export function skipsHint(left: number): string {
  return `Moving it all uses one of your ${numberWord(left)} weekly skips`;
}

/** Back in the thread after every card. */
export function sortedLine(letGo: number): string {
  if (letGo > 0) return `${WRAP_COPY.allSorted} ${cap(numberWord(letGo))} let go, and that's fine.`;
  return `${WRAP_COPY.allSorted} ${WRAP_COPY.everythingPlaced}`;
}

/** The cards were closed part way. */
export function partialLine(sorted: number, left: number, d: WrapDay): string {
  const them = left === 1 ? 'it' : 'them';
  return `${cap(numberWord(sorted))} sorted and saved. Want to finish the last ${left === 1 ? 'one' : numberWord(left)}, or leave ${them} for ${d.tomorrow}?`;
}

/** Coming back after Not tonight. */
export function resumeLine(cards: number): string {
  return `Sure. ${cap(things(cards))} to sort, ${sweepMinutes(cards)}.`;
}

export function stillLine(n: number, d: WrapDay): string {
  if (n === 1) return `One todo from today is still open. Move it to ${d.tomorrow}?`;
  return `${cap(numberWord(n))} todos from today are still open. Move them to ${d.tomorrow}?`;
}

export function stillApply(n: number, total: number, d: WrapDay): string {
  if (n === total && total === 2) return `Move both to ${d.tomorrow}`;
  if (n === total && total === 1) return `Move it to ${d.tomorrow}`;
  if (n === total) return `Move all ${numberWord(total)} to ${d.tomorrow}`;
  return `Move ${n} to ${d.tomorrow}`;
}

export function habitsLine(build: number, breaking: number): string {
  if (!build && breaking) {
    return breaking === 1
      ? 'One habit to check in on. Did it hold today?'
      : `${cap(numberWord(breaking))} habits to check in on. Did they hold today?`;
  }
  if (build === 1) return 'One habit is still open today. Did it happen?';
  return `${cap(numberWord(build))} habits are still open today. Did ${build === 2 ? 'either' : 'any'} happen?`;
}

/** After the habit card is saved. */
export function habitsSavedLine(p: {
  logged: number;
  /** The first logged habit with a run of days, as it stands now */
  streak?: { title: string; days: number } | null;
  held: string[];
  notHeld: string[];
}): string {
  const parts: string[] = [];
  if (p.logged > 0 && p.streak && p.streak.days >= 3) {
    parts.push(`Logged. That's ${numberWord(p.streak.days)} days running for ${p.streak.title}.`);
  } else if (p.logged > 0 || p.held.length) {
    parts.push(WRAP_COPY.habitsLogged);
  } else if (!p.notHeld.length) {
    parts.push(WRAP_COPY.habitsNothing);
  }
  if (p.held.length) parts.push(`Well done holding ${listWords(p.held)}.`);
  if (p.notHeld.length) {
    parts.push(`No worries about ${listWords(p.notHeld)}, tomorrow is a fresh one.`);
  }
  return parts.join(' ');
}

export function questionsIntro(n: number): string {
  return n === 1
    ? "One quick question, then you're done."
    : `${cap(numberWord(n))} quick questions, then you're done.`;
}

/** A question tied to an item: the answer is saved, and the item is shown to open. */
export function answeredWithItem(kind: 'todo' | 'habit' | 'note' | 'event'): string {
  const what = kind === 'note' ? 'note' : kind;
  return `Thanks, saved. Here's the ${what}, in case it needs changing.`;
}

/** The skip: what moved, what waits, and the weekly skips left. */
export function skippedLine(moved: number, waiting: number, skipsLeft: number, d: WrapDay): string {
  const parts: string[] = [];
  if (moved > 0) {
    parts.push(
      `${cap(numberWord(moved))} ${moved === 1 ? 'todo has' : 'todos have'} moved to ${d.tomorrow}`,
    );
  }
  if (waiting > 0) {
    parts.push(
      `${moved > 0 ? `the other ${numberWord(waiting)}` : cap(things(waiting))} will wait for your next Sweep`,
    );
  }
  const first = parts.length ? `Done. ${parts.join(', and ')}.` : 'Done.';
  return skipsLeft > 0
    ? `${first} That's one skip used, ${numberWord(skipsLeft)} left this week.`
    : `${first} That was your last skip this week.`;
}

export function movedEvent(n: number, d: WrapDay): string {
  return `Moved ${n} ${n === 1 ? 'todo' : 'todos'} to ${d.tomorrow}`;
}

export function sweptEvent(decided: number): string {
  return `Swept ${decided} ${decided === 1 ? 'thing' : 'things'}`;
}

/** The close: the day wrapped up, and what tomorrow holds. */
export function closeLine(d: WrapDay, meetings: number, lined: string[]): string {
  const has: string[] = [];
  if (meetings > 0) has.push(`${numberWord(meetings)} ${meetings === 1 ? 'meeting' : 'meetings'}`);
  let tail: string;
  if (!lined.length)
    tail = has.length ? ', and nothing else lined up yet' : ' nothing lined up yet';
  else if (lined.length <= 3) {
    tail = `${has.length ? ', and ' : ' '}${listWords(lined)} lined up`;
  } else tail = `${has.length ? ', and ' : ' '}${things(lined.length)} lined up`;
  return `That's ${d.weekday} wrapped up. ${tomorrowCap(d)} has${has.length ? ` ${has[0]}` : ''}${tail}.`;
}

export function planTomorrowButton(d: WrapDay): string {
  return d.late ? `Plan ${d.tomorrow}` : 'Plan tomorrow';
}

export function nightLine(firstName: string | null): string {
  return firstName ? `Night, ${firstName}. Sleep well.` : 'Night. Sleep well.';
}

export function endTitle(d: WrapDay): string {
  return `${d.weekday}, wrapped up`;
}

/** "3 AM", "midnight": when the thread moves to history. */
export function endNote(dayEndHour: number): string {
  const at =
    dayEndHour === 0
      ? 'midnight'
      : `${dayEndHour % 12 === 0 ? 12 : dayEndHour % 12} ${dayEndHour < 12 ? 'AM' : 'PM'}`;
  return `This thread moves to your history when the day ends at ${at}`;
}

/** Gremly's quiet evening line on Drop and Today, and on the pinned card. */
export function teaserLine(cards: number): { lead: string; rest: string } {
  return cards > 0
    ? { lead: 'Ready to wrap up?', rest: `${cap(things(cards))} to sort. Tap here` }
    : { lead: 'Ready to wrap up?', rest: 'Nothing to sort. Tap here' };
}

export function pinnedLine(cards: number): string {
  return cards > 0
    ? `Wrap up today: ${cards} ${cards === 1 ? 'thing' : 'things'} to decide`
    : 'Wrap up today: a look back at your day';
}

/** New things dropped after the wrap up was finished: once, for the new ones only. */
export function newSinceLine(n: number): string {
  return n === 1
    ? 'One new thing since we wrapped up. Sort it now, or leave it for the morning?'
    : `${cap(things(n))} new since we wrapped up. Sort them now, or leave them for the morning?`;
}
