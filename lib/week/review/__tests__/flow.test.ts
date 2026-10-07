/**
 * What the weekly review adds to today's thread (lib/week/review/flow.ts) and
 * its fixed words (words.ts): the opening by the day it is opened on, each
 * step's line and card, and the end.
 */
import { briefMetaOf } from '../../../brief/messages';
import {
  card,
  dayAnswerMsgs,
  dayQuestionMsgs,
  doneMsgs,
  failedMsgs,
  loadingMsgs,
  notQuiteMsgs,
  openingMsgs,
  planAgainMsgs,
  planNextMsgs,
  recapMsgs,
  resumeMsgs,
  skippedMsgs,
  stepIntro,
  stepMsgs,
  talkMsgs,
  typed,
  type WeekMsg,
} from '../flow';
import {
  TALK_REASONS,
  fitDayButton,
  fitPartsLine,
  fitSplitButton,
  fittedText,
  WEEK_COPY,
  addToDay,
  ageLabel,
  aheadIntro,
  aheadText,
  backLabel,
  backWhen,
  boardIntro,
  dayLetter,
  dayTally,
  doneTiles,
  habitPlanned,
  hoursLabel,
  hoursRound,
  intentionQuote,
  keepQuestion,
  keptText,
  laterLine,
  loadLabel,
  leftLabel,
  minsLabel,
  moveTarget,
  needsYouIntro,
  openerLine,
  overfullLine,
  partTitle,
  prioritiesButton,
  relievedText,
  roomLine,
  setUpButton,
  shortDate,
  shortDay,
  skippedLine,
  spanLabel,
  stepWhen,
  unfittedLine,
  stillLine,
  todoStateLabel,
  weekDayLabel,
  whenLabel,
} from '../words';
import { MON, SAT, SUN, THU, TUE, WED, WEEK_START, madeUpRead } from './madeUpWeek';

const opener = (over = {}) => ({
  kind: 'weekly' as const,
  since: 0,
  weekday: 0,
  part: 'evening' as const,
  weekStart: WEEK_START,
  at: 'Sunday, 7:40 PM',
  ...over,
});

/** Every word a set of messages puts in the thread. */
const wordsOf = (msgs: WeekMsg[]) =>
  msgs
    .flatMap((m) => [
      m.content,
      ...(m.meta.type === 'brief-offer' ? m.meta.buttons.map((b) => b.label) : []),
    ])
    .join(' ');

describe('every message of the review', () => {
  const all = [
    ...openingMsgs(opener()),
    ...skippedMsgs('weekly', 0, 'evening'),
    ...loadingMsgs('evening'),
    ...failedMsgs(),
    ...stepMsgs('challenge', {
      weekStart: WEEK_START,
      read: madeUpRead(),
      today: SUN,
      part: 'evening',
    }),
    ...notQuiteMsgs('evening'),
    ...talkMsgs('Sort the boiler', 'What is making this one hard?'),
    ...doneMsgs({
      weekStart: WEEK_START,
      part: 'evening',
      summary: undefined,
      next: { habits: true, checkIns: [{ goal: 'Run a 10k', date: '2026-10-09' }] },
    }),
    ...dayQuestionMsgs(3, 0),
    ...recapMsgs(WEEK_START, undefined, 'evening'),
    ...planAgainMsgs(),
    ...planNextMsgs({ weekday: 6, part: 'evening' }),
    ...dayAnswerMsgs({ moved: true, counted: 'taken', today: 3, weeklyDay: 0 }, 'evening'),
    ...dayAnswerMsgs({ moved: true, counted: 'no', today: 3, weeklyDay: 0 }, 'evening'),
    ...dayAnswerMsgs(
      { moved: true, counted: 'yes', intentionLeft: true, today: 3, weeklyDay: 0 },
      'evening',
    ),
    typed('My sister is staying on Thursday'),
  ];

  it('is marked as the review’s, so the brief and the wrap up leave it alone', () => {
    for (const m of all) {
      expect(m.meta.week).toBe(true);
      expect(m.meta.wrap).toBeUndefined();
      // and is a message the thread knows how to draw
      expect(briefMetaOf({ metadata_json: m.meta as any })).not.toBeNull();
    }
  });

  it('uses no dash as punctuation in any fixed word', () => {
    const fixed = [
      ...Object.values(WEEK_COPY),
      ...TALK_REASONS,
      wordsOf(all),
      openerLine({ kind: 'extra', since: 3, weekday: 3, part: 'morning' }),
      openerLine({ kind: 'brought_forward', since: 6, weekday: 6, part: 'afternoon' }),
      openerLine({ kind: 'weekly', since: 1, weekday: 1, part: 'morning' }),
      aheadIntro(1),
      aheadIntro(3),
      needsYouIntro(1),
      needsYouIntro(4),
      ...dayAnswerMsgs({ moved: true, today: 3, weeklyDay: 0 }, 'evening').map((m) => m.content),
      ...dayAnswerMsgs({ moved: false, today: 3, weeklyDay: 0 }, 'evening').map((m) => m.content),
      ...dayAnswerMsgs({ moved: false, failed: true, today: 3, weeklyDay: 0 }, 'evening').map(
        (m) => m.content,
      ),
    ].join(' | ');
    expect(fixed).not.toMatch(/\s[-–—]\s|—|–/);
  });
});

describe('the opening', () => {
  it('is the review’s mark with the time, then Gremly’s offer and its two buttons', () => {
    const [mark, offer] = openingMsgs(opener());
    expect(mark.meta).toEqual({
      type: 'week-card',
      card: 'opening',
      week_start: WEEK_START,
      at: 'Sunday, 7:40 PM',
      week: true,
    });
    expect(offer.role).toBe('assistant');
    expect(offer.content).toBe(
      'Sunday evening, the best time to look at the week together. Got a few minutes?',
    );
    expect(offer.meta).toMatchObject({ type: 'brief-offer', kind: 'week_open' });
    expect((offer.meta as any).buttons).toEqual([
      { id: 'week_start', label: "Let's do it", action: 'week_start', primary: true },
      { id: 'week_skip', label: 'Not this week', action: 'week_skip' },
    ]);
  });

  it('says what it is by the day it is opened on', () => {
    // their own weekly day, whichever it is, at whatever time
    expect(openerLine({ kind: 'weekly', since: 0, weekday: 3, part: 'morning' })).toBe(
      'Wednesday morning, the best time to look at the week together. Got a few minutes?',
    );
    // a day or two after it
    expect(openerLine({ kind: 'weekly', since: 2, weekday: 2, part: 'evening' })).toContain(
      'The week has started',
    );
    // the one extra, midweek, on a fresh look
    expect(openerLine({ kind: 'extra', since: 3, weekday: 3, part: 'evening' })).toContain(
      'the rest of this week',
    );
    expect(openerLine({ kind: 'extra', since: 3, weekday: 3, part: 'evening' })).toContain(
      'a fresh look',
    );
    // the day before: next week, early
    expect(
      openerLine({ kind: 'brought_forward', since: 6, weekday: 6, part: 'evening' }),
    ).toContain('next week a day early');
  });

  it('answers Not this week with when it will ask again, for the weekly review only', () => {
    expect(skippedLine('weekly', 0)).toBe(
      "No problem. Your week stays as it is, and I'll ask again next Sunday.",
    );
    expect(skippedLine('weekly', 3)).toContain('next Wednesday');
    expect(skippedLine('extra', 0)).toBe('No problem. Your week stays as it is.');
    expect(skippedMsgs('brought_forward', 0, 'evening')[0].content).toBe(
      'No problem. Your week stays as it is.',
    );
  });

  it('offers next week early with its own buttons, the day before their weekly day', () => {
    const [offer] = planNextMsgs({ weekday: 6, part: 'evening' });
    expect(offer.content).toContain('next week a day early');
    expect((offer.meta as any).buttons.map((b: any) => [b.label, b.action])).toEqual([
      ['Plan next week', 'week_start'],
      ['Not now', 'week_skip'],
    ]);
  });

  it('offers the rest of the week again, out of their weekly window with the extra free', () => {
    const [offer] = planAgainMsgs();
    expect(offer.content).toBe(
      "Want to plan the rest of this week again? I'll take a fresh look at everything first. There's one of these a week.",
    );
    expect(offer.meta).toMatchObject({ type: 'brief-offer', kind: 'week_open', week: true });
    expect((offer.meta as any).buttons.map((b: any) => [b.label, b.action])).toEqual([
      ['Plan the rest of it', 'week_start'],
      ['Not now', 'week_skip'],
    ]);
  });

  it('lets them try again when the read could not be made', () => {
    const [offer] = failedMsgs();
    expect((offer.meta as any).kind).toBe('week_retry');
    expect((offer.meta as any).buttons.map((b: any) => b.action)).toEqual([
      'week_retry',
      'week_stop',
    ]);
  });
});

describe('each step', () => {
  const o = { weekStart: WEEK_START, read: madeUpRead(), today: SUN, part: 'evening' as const };

  it('is Gremly’s line, then its card for the week', () => {
    for (const step of [
      'challenge',
      'priorities',
      'shape',
      'intention',
      'ahead',
      'needs_you',
    ] as const) {
      const [line, c] = stepMsgs(step, o);
      expect(line.role).toBe('assistant');
      expect(line.content).toBe(stepIntro(step, o.read, SUN));
      expect(c).toEqual(card(step, WEEK_START));
      expect(c.meta).toEqual({ type: 'week-card', card: step, week_start: WEEK_START, week: true });
    }
  });

  it('counts what it shows in its line', () => {
    expect(stepIntro('ahead', o.read, SUN)).toContain('one thing is big enough');
    expect(aheadIntro(2)).toContain('two things are big enough');
    expect(stepIntro('needs_you', o.read, SUN)).toBe(
      'These two need you most. Tap one to talk it through, or leave them be.',
    );
    expect(needsYouIntro(1)).toBe(
      'This one needs you most. Tap it to talk it through, or leave it be.',
    );
    expect(needsYouIntro(4)).toContain('These four need you most');
  });

  it('opens one of the needs you cards with Gremly’s own question and reasons to tap', () => {
    const [mine, ask] = talkMsgs('Sort the boiler', 'What is making this one hard to get done?');
    expect(mine.role).toBe('user');
    expect(mine.content).toBe("Let's talk about this one: Sort the boiler");
    expect(ask.content).toBe('What is making this one hard to get done?');
    expect((ask.meta as any).kind).toBe('week_reasons');
    // each reason goes to Gremly as their words
    expect((ask.meta as any).buttons.map((b: any) => [b.action, b.value])).toEqual(
      TALK_REASONS.map((r) => ['week_reason', r]),
    );
  });

  it('gives a needs you card its own answers to tap, which fit its question', () => {
    const own = ['I need a quote first', 'I do not know who to call', 'It can wait'];
    const [, ask] = talkMsgs('Sort the boiler', 'What is in the way of booking it?', own);
    expect((ask.meta as any).buttons).toEqual(
      own.map((label, i) => ({
        id: `week_reason_${i}`,
        label,
        action: 'week_reason',
        value: label,
      })),
    );
    // one answer is no choice: the general reasons stand in
    const [, thin] = talkMsgs('Sort the boiler', 'What is in the way?', ['It can wait']);
    expect((thin.meta as any).buttons.map((b: any) => b.label)).toEqual(TALK_REASONS);
  });

  it('marks what they typed as the review’s own message', () => {
    expect(typed('I am away on Friday')).toEqual({
      role: 'user',
      content: 'I am away on Friday',
      meta: { type: 'brief-reply', button_id: 'typed', action: 'week_typed', week: true },
    });
  });

  it('puts every card so far back when a review is picked up in a thread that does not hold it', () => {
    const msgs = resumeMsgs(['challenge', 'priorities', 'shape'], WEEK_START, 'morning');
    expect(msgs[0].content).toBe("Let's pick your week up where we left it.");
    expect(msgs.slice(1).map((m) => (m.meta as any).card)).toEqual([
      'challenge',
      'priorities',
      'shape',
    ]);
  });
});

describe('the end', () => {
  const summary = {
    intention: 'Fewer things, finished.',
    tiles: doneTiles({ todos: 12, habits: 5, steps: 3 }),
  };

  it('is the summary card, kept on the card, and Gremly’s last line', () => {
    const next = { habits: false, checkIns: [] };
    const msgs = doneMsgs({ weekStart: WEEK_START, part: 'evening', summary, next });
    expect(msgs.map((m) => m.meta.type)).toEqual(['week-card', 'brief-text']);
    expect(msgs[0].meta).toMatchObject({ card: 'done', summary });
    expect(msgs[1].content).toBe(
      "That's your week. Each morning I'll bring that day's plan. It's here whenever you want to look at it again.",
    );
  });

  it('says what the mornings and the wrap ups bring when habits and check ins were planned', () => {
    const next = {
      habits: true,
      checkIns: [
        { goal: 'Run a 10k', date: '2026-10-16' },
        { goal: 'Finish the shed', date: '2026-10-14' },
        { goal: 'Learn the piece', date: '2026-10-18' },
      ],
    };
    const [, line] = doneMsgs({ weekStart: WEEK_START, part: 'evening', summary, next });
    // the two soonest, in the order they come
    expect(line.content).toBe(
      "That's your week. Each morning I'll bring that day's plan and check in on the habits you planned for it. " +
        "I'll also ask how “Finish the shed” is going on Wed 14 Oct, and how “Run a 10k” is going on Fri 16 Oct at the wrap up. " +
        "It's here whenever you want to look at it again.",
    );
  });

  it('counts the week in three tiles, in the singular when it is one', () => {
    expect(doneTiles({ todos: 1, habits: 1, steps: 1 })).toEqual([
      { num: '1', label: 'todo spread across the week' },
      { num: '1', label: 'habit session with a day' },
      { num: '1', label: "step set up for what's coming" },
    ]);
    expect(doneTiles({ todos: 12, habits: 0, steps: 2 }).map((t) => t.label)).toEqual([
      'todos spread across the week',
      'habit sessions with a day',
      "steps set up for what's coming",
    ]);
  });

  it('asks about their weekly day by name, and answers either way', () => {
    const [ask] = dayQuestionMsgs(3, 0);
    expect(ask.content).toBe(
      'One more thing. You planned this on a Wednesday. Want Wednesday to be your weekly day from now on?',
    );
    expect((ask.meta as any).buttons.map((b: any) => [b.label, b.action])).toEqual([
      ['Keep Sunday', 'week_keep_day'],
      ['Make it Wednesday', 'week_move_day'],
    ]);
    expect(dayAnswerMsgs({ moved: false, today: 3, weeklyDay: 0 }, 'evening')[0].content).toBe(
      'Sunday it stays.',
    );
    expect(dayAnswerMsgs({ moved: true, today: 3, weeklyDay: 0 }, 'evening')[0].content).toBe(
      "Done. Your weekly review is on Wednesdays from now on, and this one counts as this week's.",
    );
    expect(
      dayAnswerMsgs({ moved: false, failed: true, today: 3, weeklyDay: 0 }, 'evening')[0].content,
    ).toContain("couldn't move your weekly day");
  });

  it('says only what happened when their weekly day moved and the review did not go with it', () => {
    const line = (o: Parameters<typeof dayAnswerMsgs>[0]) =>
      dayAnswerMsgs(o, 'evening').map((m) => m.content);
    const base = { moved: true, today: 3, weeklyDay: 0 };
    // the new week had a review already
    const taken = line({ ...base, counted: 'taken' });
    expect(taken).toHaveLength(1);
    expect(taken[0]).toContain('is on Wednesdays from now on');
    expect(taken[0]).toContain('already has a review of its own');
    expect(taken[0]).not.toContain('counts as');
    // the review could not be moved
    const not = line({ ...base, counted: 'no' });
    expect(not[0]).toContain('is on Wednesdays from now on');
    expect(not[0]).toContain("couldn't count this one");
    // the review moved, and its intention did not
    const left = line({ ...base, counted: 'yes', intentionLeft: true });
    expect(left).toHaveLength(2);
    expect(left[0]).toContain("counts as this week's");
    expect(left[1]).toContain("couldn't bring your intention across");
  });

  it('shows the week again from the Week button without the cheer', () => {
    const msgs = recapMsgs(WEEK_START, summary, 'morning');
    expect(msgs[0].content).toBe("Here's the week you planned.");
    expect(msgs[1].meta).toMatchObject({ type: 'week-card', card: 'done', recap: true, summary });
  });
});

describe('days and hours in words', () => {
  it('writes days as a person would', () => {
    expect(shortDay(MON)).toBe('Mon');
    expect(shortDate('2026-10-23')).toBe('23 Oct');
    expect(stepWhen(MON)).toBe('Mon 5');
    expect(spanLabel(MON, '2026-10-11')).toBe('Mon 5 to Sun 11 Oct');
    // inside the days being planned a day's name is enough; outside them, the date
    expect(whenLabel(THU, MON, '2026-10-11')).toBe('Thu');
    expect(whenLabel('2026-10-23', MON, '2026-10-11')).toBe('23 Oct');
    expect(whenLabel(WED, THU, '2026-10-11')).toBe('7 Oct');
  });

  it('writes hours in half hour steps', () => {
    expect(hoursLabel(2.5)).toBe('2h 30m');
    expect(hoursLabel(2)).toBe('2h');
    expect(hoursLabel(0.5)).toBe('30m');
    expect(hoursLabel(0)).toBe('0h');
    expect(hoursLabel(null)).toBe('0h');
  });

  it('words the buttons by what was picked', () => {
    expect(prioritiesButton(0, false)).toBe('Skip this');
    expect(prioritiesButton(1, false)).toBe('This one');
    expect(prioritiesButton(2, false)).toBe('These two');
    expect(prioritiesButton(3, false)).toBe('These three');
    expect(prioritiesButton(2, true)).toBe('Save');
    expect(setUpButton(1)).toBe('Set up this step');
    expect(setUpButton(3)).toBe('Set up these three steps');
    expect(aheadText([])).toBe('Not now');
    expect(aheadText(['London'])).toBe('Set up the steps for London');
    expect(aheadText(['London', 'the reports', 'the move'])).toBe(
      'Set up the steps for London, the reports and the move',
    );
    // an intention is kept exactly as they wrote it
    expect(intentionQuote(' Fewer things, finished. ')).toBe('“Fewer things, finished.”');
  });
});

describe('the board in words', () => {
  it('writes minutes and hours as the board shows them', () => {
    expect(minsLabel(90)).toBe('1h 30m');
    expect(minsLabel(120)).toBe('2h');
    expect(minsLabel(45)).toBe('45m');
    expect(minsLabel(0)).toBe('0m');
    expect(hoursRound(545)).toBe('9h');
    expect(hoursRound(0)).toBe('0h');
    expect(roomLine(17 * 60)).toBe('Your room this week: about 17h');
    expect(leftLabel(75)).toBe('1h 15m free');
    expect(leftLabel(0)).toBe('0m free');
    expect(leftLabel(-20)).toBe('20m over');
    expect(addToDay(MON)).toBe('+ Add to Mon');
    expect(dayLetter(THU)).toBe('T');
    expect(habitPlanned(1, 2)).toBe('1 of 2 planned');
  });

  it('has Gremly say the week as he spread it, from the board’s own figures', () => {
    const base = { all: 60, room: 600, habits: 0, gremly: 0, own: 0, later: 0 };
    const line = boardIntro({
      all: 20 * 60,
      room: 17 * 60,
      habits: 3 * 60,
      gremly: 12,
      own: 0,
      later: 30,
    });
    expect(line).toBe(
      "Now the week itself. Everything on your list would take about 20h, and you have about 14h once your habits are in. So I've spread 12 todos across the days, priorities first, and the rest wait in Later. Move anything you like.",
    );
    expect(boardIntro({ ...base, gremly: 1 })).toContain(
      "So I've spread one todo across the days, priorities first, and nothing is left for Later.",
    );
    expect(boardIntro({ ...base, later: 2 })).toContain(
      'So nothing is on the days yet, and it all waits in Later.',
    );
    // habits that take more than the days give leave no room, never less than none
    expect(boardIntro({ ...base, room: 60, habits: 120, gremly: 1 })).toContain(
      'you have about 0h once your habits are in',
    );
    expect(boardIntro({ ...base, all: 0 })).toBe(
      'Now the week itself. Nothing is waiting on your list, so the days are clear. Add anything you like.',
    );
  });

  it('counts only what Gremly placed as his, and names what they had placed themselves', () => {
    const base = { all: 60, room: 600, habits: 0, gremly: 0, own: 0, later: 0 };
    expect(boardIntro({ ...base, gremly: 5, own: 7, later: 3 })).toContain(
      "So I've spread 5 todos across the days, around the 7 you'd already placed, priorities first, and the rest wait in Later.",
    );
    expect(boardIntro({ ...base, gremly: 1, own: 1 })).toContain(
      "So I've spread one todo across the days, around the one you'd already placed, priorities first, and nothing is left for Later.",
    );
    // nothing of his on the days: he does not say he spread anything
    expect(boardIntro({ ...base, own: 4, later: 2 })).toContain(
      "So I've left the 4 todos you'd already placed where they are, and the rest wait in Later.",
    );
    expect(boardIntro({ ...base, own: 1 })).toContain(
      "So I've left the one todo you'd already placed where it is, and nothing is left for Later.",
    );
  });

  it('says how long a todo has waited, and nothing for one added this month', () => {
    const t = (created: string | null, moved = 0, step = false) => ({ created, moved, step });
    expect(ageLabel(t('2026-08-02', 3), SUN)).toEqual({
      text: 'Since Aug, moved 3×',
      old: false,
      show: true,
    });
    expect(ageLabel(t('2026-08-02'), SUN)).toEqual({ text: 'Since Aug', old: false, show: true });
    // moved fifteen times, it counts as old
    expect(ageLabel(t('2026-08-02', 15), SUN).old).toBe(true);
    // another year says so, or the month could be read as this year's
    expect(ageLabel(t('2025-10-20', 1), SUN).text).toBe('Since Oct 2025, moved 1×');
    expect(ageLabel(t('2026-10-01', 4), SUN)).toEqual({ text: '', old: false, show: false });
    expect(ageLabel(t(null), SUN).show).toBe(false);
    // a step set up in the review says so, whenever it was made
    expect(ageLabel(t('2026-10-04', 0, true), SUN)).toEqual({
      text: 'New step',
      old: false,
      show: true,
    });
  });

  it('says the day a Later comes back: the day this month, the date in another', () => {
    expect(backLabel('2026-10-12', SUN)).toBe('Back Mon 12');
    expect(backLabel('2026-11-02', '2026-10-28')).toBe('Back 2 Nov');
  });
});

describe('your week in words', () => {
  const day = (over: Record<string, unknown> = {}) => ({
    when: 'past' as 'past' | 'today' | 'ahead',
    planned: 4 as number | null,
    done: 3,
    alsoDone: 0,
    todos: [] as { state: string }[],
    habits: [] as { planned: boolean; done: boolean }[],
    ...over,
  });

  it('says how a day went, or what it holds', () => {
    expect(dayTally(day())).toBe('3 of 4 done');
    expect(dayTally(day({ alsoDone: 2 }))).toBe('3 of 4 done, and 2 more');
    // nothing was planned for the day, or no plan was kept for it
    expect(dayTally(day({ planned: 0, done: 0, alsoDone: 2 }))).toBe('2 done');
    expect(dayTally(day({ planned: null, done: 0 }))).toBe('Nothing planned');
    expect(
      dayTally(
        day({
          when: 'today',
          planned: null,
          done: 0,
          todos: [{ state: 'open' }, { state: 'done' }],
          habits: [{ planned: true, done: false }],
        }),
      ),
    ).toBe('2 to do');
    // a day still to come
    expect(dayTally(day({ when: 'ahead', done: 0 }))).toBe('4 planned');
    expect(dayTally(day({ when: 'ahead', done: 1 }))).toBe('4 planned, 1 done');
    expect(
      dayTally(day({ when: 'ahead', planned: null, done: 0, todos: [{ state: 'open' }] })),
    ).toBe('1 planned');
    expect(dayTally(day({ when: 'ahead', planned: 0, done: 0 }))).toBe('Nothing planned');
  });

  it('names a day, with Today on the day itself', () => {
    expect(weekDayLabel(WED, WED)).toBe('Today, Wed 7');
    expect(weekDayLabel(THU, WED)).toBe('Thu 8');
  });

  it('says what became of a todo, and nothing where its tick or its day says it', () => {
    const says = (state: string, to: string | null, when: 'past' | 'today' | 'ahead' = 'past') =>
      todoStateLabel({ state, to }, when, MON, '2026-10-11', WED);
    expect(says('done', null)).toBeNull();
    expect(says('open', null)).toBe('Not done');
    expect(says('open', null, 'today')).toBeNull();
    expect(says('open', null, 'ahead')).toBeNull();
    // a day in the week by its name, a day outside it by its date
    expect(says('moved', THU)).toBe('Moved to Thu');
    expect(says('moved', '2026-10-14')).toBe('Moved to 14 Oct');
    expect(says('later', '2026-10-13')).toBe('In Later, back Tue 13');
    expect(says('later', '2026-11-02')).toBe('In Later, back 2 Nov');
    expect(says('later', null)).toBe('No day now');
    // put off until a day that has come: it is back with them
    expect(says('later', WED)).toBe('Back from Later');
    expect(says('later', MON)).toBe('Back from Later');
    expect(says('back', null, 'today')).toBe('Back from Later');
    expect(says('back', null, 'ahead')).toBe('Comes back from Later');
    expect(says('let_go', null)).toBe('Let go');
  });

  it('says what is waiting in Later in one line', () => {
    expect(laterLine(0, null, WED)).toBe('Nothing is waiting in Later.');
    expect(laterLine(1, '2026-10-13', WED)).toBe(
      'One thing is waiting in Later. It comes back Tue 13.',
    );
    expect(laterLine(12, '2026-11-02', WED)).toBe(
      '12 things are waiting in Later. The next comes back 2 Nov.',
    );
    expect(backWhen('2026-10-12', WED)).toBe('Mon 12');
  });
});

describe('their own days in words', () => {
  it('asks what to do with them, naming the days they overfill', () => {
    expect(keepQuestion(9, [])).toBe(
      "You've already put 9 todos on the days we're planning. Shall I plan around them, or would you rather I rearranged them?",
    );
    expect(keepQuestion(6, [WED])).toContain('Wednesday holds more than it has room for.');
    expect(keepQuestion(6, [MON, WED])).toContain(
      'Monday and Wednesday hold more than they have room for.',
    );
    expect(keepQuestion(8, [MON, WED, THU])).toContain(
      'Monday, Wednesday and Thursday hold more than they have room for.',
    );
    expect(keptText('all')).toBe('Keep my days');
    expect(keptText('some')).toBe('Keep some');
    expect(keptText('none')).toBe('Rearrange it all');
    expect(loadLabel(185, 120)).toBe('3h 5m of 2h');
  });

  it('says how far over a day is, what would move where, and what they chose', () => {
    expect(overfullLine(WED, 80, 2)).toBe(
      "Wednesday holds 1h 20m more than it has room for. Here's what I'd move, if you agree.",
    );
    expect(overfullLine(WED, 80, 1)).toContain("Here's the one thing I'd move, if you agree.");
    expect(overfullLine(WED, 80, 0)).toBe('Wednesday holds 1h 20m more than it has room for.');
    expect(moveTarget(THU, null, SUN)).toBe('Thu');
    expect(moveTarget(null, '2026-10-13', SUN)).toBe('Later, back Tue 13');
    expect(moveTarget(null, null, SUN)).toBe('Later');
    expect(stillLine(30)).toBe('That would still leave it 30m over.');
    expect(relievedText(WED, 'moved')).toBe('Move these off Wednesday');
    expect(relievedText(WED, 'changed')).toBe('I changed Wednesday myself');
    expect(relievedText(WED, 'left')).toBe('Leave Wednesday as it is');
  });

  it('says a todo that matters most is on no day, and what can be done about it', () => {
    expect(unfittedLine('Write the talk', 300, false)).toBe(
      '“Write the talk” is one of the things that matter most this week, and at 5h it fits on no day as the week stands.',
    );
    expect(unfittedLine('Write the talk', 180, true)).toBe(
      '“Write the talk” is one of the things that matter most this week, and it is on no day yet.',
    );
    expect(fitDayButton(SAT)).toBe('Put it on Saturday');
    expect(fitSplitButton(2)).toBe('Split it in two');
    expect(fitSplitButton(3)).toBe('Split it in three');
    expect(
      fitPartsLine([
        { minutes: 150, day: SAT },
        { minutes: 150, day: SUN },
      ]),
    ).toBe('2h 30m on Saturday and 2h 30m on Sunday');
    expect(
      fitPartsLine([
        { minutes: 35, day: MON },
        { minutes: 35, day: TUE },
        { minutes: 30, day: WED },
      ]),
    ).toBe('35m on Monday, 35m on Tuesday and 30m on Wednesday');
    // their answers, above the board's card
    expect(fittedText({ how: 'day', title: 'Write the talk', day: SAT })).toBe(
      'Put “Write the talk” on Saturday',
    );
    expect(fittedText({ how: 'split', title: 'Write the talk', parts: 2 })).toBe(
      'Split “Write the talk” in two',
    );
    expect(fittedText({ how: 'left', title: 'Write the talk' })).toBe(
      'Leave “Write the talk” for later',
    );
  });

  it('names the parts of a split, and leaves room for which part in a name at its longest', () => {
    expect(partTitle('Write the talk', 1, 2)).toBe('Write the talk (part 1 of 2)');
    const long = partTitle('x'.repeat(200), 2, 3);
    expect(long).toHaveLength(200);
    expect(long.endsWith(' (part 2 of 3)')).toBe(true);
  });
});
