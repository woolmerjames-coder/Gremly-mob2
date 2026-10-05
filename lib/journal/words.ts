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

/** "16 words", "1 word, 2 photos" */
export function countLabel(words: number, photos = 0): string {
  const w = `${words} ${words === 1 ? 'word' : 'words'}`;
  return photos ? `${w}, ${photos} ${photos === 1 ? 'photo' : 'photos'}` : w;
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
} as const;
