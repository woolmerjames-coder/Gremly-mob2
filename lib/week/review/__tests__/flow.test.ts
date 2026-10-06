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
  WEEK_COPY,
  aheadIntro,
  aheadText,
  doneTiles,
  hoursLabel,
  intentionQuote,
  needsYouIntro,
  openerLine,
  prioritiesButton,
  setUpButton,
  shortDate,
  shortDay,
  skippedLine,
  spanLabel,
  stepWhen,
  whenLabel,
} from '../words';
import { MON, SUN, THU, WED, WEEK_START, madeUpRead } from './madeUpWeek';

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
    ...doneMsgs({ weekStart: WEEK_START, guessed: true, part: 'evening', summary: undefined }),
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
      'Sunday evening, the best time to look at the week together. Got ten minutes?',
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
      'Wednesday morning, the best time to look at the week together. Got ten minutes?',
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
    tiles: doneTiles({ priorities: 2, steps: 3, talked: 1 }),
  };

  it('is the summary card, kept on the card, and Gremly’s last line', () => {
    const msgs = doneMsgs({ weekStart: WEEK_START, guessed: false, part: 'evening', summary });
    expect(msgs.map((m) => m.meta.type)).toEqual(['week-card', 'brief-text']);
    expect(msgs[0].meta).toMatchObject({ card: 'done', summary });
    expect(msgs[1].content).toBe(WEEK_COPY.doneLine);
  });

  it('says so first when Gremly’s guesses were taken', () => {
    const msgs = doneMsgs({ weekStart: WEEK_START, guessed: true, part: 'evening', summary });
    expect(msgs[0].content).toBe(WEEK_COPY.guessed);
    expect(msgs).toHaveLength(3);
  });

  it('counts the week in three tiles, in the singular when it is one', () => {
    expect(doneTiles({ priorities: 1, steps: 1, talked: 1 })).toEqual([
      { num: '1', label: 'thing that matters most' },
      { num: '1', label: "step set up for what's coming" },
      { num: '1', label: 'thing talked through' },
    ]);
    expect(doneTiles({ priorities: 3, steps: 0, talked: 2 }).map((t) => t.label)).toEqual([
      'things that matter most',
      "steps set up for what's coming",
      'things talked through',
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
