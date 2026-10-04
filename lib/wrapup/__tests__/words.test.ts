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
  stillApply,
  stillLine,
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
  expect(missedLine(['Book the car service'], true)).toBe(
    "One thing you planned didn't happen: Book the car service. I'll bring it up after the cards.",
  );
  expect(missedLine(['A', 'B'], false)).toBe(
    "Two things you planned didn't happen. I'll bring them up in a moment.",
  );
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

test('still open today, for one, two and more', () => {
  expect(stillLine(2, EVENING)).toBe('Two todos from today are still open. Move them to tomorrow?');
  expect(stillLine(1, LATE)).toBe('One todo from today is still open. Move it to Thursday?');
  expect(stillApply(2, 2, EVENING)).toBe('Move both to tomorrow');
  expect(stillApply(1, 2, EVENING)).toBe('Move 1 to tomorrow');
  expect(stillApply(1, 1, LATE)).toBe('Move it to Thursday');
  expect(stillApply(4, 4, EVENING)).toBe('Move all four to tomorrow');
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

test('nothing a person reads uses a dash as punctuation', () => {
  const lines: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === 'string') lines.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(words.WRAP_COPY);
  collect([
    openerLine(LATE, 'James', true),
    missedLine(['A'], true),
    offerLine(7, LATE),
    clearLine(null, true),
    partialLine(2, 3, LATE),
    stillLine(3, LATE),
    habitsLine(2, 2),
    skippedLine(2, 2, 2, LATE),
    closeLine(LATE, 2, ['a']),
    endNote(5),
    words.newSinceLine(2),
    words.teaserLine(3),
    words.pinnedLine(1),
    words.resumeLine(4),
    words.sortedLine(2),
    words.questionsIntro(2),
    words.answeredWithItem('note'),
    words.nightLine('James'),
  ]);
  expect(lines.length).toBeGreaterThan(40);
  for (const line of lines) expect(line).not.toMatch(/[—–]| - /);
});
