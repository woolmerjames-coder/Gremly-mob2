/**
 * Gremly's fixed lines in the evening wrap up (lib/wrapup/words): the counts
 * read right at one, two and many, tomorrow is named after midnight, and
 * nothing a person reads uses a dash as punctuation.
 */
import * as words from '../words';
import {
  clearLine,
  closeLine,
  endNote,
  habitsLine,
  habitsSavedLine,
  missedLine,
  offerLine,
  openerLine,
  partialLine,
  skippedLine,
  sweepMinutes,
  type WrapDay,
} from '../words';

const EVENING: WrapDay = { weekday: 'Wednesday', tomorrow: 'tomorrow', late: false };
const LATE: WrapDay = { weekday: 'Wednesday', tomorrow: 'Thursday', late: true };

test('the opener names the day, and the person when their name is known', () => {
  expect(openerLine(EVENING, 'James', true)).toBe("Evening, James. Here's your Wednesday.");
  expect(openerLine(EVENING, null, true)).toBe("Evening. Here's your Wednesday.");
  expect(openerLine(LATE, 'James', true)).toBe("Still up, James? Here's your Wednesday.");
  expect(openerLine(EVENING, 'James', false)).toBe("Here's your Wednesday so far, James.");
  expect(openerLine(EVENING, null, false)).toBe("Here's your Wednesday so far.");
});

test('what was planned and did not happen is said once', () => {
  expect(missedLine(['Book the car service'])).toBe(
    "One thing you planned didn't happen: Book the car service.",
  );
  expect(missedLine(['A', 'B'])).toBe("Two things you planned didn't happen.");
});

test('the offer counts the cards and the minutes', () => {
  expect(offerLine(5, EVENING)).toBe(
    'Five things to sort tonight, about two minutes. Want to go through them?',
  );
  expect(offerLine(1, EVENING)).toBe('One thing to sort tonight. Want to go through it?');
  expect(offerLine(5, LATE)).toBe(
    'Five things to sort before Thursday, about two minutes. Want to go through them?',
  );
  expect(sweepMinutes(1)).toBe('about a minute');
  expect(sweepMinutes(12)).toBe('about four minutes');
});

test('a clear night says so, with the plan when there was one', () => {
  expect(clearLine({ done: 5, total: 5 }, false)).toBe(
    "Everything you planned got done, and there's nothing to sort tonight.",
  );
  expect(clearLine(null, false)).toBe('Nothing to sort tonight.');
  expect(clearLine({ done: 2, total: 5 }, true)).toBe('Nothing left to sort.');
});

test('closing the cards part way offers the rest once', () => {
  expect(partialLine(3, 2, EVENING)).toBe(
    'Three sorted and saved. Want to finish the last two, or leave them for tomorrow?',
  );
  expect(partialLine(4, 1, LATE)).toBe(
    'Four sorted and saved. Want to finish the last one, or leave it for Thursday?',
  );
});

test('the habit lines', () => {
  expect(habitsLine(2, 1)).toBe('Two habits are still open today. Did either happen?');
  expect(habitsLine(1, 0)).toBe('One habit is still open today. Did it happen?');
  expect(habitsLine(3, 0)).toBe('Three habits are still open today. Did any happen?');
  expect(habitsLine(0, 1)).toBe('One habit to check in on. Did it hold today?');
  expect(
    habitsSavedLine({
      logged: 1,
      streak: { title: 'Blinkist', days: 5 },
      held: ['No Coffee After 2pm'],
      notHeld: [],
    }),
  ).toBe("Logged. That's five days running for Blinkist. Well done holding No Coffee After 2pm.");
  expect(habitsSavedLine({ logged: 0, streak: null, held: [], notHeld: [] })).toBe(
    "No problem. They'll be there tomorrow.",
  );
  expect(habitsSavedLine({ logged: 0, streak: null, held: [], notHeld: ['Snacking'] })).toBe(
    'No worries about Snacking, tomorrow is a fresh one.',
  );
});

test('a skip says what moved, what waits and the skips left', () => {
  expect(skippedLine(4, 3, 2, EVENING)).toBe(
    "Done. Four todos have moved to tomorrow, and the other three will wait for your next Sweep. That's one skip used, two left this week.",
  );
  expect(skippedLine(1, 0, 0, LATE)).toBe(
    'Done. One todo has moved to Thursday. That was your last skip this week.',
  );
  expect(skippedLine(0, 2, 1, EVENING)).toBe(
    "Done. Two things will wait for your next Sweep. That's one skip used, one left this week.",
  );
});

test('the close says what tomorrow holds', () => {
  expect(closeLine(EVENING, 3, ['the eye test', 'the car service'])).toBe(
    "That's Wednesday wrapped up. Tomorrow has three meetings, and the eye test and the car service lined up.",
  );
  expect(closeLine(EVENING, 3, ['a', 'b', 'c', 'd'])).toBe(
    "That's Wednesday wrapped up. Tomorrow has three meetings, and four things lined up.",
  );
  expect(closeLine(LATE, 0, [])).toBe(
    "That's Wednesday wrapped up. Thursday has nothing lined up yet.",
  );
  expect(closeLine(EVENING, 1, [])).toBe(
    "That's Wednesday wrapped up. Tomorrow has one meeting, and nothing else lined up yet.",
  );
  expect(closeLine(EVENING, 0, ['Book Eye Test'])).toBe(
    "That's Wednesday wrapped up. Tomorrow has Book Eye Test lined up.",
  );
});

test('the end note names when the day ends', () => {
  expect(endNote(3)).toBe('This thread moves to your history when the day ends at 3 AM');
  expect(endNote(0)).toBe('This thread moves to your history when the day ends at midnight');
});

test("Gremly's line outside the thread says how long the cards take", () => {
  expect(words.teaserLine(5, 'Wednesday', 'drop')).toEqual({
    lead: 'Ready to wrap up Wednesday?',
    rest: 'Two minutes. Tap here',
  });
  expect(words.teaserLine(0, 'Wednesday', 'drop').rest).toBe('Nothing to sort. Tap here');
  expect(words.teaserLine(5, 'Wednesday', 'today')).toEqual({
    lead: 'Ready to wrap up?',
    rest: 'Tap here',
  });
});

test('the pinned card says where the wrap up has got to', () => {
  const line = (step: string | null, more = {}) =>
    words.pinnedLine({ step, cards: 0, journal: false, fed: false, ...more });
  expect(line(null, { cards: 5 })).toBe('Wrap up today: 5 things to decide');
  expect(line(null, { cards: 1 })).toBe('Wrap up today: 1 thing to decide');
  expect(line(null)).toBe('Wrap up today: a look back at your day');
  expect(line('partial', { cards: 2 })).toBe('Halfway through the cards');
  expect(line('habits')).toBe('Wrapping up the day');
  expect(line('declined', { cards: 3 })).toBe('Not tonight. Here whenever you want it.');
  expect(line('declined', { cards: 3, journal: true })).toBe(
    'Journal saved. The cards are waiting.',
  );
  expect(line('done')).toBe('Wrapped up');
  expect(line('done', { fed: true })).toBe('Wrapped up, and Gremly is fed');
  // new things since it was finished
  expect(line('done', { cards: 2 })).toBe('Wrap up today: 2 things to decide');
});

test('nothing a person reads uses a dash as punctuation', () => {
  const lines: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === 'string') lines.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(words.WRAP_COPY);
  collect([
    openerLine(LATE, 'James', true),
    missedLine(['A']),
    offerLine(7, LATE),
    clearLine(null, true),
    partialLine(2, 3, LATE),
    habitsLine(2, 2),
    skippedLine(2, 2, 2, LATE),
    closeLine(LATE, 2, ['a']),
    endNote(5),
    words.newSinceLine(2),
    words.teaserLine(3, 'Wednesday', 'drop'),
    words.teaserLine(0, 'Wednesday', 'drop'),
    words.teaserLine(3, 'Wednesday', 'today'),
    words.pinnedLine({ step: null, cards: 1, journal: false, fed: false }),
    words.pinnedLine({ step: 'declined', cards: 2, journal: true, fed: false }),
    words.pinnedLine({ step: 'done', cards: 0, journal: true, fed: true }),
    words.CARD_COPY,
    words.TODAY_BUTTON,
    words.receiptParts({ kept: 1, letGo: 1, back: 1, left: 1, toSort: 0 }),
    words.journalLabel('2026-09-30'),
    words.resumeLine(4),
    words.sortedLine(2),
    words.questionsIntro(2),
    words.answeredWithItem('note'),
    words.nightLine('James'),
  ]);
  expect(lines.length).toBeGreaterThan(40);
  for (const line of lines) expect(line).not.toMatch(/[—–]| - /);
});
