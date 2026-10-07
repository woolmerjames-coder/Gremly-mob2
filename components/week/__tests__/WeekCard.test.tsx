/**
 * The weekly review's cards (components/week), drawn from a made up person's
 * week as the session holds it: what each shows, which taps reach the review,
 * and what a card shows once the review has moved on from it.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { WeekCardMeta } from '../../../lib/brief/types';
import { reliefBasis, reviewOn, reviewWith, spreadBasis } from '../../../lib/week/model';
import {
  holdUndo,
  patchSession,
  resetWeekSession,
  setReview,
  useWeekSession,
} from '../../../lib/week/review/session';
import { useThisWeek } from '../../../lib/week/thisWeek';
import type { WeekReview } from '../../../lib/week/useWeekReview';
import {
  ID,
  MON,
  NEXT_SUN,
  SUN,
  THU,
  TUE,
  WED,
  WEEK_START,
  madeUpRow,
} from '../../../lib/week/review/__tests__/madeUpWeek';
import { WeekBoardSheet } from '../BoardStep';
import { WeekCard } from '../WeekCard';
import { WeekFooter, WeekOfferButton } from '../WeekFooter';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return {
    Star: icon('star'),
    X: icon('x'),
    Minus: icon('minus'),
    Plus: icon('plus'),
    Check: icon('check'),
    CalendarRange: icon('calendar-range'),
    ChevronRight: icon('chevron-right'),
    AlignJustify: icon('align-justify'),
    ChevronLeft: icon('chevron-left'),
    ArrowRight: icon('arrow-right'),
    Clock: icon('clock'),
    Pin: icon('pin'),
    PinOff: icon('pin-off'),
  };
});
jest.mock('../../../lib/repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
}));
// the store as the cards read it: a hook for what is drawn, getState for the rest
const mockStore: any = {};
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: Object.assign((pick: (s: any) => unknown) => pick(mockStore), {
    getState: () => mockStore,
  }),
}));

/** A review whose every action is a spy; live says whether the card is the one to act on. */
function fakeReview(live = true): WeekReview {
  return {
    open: jest.fn(),
    handleButton: jest.fn(),
    takeTyped: jest.fn(),
    carryOn: jest.fn(),
    onApplied: jest.fn(),
    context: jest.fn(),
    underWay: true,
    canCarryOn: false,
    loading: false,
    placeholder: null,
    busy: false,
    isLive: () => live,
    challenge: { agree: jest.fn(), disagree: jest.fn() },
    priorities: { toggle: jest.fn(), done: jest.fn() },
    shape: {
      toggleBusy: jest.fn(),
      stepHours: jest.fn(),
      removeDate: jest.fn(),
      addDate: jest.fn(),
      done: jest.fn(),
    },
    intention: { suggest: jest.fn(), write: jest.fn(), done: jest.fn(), skip: jest.fn() },
    ahead: { toggleStep: jest.fn(), setUp: jest.fn(), undo: jest.fn(), done: jest.fn() },
    needsYou: { talk: jest.fn(), done: jest.fn() },
    board: {
      open: jest.fn(),
      close: jest.fn(),
      move: jest.fn(),
      toggleHabit: jest.fn(),
      retry: jest.fn(),
      keep: jest.fn(),
      togglePin: jest.fn(),
      keepDone: jest.fn(),
      askKeep: jest.fn(),
      relieve: jest.fn(),
      fit: jest.fn(),
      unfit: jest.fn(),
      done: jest.fn(),
      undo: jest.fn(),
    },
    edit: jest.fn(),
    justPlan: jest.fn(),
  } as unknown as WeekReview;
}

const meta = (card: WeekCardMeta['card'], over: Partial<WeekCardMeta> = {}): WeekCardMeta => ({
  type: 'week-card',
  card,
  week_start: WEEK_START,
  week: true,
  ...over,
});

/** The review under way on a step, as the session holds it on Maya's weekly day. */
function underWay(step: string, answers: Record<string, unknown> = {}, today = SUN) {
  const row = madeUpRow({ status: 'started', answers: { step, ...answers } as any });
  setReview(row, reviewWith(today, 0, row), null);
  return row;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 19, 40, 0));
  resetWeekSession();
  useWeekSession.setState({ threadId: 't1' });
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  Object.assign(mockStore, {
    userId: 'maya',
    todos: [],
    habits: [],
    habitPlans: [],
    worlds: [],
    dropWorldLinks: [],
  });
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: null, loaded: true });
});

afterEach(() => {
  jest.useRealTimers();
});

const SUMMARY = {
  intention: 'Fewer things, finished.',
  tiles: [
    { num: '2', label: 'things that matter most' },
    { num: '3', label: "steps set up for what's coming" },
    { num: '1', label: 'thing talked through' },
  ],
};

describe('the opening and the end', () => {
  it('shows the review’s mark with when it was opened', () => {
    const { getByText } = render(
      <WeekCard
        messageId="m1"
        meta={meta('opening', { at: 'Sunday, 7:40 PM' })}
        review={fakeReview()}
      />,
    );
    expect(getByText('YOUR WEEKLY REVIEW')).toBeTruthy();
    expect(getByText('Sunday, 7:40 PM')).toBeTruthy();
  });

  it('shows the week in short from what the card keeps, with no row in hand', () => {
    const { getByText } = render(
      <WeekCard
        messageId="m9"
        meta={meta('done', { summary: SUMMARY })}
        review={fakeReview(false)}
      />,
    );
    expect(getByText('YOUR WEEK')).toBeTruthy();
    expect(getByText('“Fewer things, finished.”')).toBeTruthy();
    expect(getByText('things that matter most')).toBeTruthy();
    expect(getByText('thing talked through')).toBeTruthy();
  });
  it('offers Undo under the week just planned, while what the board wrote can be taken back', () => {
    const row = madeUpRow({ status: 'done', answers: { step: 'done' } as any });
    setReview(row, reviewOn(SUN, 0), null);
    holdUndo('board', async () => undefined);
    const review = fakeReview();
    const { getByTestId } = render(
      <WeekCard messageId="m9" meta={meta('done', { summary: SUMMARY })} review={review} />,
    );
    fireEvent.press(getByTestId('week-done-undo'));
    expect(review.board.undo).toHaveBeenCalledTimes(1);
  });

  it('offers no Undo with nothing to take back, on a week shown again, or on a copy the review moved on from', () => {
    const row = madeUpRow({ status: 'done', answers: { step: 'done' } as any });
    setReview(row, reviewOn(SUN, 0), null);
    const none = render(
      <WeekCard messageId="m9" meta={meta('done', { summary: SUMMARY })} review={fakeReview()} />,
    );
    expect(none.queryByTestId('week-done-undo')).toBeNull();
    none.unmount();
    holdUndo('board', async () => undefined);
    const again = render(
      <WeekCard
        messageId="m9"
        meta={meta('done', { summary: SUMMARY, recap: true })}
        review={fakeReview()}
      />,
    );
    expect(again.queryByTestId('week-done-undo')).toBeNull();
    again.unmount();
    const old = render(
      <WeekCard
        messageId="m9"
        meta={meta('done', { summary: SUMMARY })}
        review={fakeReview(false)}
      />,
    );
    expect(old.queryByTestId('week-done-undo')).toBeNull();
  });
});

const PLANNED_DAYS = [MON, TUE, WED, THU, '2026-10-09', '2026-10-10', NEXT_SUN];

describe('the week’s board', () => {
  const SPREAD = {
    version: 'week-spread-test',
    made_at: '2026-10-04T19:45:00.000Z',
    made_on: SUN,
    model: 'gpt-6-luna',
    first: MON,
    last: NEXT_SUN,
    basis: 'basis',
    place: [{ id: 'boiler', day: MON }],
    later: [{ id: 'present', back_on: '2026-10-13' }],
    habit_days: [],
    notes: [],
  };

  /** The review on its last step, with two made up todos for Gremly to have spread. */
  function onBoard(over: Record<string, unknown> = {}) {
    mockStore.todos = [
      { id: 'boiler', name: 'Sort the boiler', time_estimate_minutes: 60 },
      { id: 'present', name: 'Find a present', time_estimate_minutes: 60 },
    ];
    const base = madeUpRow({ status: 'started', answers: { step: 'board' } as any, ...over });
    // made for the answers the row holds, unless a test gives another spread
    const basis = spreadBasis(base.answers, base.read, PLANNED_DAYS, SUN);
    const row = 'spread' in over ? base : { ...base, spread: { ...SPREAD, basis } as any };
    setReview(row, reviewWith(SUN, 0, row), null);
    return row;
  }

  it('says Gremly is fitting the week until his spread is in', () => {
    onBoard({ spread: null });
    const { getByTestId, queryByTestId } = render(
      <WeekCard messageId="m7" meta={meta('board')} review={fakeReview()} />,
    );
    expect(getByTestId('week-board-fitting')).toBeTruthy();
    expect(queryByTestId('week-board-open')).toBeNull();
  });

  it('says so again when the spread in hand was made for other answers than the review’s are now', () => {
    onBoard({ spread: { ...SPREAD, basis: 'other answers' } });
    const { getByTestId, queryByTestId } = render(
      <WeekCard messageId="m7" meta={meta('board')} review={fakeReview()} />,
    );
    expect(getByTestId('week-board-fitting')).toBeTruthy();
    expect(queryByTestId('week-board-open')).toBeNull();
  });

  it('shows the week as Gremly spread it, and opens the board', () => {
    onBoard();
    const review = fakeReview();
    const { getByText, getByTestId, queryByText } = render(
      <WeekCard messageId="m7" meta={meta('board')} review={review} />,
    );
    expect(getByText(/Everything on your list would take about 2h/)).toBeTruthy();
    expect(
      getByText(
        /I've spread one todo across the days, priorities first, and the rest wait in Later/,
      ),
    ).toBeTruthy();
    expect(getByText('Mon')).toBeTruthy();
    expect(getByText('Plan my week')).toBeTruthy();
    fireEvent.press(getByTestId('week-board-open'));
    expect(review.board.open).toHaveBeenCalledTimes(1);
    // once they have been in, the button says so
    act(() => patchSession({ moves: { opened: true } }));
    expect(getByText('Open your week')).toBeTruthy();
    expect(queryByText('Plan my week')).toBeNull();
  });

  it('offers to try again when the spread did not come back, and the board by hand all the same', () => {
    onBoard({ spread: null });
    patchSession({ spreadFailed: true });
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m7" meta={meta('board')} review={review} />,
    );
    expect(
      getByText(
        "I couldn't spread your week just now. You can place things yourself, or have me try again.",
      ),
    ).toBeTruthy();
    fireEvent.press(getByTestId('week-board-retry'));
    expect(review.board.retry).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-board-open'));
    expect(review.board.open).toHaveBeenCalledTimes(1);
  });

  it('keeps Gremly’s line and the days once the week is planned, with nothing to open', () => {
    onBoard({ status: 'done', answers: { step: 'done' } });
    const { getByText, queryByTestId } = render(
      <WeekCard
        messageId="m7"
        meta={meta('board', { intro: 'Now the week itself. Kept.', settled: 'Week planned' })}
        review={fakeReview()}
      />,
    );
    expect(getByText('Now the week itself. Kept.')).toBeTruthy();
    expect(getByText('Week planned')).toBeTruthy();
    expect(getByText('Mon')).toBeTruthy();
    expect(queryByTestId('week-board-open')).toBeNull();
    expect(queryByTestId('week-board-fitting')).toBeNull();
  });
});

describe('their own days, on the board’s step', () => {
  // six of their own todos, five of them on a Wednesday with two hours
  const OWN = [
    { id: 'marking', name: 'The Year 9 marking', time_estimate_minutes: 60, due_day: TUE },
    ...[0, 1, 2, 3, 4].map((i) => ({
      id: `own-${i}`,
      name: `Own ${i}`,
      time_estimate_minutes: 40,
      due_day: WED,
    })),
  ];
  const DAYS = [MON, TUE, WED, THU, '2026-10-09', '2026-10-10', NEXT_SUN];
  const hours = { normal_day: 2, busy_day: 1, weekend_day: 4 };

  /** The review on the board, with their own todos and, when given, Gremly's spread and suggestions. */
  function onBoard(answers: Record<string, unknown> = {}, relief?: Record<string, unknown> | null) {
    mockStore.todos = OWN.map((t) => ({ ...t }));
    const base = madeUpRow({
      status: 'started',
      answers: { step: 'board', hours, ...answers } as any,
    });
    const row = {
      ...base,
      spread:
        relief === undefined
          ? null
          : ({
              version: 'week-spread-test',
              made_at: '2026-10-04T19:45:00.000Z',
              made_on: SUN,
              model: 'gpt-6-luna',
              first: MON,
              last: NEXT_SUN,
              basis: spreadBasis(base.answers, base.read, DAYS, SUN),
              place: [],
              later: [],
              habit_days: [],
              notes: [],
              relief: relief && {
                version: 'week-relief-test',
                basis: reliefBasis(base.answers, base.read, DAYS, SUN),
                ...relief,
              },
            } as any),
    };
    setReview(row, reviewWith(SUN, 0, row), null);
    return row;
  }
  const show = (review = fakeReview()) => ({
    review,
    ...render(<WeekCard messageId="m7" meta={meta('board')} review={review} />),
  });

  it('asks what to do with them when there are many, with the over-full day named', () => {
    onBoard();
    const { getByText, getByTestId, queryByTestId, review } = show();
    expect(
      getByText(
        "You've already put 6 todos on the days we're planning. Shall I plan around them, or would you rather I rearranged them? Wednesday holds more than it has room for.",
      ),
    ).toBeTruthy();
    expect(getByText('+1h 20m')).toBeTruthy();
    // the board waits behind the question
    expect(queryByTestId('week-board-card')).toBeNull();
    fireEvent.press(getByTestId('week-keep-some'));
    expect(review.board.keep).toHaveBeenCalledWith('some');
  });

  it('keeps them without asking when there are few', () => {
    mockStore.todos = [];
    onBoard();
    mockStore.todos = OWN.slice(0, 2).map((t) => ({ ...t }));
    const row = madeUpRow({ status: 'started', answers: { step: 'board', hours } as any });
    setReview(row, reviewWith(SUN, 0, row), null);
    const { queryByTestId, getByTestId } = show();
    expect(queryByTestId('week-keep')).toBeNull();
    expect(getByTestId('week-board-card')).toBeTruthy();
  });

  it('lets them pick which to keep, each with its pin', () => {
    onBoard({ keep: 'some', freed: [] });
    act(() => patchSession({ picking: true, freedDraft: ['own-1'] }));
    const { getByTestId, getByText, review } = show();
    expect(getByTestId('week-keep-pick')).toBeTruthy();
    // Wednesday with one freed: 160 minutes of the 120 it has
    expect(getByText('2h 40m of 2h')).toBeTruthy();
    fireEvent.press(getByTestId('week-keep-pin-own-0'));
    expect(review.board.togglePin).toHaveBeenCalledWith('own-0');
    fireEvent.press(getByTestId('week-keep-pick-done'));
    expect(review.board.keepDone).toHaveBeenCalledTimes(1);
  });

  it('then takes the over-full day, with Gremly’s suggested moves to take, change or leave', () => {
    onBoard(
      { keep: 'all' },
      {
        days: [
          {
            day: WED,
            over: 80,
            moves: [
              { id: 'own-0', to: THU, back_on: null },
              { id: 'own-1', to: null, back_on: '2026-10-13' },
            ],
            still: 0,
            note: 'These two can wait.',
          },
        ],
      },
    );
    const { getByText, getByTestId, queryByTestId, review } = show();
    // what they chose stays above the card, as their answer
    expect(getByText('Keep my days')).toBeTruthy();
    expect(
      getByText(
        "Wednesday holds 1h 20m more than it has room for. Here's what I'd move, if you agree.",
      ),
    ).toBeTruthy();
    expect(getByTestId('week-overfull-move-own-0')).toBeTruthy();
    expect(getByText('Thu')).toBeTruthy();
    expect(getByText('Later, back Tue 13')).toBeTruthy();
    expect(getByText('These two can wait.')).toBeTruthy();
    expect(queryByTestId('week-board-card')).toBeNull();
    fireEvent.press(getByTestId('week-overfull-take'));
    expect(review.board.relieve).toHaveBeenLastCalledWith(WED, 'moved');
    fireEvent.press(getByTestId('week-overfull-change'));
    expect(review.board.relieve).toHaveBeenLastCalledWith(WED, 'changed');
    fireEvent.press(getByTestId('week-overfull-leave'));
    expect(review.board.relieve).toHaveBeenLastCalledWith(WED, 'left');
    // the answer about their days can be opened again
    fireEvent.press(getByTestId('week-keep-change'));
    expect(review.board.askKeep).toHaveBeenCalledTimes(1);
  });

  it('then takes a todo that matters most and is on no day, with a day or a split to put it on one', () => {
    // five hours fit no day whole: Saturday and Sunday have four each
    const talk = { id: 'talk', name: 'Write the talk', time_estimate_minutes: 300 };
    const matters = { priorities: [{ text: 'The talk', item_ids: ['talk'] }] };
    const row = onBoard({ keep: 'none', ...matters }, null);
    mockStore.todos = [talk];
    const later = [{ id: 'talk', back_on: '2026-10-13' }];
    act(() =>
      setReview({ ...row, spread: { ...row.spread, later } } as any, reviewWith(SUN, 0, row), null),
    );
    const { getByText, getByTestId, queryByTestId, review, unmount } = show();
    expect(
      getByText(
        '“Write the talk” is one of the things that matter most this week, and at 5h it fits on no day as the week stands.',
      ),
    ).toBeTruthy();
    // no day holds it whole; in two parts it goes on the two days off
    expect(queryByTestId('week-fit-day')).toBeNull();
    expect(getByText('Split it in two')).toBeTruthy();
    expect(getByText('2h 30m on Saturday and 2h 30m on Sunday')).toBeTruthy();
    expect(queryByTestId('week-board-card')).toBeNull();
    fireEvent.press(getByTestId('week-fit-split'));
    expect(review.board.fit).toHaveBeenLastCalledWith('talk', 'split');
    fireEvent.press(getByTestId('week-fit-leave'));
    expect(review.board.fit).toHaveBeenLastCalledWith('talk', 'left');
    fireEvent.press(getByTestId('week-fit-open'));
    expect(review.board.open).toHaveBeenCalledTimes(1);
    unmount();

    // three hours fit a day off as the board stands: it is on no day yet, and Saturday is offered
    mockStore.todos = [{ ...talk, time_estimate_minutes: 180 }];
    const fits = show();
    expect(
      fits.getByText(
        '“Write the talk” is one of the things that matter most this week, and it is on no day yet.',
      ),
    ).toBeTruthy();
    fireEvent.press(fits.getByText('Put it on Saturday'));
    expect(fits.review.board.fit).toHaveBeenLastCalledWith('talk', 'day');
    fits.unmount();

    // dealt with: what they chose stays above the board's card, and the last can be taken back
    const fitted = { talk: { how: 'day', title: 'Write the talk', day: '2026-10-10', order: 1 } };
    act(() =>
      setReview(
        { ...row, answers: { ...row.answers, fitted }, spread: { ...row.spread, later } } as any,
        reviewWith(SUN, 0, row),
        null,
      ),
    );
    const done = show();
    expect(done.getByText('Put “Write the talk” on Saturday')).toBeTruthy();
    expect(done.getByTestId('week-board-card')).toBeTruthy();
    fireEvent.press(done.getByTestId('week-fit-undo'));
    expect(done.review.board.unfit).toHaveBeenCalledTimes(1);
  });

  it('says the suggestions are on their way until the spread is in, and that there are none when the call failed', () => {
    onBoard({ keep: 'all' });
    const waiting = show();
    expect(waiting.getByTestId('week-overfull-fitting')).toBeTruthy();
    waiting.unmount();
    onBoard(
      { keep: 'all' },
      { failed: true, days: [{ day: WED, over: 80, moves: [], still: 80, note: '' }] },
    );
    const failed = show();
    expect(
      failed.getByText(
        "I couldn't work out what to move just now. You can change the day yourself, or leave it.",
      ),
    ).toBeTruthy();
    expect(failed.queryByTestId('week-overfull-take')).toBeNull();
    expect(failed.getByTestId('week-overfull-leave')).toBeTruthy();
  });

  it('tells a day Gremly would leave as it is from one whose suggested moves did not hold', () => {
    const day = { day: WED, over: 80, moves: [], still: 80, note: '' };
    onBoard({ keep: 'all' }, { days: [{ ...day, asked: 0 }] });
    const left = show();
    expect(
      left.getByText(
        "Everything on it belongs there, so I'd leave it. You can still change it yourself.",
      ),
    ).toBeTruthy();
    left.unmount();
    // another sitting: he offered two moves and neither held
    resetWeekSession();
    onBoard({ keep: 'all' }, { days: [{ ...day, asked: 2 }] });
    const fell = show();
    expect(
      fell.getByText(
        "I couldn't work out what to move just now. You can change the day yourself, or leave it.",
      ),
    ).toBeTruthy();
    expect(fell.queryByTestId('week-overfull-take')).toBeNull();
  });

  it('is the board once every over-full day is dealt with, with what they chose above it', () => {
    onBoard({ keep: 'all', relieved: { [WED]: 'left' } }, { days: [] });
    const { getByText, getByTestId, queryByTestId } = show();
    expect(getByText('Keep my days')).toBeTruthy();
    expect(getByText('Leave Wednesday as it is')).toBeTruthy();
    expect(getByTestId('week-board-card')).toBeTruthy();
    expect(queryByTestId('week-overfull-take')).toBeNull();
  });

  it('opens the board to change one over-full day by hand: it says so, and its Done only closes it', () => {
    onBoard(
      { keep: 'all' },
      { days: [{ day: WED, over: 80, asked: 0, moves: [], still: 80, note: '' }] },
    );
    act(() => patchSession({ boardOpen: true, boardDay: WED, relieving: WED }));
    const review = fakeReview();
    const { getByText, getByTestId, queryByText } = render(<WeekBoardSheet review={review} />);
    expect(getByText('Change Wednesday')).toBeTruthy();
    expect(queryByText('Plan your week')).toBeNull();
    // it opens on that day
    expect(getByText('Wednesday')).toBeTruthy();
    fireEvent.press(getByTestId('week-board-done'));
    expect(review.board.close).toHaveBeenCalledTimes(1);
    expect(review.board.done).not.toHaveBeenCalled();
  });

  it('lets the week be finished from its sheet only once the spread for these answers is on it', () => {
    onBoard({ keep: 'all', relieved: { [WED]: 'left' } }, { days: [] });
    act(() => patchSession({ boardOpen: true }));
    const review = fakeReview();
    const { getByText, getByTestId, queryByTestId } = render(<WeekBoardSheet review={review} />);
    expect(getByText('Plan your week')).toBeTruthy();
    expect(queryByTestId('week-board-fitting')).toBeNull();
    fireEvent.press(getByTestId('week-board-done'));
    expect(review.board.done).toHaveBeenCalledTimes(1);
    // the spread in hand was made for other answers: a new one is on its way
    act(() => patchSession({ spreadFor: 'other answers' }));
    expect(getByTestId('week-board-fitting')).toBeTruthy();
    fireEvent.press(getByTestId('week-board-done'));
    expect(review.board.done).toHaveBeenCalledTimes(1);
    // it did not come back: the board is theirs to finish by hand
    act(() => patchSession({ spreadFailed: true }));
    expect(queryByTestId('week-board-fitting')).toBeNull();
    fireEvent.press(getByTestId('week-board-done'));
    expect(review.board.done).toHaveBeenCalledTimes(2);
  });
});

describe('the challenge', () => {
  it('shows Gremly’s read, the figures behind it and what is coming up, and takes their answer', () => {
    underWay('challenge');
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m2" meta={meta('challenge')} review={review} />,
    );
    expect(getByText('Reports are due while the week is already full.')).toBeTruthy();
    expect(getByText('things waiting')).toBeTruthy();
    expect(getByText('A short week with the school trip in it.')).toBeTruthy();
    // inside the week a day's name; beyond it, the date
    expect(getByText('Thu')).toBeTruthy();
    expect(getByText('23 Oct')).toBeTruthy();
    expect(getByText('Parents evening')).toBeTruthy();
    fireEvent.press(getByTestId('week-challenge-agree'));
    expect(review.challenge.agree).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-challenge-disagree'));
    expect(review.challenge.disagree).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-just-plan'));
    expect(review.justPlan).toHaveBeenCalledTimes(1);
  });

  it('waits for their words, not a tap, once they have said not quite, and shows what they added', () => {
    underWay('challenge', { challenge: { agreed: false, note: 'The reports moved to November' } });
    useWeekSession.setState({ fixing: true });
    const { getByText, queryByTestId } = render(
      <WeekCard messageId="m2" meta={meta('challenge')} review={fakeReview()} />,
    );
    expect(queryByTestId('week-challenge-agree')).toBeNull();
    expect(getByText('YOU ADDED')).toBeTruthy();
    expect(getByText('The reports moved to November')).toBeTruthy();
  });

  it('keeps showing the read once it is settled, with their answer under it and no buttons', () => {
    underWay('priorities', { challenge: { agreed: true } });
    const { getByText, queryByTestId, getByTestId } = render(
      <WeekCard
        messageId="m2"
        meta={meta('challenge', { settled: "That's about right" })}
        review={fakeReview()}
      />,
    );
    expect(getByText('Reports are due while the week is already full.')).toBeTruthy();
    expect(queryByTestId('week-challenge-agree')).toBeNull();
    expect(getByTestId('week-settled')).toBeTruthy();
    expect(getByText("That's about right")).toBeTruthy();
  });
});

describe('what matters most', () => {
  it('shows every option with Gremly’s picks marked, and says how many are picked', () => {
    underWay('priorities');
    const review = fakeReview();
    const first = render(<WeekCard messageId="m3" meta={meta('priorities')} review={review} />);
    expect(first.getByLabelText("Get the reports started, Gremly's pick")).toBeTruthy();
    expect(first.getByLabelText('Sort the boiler')).toBeTruthy();
    expect(first.getByText('Skip this')).toBeTruthy();
    fireEvent.press(first.getByTestId('week-priority-2'));
    expect(review.priorities.toggle).toHaveBeenCalledWith(2);
    first.unmount();

    useWeekSession.setState((s) => ({ draft: { ...s.draft!, priorities: [0, 2] } }));
    const picked = render(<WeekCard messageId="m3" meta={meta('priorities')} review={review} />);
    expect(picked.getByText('These two')).toBeTruthy();
    expect(picked.getByTestId('week-priority-0').props.accessibilityState.selected).toBe(true);
    expect(picked.getByTestId('week-priority-1').props.accessibilityState.selected).toBe(false);
    fireEvent.press(picked.getByTestId('week-priorities-done'));
    expect(review.priorities.done).toHaveBeenCalledTimes(1);
  });

  it('shows what was kept once settled, with Change to open it again', () => {
    underWay('shape', { priorities: [{ text: 'Two swims', item_ids: [] }] });
    const review = fakeReview();
    const { getByTestId, queryByTestId, getByText } = render(
      <WeekCard
        messageId="m3"
        meta={meta('priorities', { settled: 'Two swims' })}
        review={review}
      />,
    );
    expect(getByTestId('week-priority-3').props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('week-priorities-done')).toBeNull();
    expect(getByText('Change')).toBeTruthy();
    fireEvent.press(getByTestId('week-priorities-change'));
    expect(review.edit).toHaveBeenCalledWith('priorities');
  });

  it('shows what they added themselves through Gremly as a chip of its own, after the read’s', () => {
    underWay('shape', {
      priorities: [
        { text: 'Two swims', item_ids: [] },
        { text: 'The stock audit', item_ids: [] },
      ],
    });
    const { getByTestId, getByLabelText } = render(
      <WeekCard messageId="m3" meta={meta('priorities')} review={fakeReview()} />,
    );
    // the read has four options: theirs is the fifth chip, and it is picked
    expect(getByLabelText('The stock audit')).toBeTruthy();
    expect(getByTestId('week-priority-4').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('week-priority-3').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('week-priority-0').props.accessibilityState.selected).toBe(false);
  });

  it('says Save while a settled card is open again', () => {
    underWay('shape', { priorities: [{ text: 'Two swims', item_ids: [] }] });
    useWeekSession.setState({ editing: 'priorities' });
    const { getByText, queryByTestId } = render(
      <WeekCard messageId="m3" meta={meta('priorities')} review={fakeReview()} />,
    );
    expect(getByText('Save')).toBeTruthy();
    expect(queryByTestId('week-priorities-change')).toBeNull();
  });
});

describe('the shape of the week', () => {
  it('shows the deadlines, the busy days and the hours, each to change', () => {
    underWay('shape');
    const review = fakeReview();
    const { getByText, getByTestId, getByLabelText } = render(
      <WeekCard messageId="m4" meta={meta('shape')} review={review} />,
    );
    expect(getByText('School fair')).toBeTruthy();
    expect(getByText('Reports due')).toBeTruthy();
    fireEvent.press(getByLabelText('Remove School fair'));
    expect(review.shape.removeDate).toHaveBeenCalledWith(`note:${ID.fair}`);

    // Gremly's busy days, among the days being planned
    expect(getByTestId(`week-busy-${TUE}`).props.accessibilityState.selected).toBe(true);
    expect(getByTestId(`week-busy-${WED}`).props.accessibilityState.selected).toBe(false);
    fireEvent.press(getByTestId(`week-busy-${WED}`));
    expect(review.shape.toggleBusy).toHaveBeenCalledWith(WED);

    // his guess, in half hour steps
    expect(getByTestId('week-hours-normal_day').props.children).toBe('2h');
    expect(getByTestId('week-hours-busy_day').props.children).toBe('30m');
    expect(getByTestId('week-hours-weekend_day').props.children).toBe('4h');
    expect(getByText('Mon, Wed, Fri')).toBeTruthy();
    expect(getByText('Tue, Thu')).toBeTruthy();
    expect(getByText('A weekend day')).toBeTruthy();
    expect(getByText('About 15h this week')).toBeTruthy();
    // why he guessed what he did, while it is still his guess
    expect(getByText('Three evenings are taken this week.')).toBeTruthy();
    fireEvent.press(getByTestId('week-hours-more-normal_day'));
    expect(review.shape.stepHours).toHaveBeenCalledWith('normal_day', 0.5);
    fireEvent.press(getByTestId('week-hours-less-busy_day'));
    expect(review.shape.stepHours).toHaveBeenCalledWith('busy_day', -0.5);

    fireEvent.changeText(getByTestId('week-shape-add-input'), ' Passport renewal ');
    fireEvent.press(getByTestId('week-shape-add'));
    expect(review.shape.addDate).toHaveBeenCalledWith('Passport renewal');
    fireEvent.press(getByTestId('week-shape-done'));
    expect(review.shape.done).toHaveBeenCalledTimes(1);
  });

  it('leaves out a deadline they took off, and says a day off when their days off are not the weekend', () => {
    underWay('shape');
    useThisWeek.setState({ daysOff: [1, 2] });
    useWeekSession.setState((s) => ({
      draft: { ...s.draft!, datesOut: [`note:${ID.fair}`], busy: [] },
    }));
    const { queryByText, getByText } = render(
      <WeekCard messageId="m4" meta={meta('shape')} review={fakeReview()} />,
    );
    expect(queryByText('School fair')).toBeNull();
    expect(getByText('A day off')).toBeTruthy();
    expect(getByText('Mon, Tue')).toBeTruthy();
    expect(getByText('Mark busy days above')).toBeTruthy();
  });

  it('plans only the days left when it is picked up part way through the week', () => {
    underWay('shape', {}, WED);
    jest.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
    const { queryByTestId, getByTestId, queryByText } = render(
      <WeekCard messageId="m4" meta={meta('shape')} review={fakeReview()} />,
    );
    expect(queryByTestId(`week-busy-${TUE}`)).toBeNull();
    expect(getByTestId(`week-busy-${WED}`)).toBeTruthy();
    expect(getByTestId(`week-busy-${THU}`).props.accessibilityState.selected).toBe(true);
    // Wednesday to Sunday: two normal days, one busy, two days off
    expect(queryByText('About 12h 30m this week')).not.toBeNull();
  });
});

describe('the intention', () => {
  const field = (intention: { pick: number | null; own: string }) =>
    useWeekSession.setState((s) => ({ draft: { ...s.draft!, intention } }));

  it('opens on their own words, with Suggest one and Skip, and none of Gremly’s lines in sight', () => {
    underWay('intention');
    field({ pick: null, own: '' });
    const review = fakeReview();
    const { getByText, getByTestId, queryByText, queryByTestId } = render(
      <WeekCard messageId="m5" meta={meta('intention')} review={review} />,
    );
    expect(getByTestId('week-intention-own').props.placeholder).toBe('In your own words');
    expect(getByText('Suggest one')).toBeTruthy();
    expect(getByText('Skip')).toBeTruthy();
    expect(queryByText('Leave school by five twice.')).toBeNull();
    // nothing to keep yet
    expect(queryByTestId('week-intention-done')).toBeNull();
    fireEvent.changeText(getByTestId('week-intention-own'), 'Sleep more');
    expect(review.intention.write).toHaveBeenCalledWith('Sleep more');
    fireEvent.press(getByTestId('week-intention-suggest'));
    expect(review.intention.suggest).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-intention-skip'));
    expect(review.intention.skip).toHaveBeenCalledTimes(1);
  });

  it('shows the line Gremly suggested in the field, to keep, change or swap for another', () => {
    underWay('intention');
    field({ pick: 0, own: 'Start the reports before Thursday.' });
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m5" meta={meta('intention')} review={review} />,
    );
    expect(getByTestId('week-intention-own').props.value).toBe(
      'Start the reports before Thursday.',
    );
    expect(getByText('Suggest one')).toBeTruthy();
    fireEvent.press(getByText('Keep this one'));
    expect(review.intention.done).toHaveBeenCalledTimes(1);
  });

  it('once kept, shows the one they kept as they kept it, with Change', () => {
    underWay('ahead', { intention: 'Sleep more' });
    const review = fakeReview();
    const { getByText, getByTestId, queryByTestId } = render(
      <WeekCard messageId="m5" meta={meta('intention')} review={review} />,
    );
    expect(getByTestId('week-intention-kept')).toBeTruthy();
    expect(getByText('Sleep more')).toBeTruthy();
    expect(queryByTestId('week-intention-own')).toBeNull();
    fireEvent.press(getByTestId('week-intention-change'));
    expect(review.edit).toHaveBeenCalledWith('intention');
  });

  it('stops offering a line once the words are their own', () => {
    underWay('intention');
    field({ pick: null, own: 'Sleep more' });
    const { getByText, queryByText } = render(
      <WeekCard messageId="m5" meta={meta('intention')} review={fakeReview()} />,
    );
    expect(queryByText('Suggest one')).toBeNull();
    expect(getByText('Keep this one')).toBeTruthy();
    expect(getByText('Skip')).toBeTruthy();
  });
});

describe('what is ahead', () => {
  it('shows each milestone with its steps to tap in or out, then sets it up', () => {
    underWay('ahead');
    const review = fakeReview();
    const { getByText, getByTestId, getByLabelText } = render(
      <WeekCard messageId="m6" meta={meta('ahead')} review={review} />,
    );
    expect(getByText('Reports handed in')).toBeTruthy();
    expect(getByText('23 Oct')).toBeTruthy();
    expect(getByText('Mon 5')).toBeTruthy();
    expect(getByText('Set up these three steps')).toBeTruthy();
    expect(getByText('Not now')).toBeTruthy();
    fireEvent.press(getByLabelText('Leave out Draft the first ten'));
    expect(review.ahead.toggleStep).toHaveBeenCalledWith(ID.reports, 1);
    fireEvent.press(getByTestId(`week-milestone-setup-${ID.reports}`));
    expect(review.ahead.setUp).toHaveBeenCalledWith(ID.reports);
  });

  it('counts the steps kept, and once set up offers the undo and Next', () => {
    underWay('ahead');
    useWeekSession.setState((s) => ({
      draft: { ...s.draft!, stepsOut: { [ID.reports]: [2] } },
    }));
    const one = render(<WeekCard messageId="m6" meta={meta('ahead')} review={fakeReview()} />);
    expect(one.getByText('Set up these two steps')).toBeTruthy();
    expect(one.getByLabelText('Keep How are the reports going?')).toBeTruthy();
    one.unmount();

    underWay('ahead', { milestones: [{ about: ID.reports, goal: 'Reports handed in', steps: 2 }] });
    useWeekSession.setState({ undoable: { [`milestone:${ID.reports}`]: true } });
    const review = fakeReview();
    const set = render(<WeekCard messageId="m6" meta={meta('ahead')} review={review} />);
    expect(set.getByText('Set up. Tap to undo')).toBeTruthy();
    expect(set.getByText('Next')).toBeTruthy();
    fireEvent.press(set.getByTestId(`week-milestone-undo-${ID.reports}`));
    expect(review.ahead.undo).toHaveBeenCalledWith(ID.reports);
  });
});

describe('what needs them', () => {
  it('shows each one with why it is stuck, to open and talk through or leave', () => {
    underWay('needs_you', {
      needs_you: [
        { title: 'Sort the boiler', item_ids: [ID.boiler], decision: 'Later, back 12 Oct' },
      ],
    });
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m7" meta={meta('needs_you')} review={review} />,
    );
    expect(getByText('It keeps slipping to the weekend.')).toBeTruthy();
    // what was decided on one shows on it, and it can be opened again
    expect(getByText('Later, back 12 Oct')).toBeTruthy();
    expect(getByText('Change')).toBeTruthy();
    expect(getByText('Talk it through')).toBeTruthy();
    fireEvent.press(getByTestId('week-needs-talk-1'));
    expect(review.needsYou.talk).toHaveBeenCalledWith(1);
    fireEvent.press(getByTestId('week-needs-done'));
    expect(review.needsYou.done).toHaveBeenCalledTimes(1);
  });
});

describe('a card that is not the one to act on', () => {
  it('shows only what was settled on it: a copy the review moved on from, or another week’s', () => {
    underWay('shape');
    const old = render(
      <WeekCard
        messageId="m3"
        meta={meta('priorities', { settled: 'Two swims' })}
        review={fakeReview(false)}
      />,
    );
    expect(old.getByText('Two swims')).toBeTruthy();
    expect(old.queryByTestId('week-priorities')).toBeNull();
    old.unmount();
    // a thread read back before its week is in hand
    resetWeekSession();
    const cold = render(<WeekCard messageId="m4" meta={meta('shape')} review={fakeReview()} />);
    expect(cold.toJSON()).toBeNull();
  });

  it('cannot be changed once the week is planned', () => {
    const row = madeUpRow({
      status: 'done',
      answers: { step: 'done', priorities: [{ text: 'Two swims', item_ids: [] }] },
    });
    setReview(row, reviewOn(SUN, 0), null);
    const { queryByTestId, getByTestId } = render(
      <WeekCard messageId="m3" meta={meta('priorities')} review={fakeReview()} />,
    );
    expect(getByTestId('week-priorities')).toBeTruthy();
    expect(queryByTestId('week-priorities-change')).toBeNull();
    expect(queryByTestId('week-priorities-done')).toBeNull();
  });
});

describe('under the thread', () => {
  it('shows the loading card while Gremly makes his read', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <WeekFooter loading canCarryOn={false} onCarryOn={jest.fn()} />,
    );
    expect(getByTestId('week-loading')).toBeTruthy();
    expect(getByText('Gremly is reading your week')).toBeTruthy();
    expect(queryByTestId('week-carry-on')).toBeNull();
  });

  it('shows Carry on when the review is waiting for it, and nothing otherwise', () => {
    const onCarryOn = jest.fn();
    const on = render(<WeekFooter loading={false} canCarryOn onCarryOn={onCarryOn} />);
    fireEvent.press(on.getByTestId('week-carry-on'));
    expect(onCarryOn).toHaveBeenCalledTimes(1);
    on.unmount();
    const off = render(<WeekFooter loading={false} canCarryOn={false} onCarryOn={onCarryOn} />);
    expect(off.toJSON()).toBeNull();
  });

  it('draws the button to their week with what it opens', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <WeekOfferButton label="Plan your week" onPress={onPress} />,
    );
    expect(getByText('Plan your week')).toBeTruthy();
    fireEvent.press(getByTestId('week-offer'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
