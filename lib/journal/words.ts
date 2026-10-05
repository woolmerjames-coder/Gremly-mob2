/**
 * The words on the journal page, and the days it shows.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type DayWords = {
  /** "Wednesday" */
  weekday: string;
  /** "30 September" */
  long: string;
  /** "Wed 30 Sep" */
  short: string;
  /** "September 2026" */
  month: string;
};

/** How a YYYY-MM-DD day reads on the page. */
export function dayWords(day: string): DayWords {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return { weekday: day, long: day, short: day, month: day };
  const weekday = DAYS[d.getUTCDay()];
  const month = MONTHS[d.getUTCMonth()];
  return {
    weekday,
    long: `${d.getUTCDate()} ${month}`,
    short: `${weekday.slice(0, 3)} ${d.getUTCDate()} ${month.slice(0, 3)}`,
    month: `${month} ${d.getUTCFullYear()}`,
  };
}

/** The small line over the day on a page being written: "Journal · evening" */
export function writingKicker(part: 'morning' | 'afternoon' | 'evening'): string {
  return `Journal · ${part}`;
}

/** The small line over the day on a goal check in: "Check in · Run a 10k" */
export function checkInKicker(goalName: string): string {
  return `Check in · ${goalName}`;
}

/** "16 words", "1 word, 2 photos" */
export function countLabel(words: number, photos = 0): string {
  const w = `${words} ${words === 1 ? 'word' : 'words'}`;
  return photos ? `${w}, ${photos} ${photos === 1 ? 'photo' : 'photos'}` : w;
}

/** Said when there is no room for another page of the person's own */
export function tooManyPages(most: number): string {
  return `You have ${most} pages of your own. Delete one to make another.`;
}

export const JOURNAL_COPY = {
  kickerSaved: 'Journal · saved',
  kickerLooking: 'Looking back',
  done: 'Done',
  close: 'Close the journal page',
  closeLooking: 'Back to today',
  calendar: 'Look back at other days',
  placeholderFree: 'Start writing...',
  placeholderPrompt: 'Write here...',
  placeholderTail: 'Anything else...',
  placeholderOwnPrompt: 'Your question',
  addPrompt: 'Add a prompt',
  keepPage: 'Keep as my page',
  makeOwn: 'Make your own',
  removePrompt: 'Remove this prompt',
  moodsTitle: 'How did today feel?',
  moodsHint: 'Leave these and Gremly reads the mood from your words, as he does now.',
  photosTitle: 'Photos',
  nothingYet: 'Nothing on the page yet',
  notSaved: 'It was not saved. Your words are still here.',
  edit: 'Edit',
  delete: 'Delete this entry',
  backToToday: 'Back to today',
  deleteAsk: 'Delete this entry?',
  deleteBody: 'It will be taken out of your journal.',
  deleteYes: 'Delete',
  cancel: 'Cancel',
  // the calendar, and looking back
  untitled: 'Journal entry',
  calToday: 'Today',
  calWritingNow: 'The page you are writing now.',
  calSavedToday: 'Saved today. Open it to add more.',
  calStartedToday: 'You started a page today.',
  calNothingToday: 'Nothing written yet today.',
  calKeepWriting: 'Keep writing',
  calWriteToday: 'Write today',
  calOpenToday: 'Open today',
  calOpenDay: 'Open this day',
  calOpen: 'Open',
  calNothing: 'Nothing written that day.',
  calTapDay: 'Tap a day to see what you wrote.',
  calPrevMonth: 'The month before',
  calNextMonth: 'The month after',
  calLegendToday: 'Today',
  calLegendHas: 'Has an entry',
  calClose: 'Close the calendar',
  lookBefore: 'The entry before',
  lookAfter: 'The entry after',
  hubEmpty: 'Nothing in your journal yet.',
  // a page of the person's own
  ownAbout: 'Your page.',
  ownNewTitle: 'Make your own page',
  ownEditTitle: 'Your page',
  ownSub: 'Your own questions, kept with the built in pages. It opens by itself next time.',
  ownName: 'Name',
  ownNamePlaceholder: 'My evening page',
  ownNameDefault: 'My page',
  ownQuestions: 'Questions',
  ownFirstPlaceholder: 'Your first question',
  ownNextPlaceholder: 'Another question',
  ownAddQuestion: 'Add a question',
  ownRemoveQuestion: 'Remove this question',
  ownSave: 'Save page',
  ownSaveChanges: 'Save changes',
  ownDelete: 'Delete this page',
  ownClose: 'Close without saving',
  ownNeedsQuestion: 'Add at least one question',
  ownSaved: 'Saved. It opens by itself next time.',
  ownDeleted: 'Page deleted. What you wrote stays.',
  ownDeleteAsk: 'Delete this page?',
  ownDeleteBody: 'What you wrote on it stays in your journal.',
  ownNotSaved: 'Your page was not saved. Check your signal and try again.',
  ownNotDeleted: 'Your page was not deleted. Check your signal and try again.',
} as const;
