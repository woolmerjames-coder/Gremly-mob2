/**
 * Gremly's words for the fed moment and the age up.
 *
 * First person, plain, about the two of them. The credit goes to the person
 * as a fact, never as praise. Lines that come from a pool rotate so the same
 * one is not read two days running. Nothing here names an age band on screen;
 * the bands only shape how his line reads as he gets older.
 *
 * Spec: the celebrations build plan (6 Oct 2026) and prototype version 3.
 */

export type FedDay = 1 | 2 | 3;

export const FED_KICKER = 'Out of your head';
export const AGE_KICKER = 'Age';
export const CARD_LABEL = 'What got me here';
export const CARD_CLOSE = 'I’m made of that.';
export const CARD_FALLBACK = 'Three clear days.';
export const HOOK_LINE = 'Three more fed days to the next one';
export const KEEP_GOING = 'Keep going';
export const AFTER_LINE = 'Three more fed days and I grow again.';
export const MORNING_LINE = 'Feed me today and I grow.';
/** When the third day is fed but the age has not come back from the server yet. */
export const WAITING_LINE = 'That’s three. I grow in a moment.';

const MIDDLE_DOT = '·';

const FED_LINES: Record<FedDay, readonly string[]> = {
  1: ['You fed me.', 'Fed. Thank you.', 'All of it, mine now.'],
  2: ['You fed me again.', 'Two days fed.', 'Fed. Twice.'],
  3: ['Three days.', 'That’s three.'],
};

const FED_COUNTS: Record<FedDay, string> = {
  1: 'One of three. Two more and I grow.',
  2: 'Two of three. One more and I grow.',
  3: 'Three of three. Here we go.',
};

const FED_BUBBLES: Record<1 | 2, readonly string[]> = {
  1: ['Two more days like this and I grow.', 'Same again twice and I grow.'],
  2: ['One more day like this and I grow.', 'Tomorrow could be the one.'],
};

/** How his line under the number reads, by how old he is. Never shown as a band. */
const AGE_BANDS: ReadonlyArray<readonly [number, number, string]> = [
  [0, 2, 'Bigger.'],
  [3, 5, '{n}. I feel different.'],
  [6, 9, '{n}. I feel different. Do I look it?'],
  [10, 15, '{n}. What’s next?'],
  [16, 25, '{n}. We’re getting good at this.'],
  [26, 40, '{n}. Steady as we go.'],
  [41, 60, '{n}. You keep showing up. So do I.'],
  [61, 120, '{n}. Every day of it with you.'],
  [121, 250, '{n}. I remember one.'],
  [251, 500, '{n}. Not many get here.'],
  [501, Number.POSITIVE_INFINITY, '{n}. From the Sock Palace, thank you.'],
];

const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

/** The number as he says it: spelled out up to twelve, numerals after. */
export function spellAge(age: number): string {
  const n = Math.max(0, Math.round(age));
  return n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

/** His line under the number. */
export function getAgeLine(age: number): string {
  const band = AGE_BANDS.find(([lo, hi]) => age >= lo && age <= hi) ?? AGE_BANDS[2];
  return band[2].replace('{n}', spellAge(age));
}

/** The pools remember the last pick so a line is not read two days running. */
const lastPick = new Map<string, number>();

function pick(key: string, pool: readonly string[]): string {
  if (pool.length === 1) return pool[0];
  const last = lastPick.get(key);
  let index = Math.floor(Math.random() * pool.length);
  if (index === last) index = (index + 1) % pool.length;
  lastPick.set(key, index);
  return pool[index];
}

/** For tests: forget which lines were read last. */
export function resetMomentWords(): void {
  lastPick.clear();
}

/** The big line on the fed wash. */
export function getFedLine(day: FedDay): string {
  return pick('fed' + day, FED_LINES[day]);
}

/** The count under the dots on the fed wash. */
export function getFedCount(day: FedDay): string {
  return FED_COUNTS[day];
}

/** His bubble once the wash has gone, on a day that is not an age up. */
export function getFedBubble(day: FedDay): string {
  if (day === 3) return WAITING_LINE;
  return pick('bubble' + day, FED_BUBBLES[day]);
}

/** The card: the written line, or the fallback, always with the fixed close. */
export function cardText(line: string | null | undefined): string {
  const body = (line ?? '').trim();
  return (body || CARD_FALLBACK) + ' ' + CARD_CLOSE;
}

/**
 * The count under the Send button. Null means nothing is shown (an unfed day
 * with nothing banked). fedDaysCount is the store's count toward the next age,
 * 0 to 2, which resets to 0 at an age up.
 */
export function getCaption(fedDaysCount: number, isFedToday: boolean): string | null {
  const banked = Math.min(Math.max(Math.round(fedDaysCount), 0), 3);
  if (isFedToday) {
    if (banked === 0) return 'Fed today ' + MIDDLE_DOT + ' the next age in 3 fed days';
    return 'Fed today ' + MIDDLE_DOT + ' ' + banked + ' of 3 to the next age';
  }
  if (banked === 0) return null;
  return banked + ' of 3 fed days to the next age';
}

/** The fed day this crossing is: the store's count plus one, capped at three. */
export function fedDayFor(fedDaysCount: number): FedDay {
  const day = Math.round(fedDaysCount) + 1;
  return (day <= 1 ? 1 : day === 2 ? 2 : 3) as FedDay;
}
