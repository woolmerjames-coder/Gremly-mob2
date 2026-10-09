/**
 * The week's board (components/week/WeekBoard): the sheet with its three
 * tabs, drawn from a made up person's board. It only draws what it is given
 * and says what was tapped, so each test reads what is on screen and which
 * tap reached the review. Sunday 4 October 2026, planning Monday 5 to Sunday 11.
 */
import React from 'react';
import { Modal } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { boardOf, type Board } from '../../../lib/week/board/model';
import type { WeekSpread } from '../../../lib/repo/weekReviewRepo';
import { WeekBoard, type WeekBoardProps } from '../WeekBoard';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return {
    AlignJustify: icon('align-justify'),
    Check: icon('check'),
    Plus: icon('plus'),
    ChevronRight: icon('chevron'),
    ChevronLeft: icon('chevron-left'),
    Pause: icon('pause'),
    Feather: icon('feather'),
  };
});

const TODAY = '2026-10-04';
const [MON, TUE, WED, THU, FRI, SAT, SUN] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];

const todo = (id: string, name: string, o: Record<string, unknown> = {}) => ({
  id,
  name,
  created_at: '2026-09-20T09:00:00Z',
  ...o,
});

const TODOS = [
  todo('marking', 'The Year 9 marking', { time_estimate_minutes: 60, due_day: TUE }),
  todo('boiler', 'Sort the boiler', { time_estimate_minutes: 20, sweep_reschedule_count: 6 }),
  todo('reports', 'Gather the grades', { time_estimate_minutes: 30, due_day: '2026-10-01' }),
  todo('present', 'Find a present', { resurface_at: '2026-10-15' }),
  todo('desk', 'Look at standing desks', { time_estimate_minutes: 15 }),
  todo('step', 'Draft the first ten', {
    time_estimate_minutes: 60,
    due_day: THU,
    created_at: '2026-10-04T18:00:00Z',
    views: { milestone: { goal: 'Reports handed in', date: '2026-10-23' } },
  }),
];

const HABITS = [
  {
    id: 'swim',
    name: 'Swim',
    cadence: 'weekly',
    target_per_period: 2,
    time_estimate_minutes: 40,
    floor_note: 'Ten lengths',
  },
];

const SPREAD: WeekSpread = {
  version: 'week-spread-test',
  made_at: '2026-10-04T19:00:00.000Z',
  made_on: TODAY,
  model: 'gpt-6-luna',
  first: MON,
  last: SUN,
  basis: 'basis',
  place: [
    { id: 'reports', day: MON },
    { id: 'boiler', day: WED },
  ],
  later: [{ id: 'desk', back_on: '2026-10-13' }],
  habit_days: [{ id: 'swim', days: [MON, SAT] }],
  notes: [{ day: WED, note: 'A lighter day.' }],
};

function madeUpBoard(
  over: { todos?: any[]; habits?: any[]; eases?: any[]; ease?: Record<string, any> } = {},
): Board {
  return boardOf({
    today: TODAY,
    span: { span_start: MON, span_end: SUN },
    daysOff: [0, 6],
    row: {
      read: null,
      spread: SPREAD,
      answers: {
        hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
        busy_days: [THU],
        board: over.ease ? { habit_ease: over.ease } : undefined,
      },
    },
    todos: over.todos ?? TODOS,
    habits: over.habits ?? HABITS,
    habitPlans: [],
    eases: over.eases ?? [],
    groups: new Map([
      ['boiler', 'Home'],
      ['present', 'Family'],
    ]),
  });
}

/** How many times a line of text is on screen. */
const getAllByTextOf = (root: Parameters<typeof within>[0], text: string) =>
  within(root).getAllByText(text).length;

function sheet(over: Partial<WeekBoardProps> = {}) {
  const spies = {
    onMove: jest.fn(),
    onTick: jest.fn(),
    onToggleHabit: jest.fn(),
    onEaseHabit: jest.fn(),
    onDone: jest.fn(),
    onClose: jest.fn(),
    onRetry: jest.fn(),
  };
  const props: WeekBoardProps = {
    visible: true,
    board: madeUpBoard(),
    today: TODAY,
    sub: 'Mon 5 to Sun 11 October',
    ...spies,
    ...over,
  };
  const view = render(<WeekBoard {...props} />);
  return { ...view, ...spies, props };
}

describe('the days', () => {
  it('opens on the first day, with the week’s room and what is on the day', () => {
    const { getByText, getByTestId, queryByText } = sheet();
    expect(getByText('Plan your week')).toBeTruthy();
    expect(getByText('Mon 5 to Sun 11 October')).toBeTruthy();
    // four ordinary days, a busy one and the weekend
    expect(getByText('Your room this week: about 17h')).toBeTruthy();
    expect(getByText('Monday')).toBeTruthy();
    // two hours, less the swim and the one todo
    expect(getByText('50m free')).toBeTruthy();
    expect(getByText('Swim')).toBeTruthy();
    expect(getByText('Gather the grades')).toBeTruthy();
    expect(getByText("Gremly's pick")).toBeTruthy();
    expect(queryByText('Sort the boiler')).toBeNull();
    expect(getByTestId('week-board-day-' + MON).props.accessibilityState.selected).toBe(true);
  });

  it('shows another day when its tile is tapped, with Gremly’s note and how long a todo has waited', () => {
    const { getByText, getByTestId, queryByText } = sheet({ spread: true });
    fireEvent.press(getByTestId('week-board-day-' + WED));
    expect(getByText('Wednesday')).toBeTruthy();
    expect(getByText('A lighter day.')).toBeTruthy();
    expect(getByText('Sort the boiler')).toBeTruthy();
    expect(getByText('Since Sep, moved 6×')).toBeTruthy();
    expect(queryByText('Gather the grades')).toBeNull();
    // a busy day with no note of Gremly's says why it is light; a step set up in the review says so
    fireEvent.press(getByTestId('week-board-day-' + THU));
    expect(getByText("A busy day, so I've kept it light")).toBeTruthy();
    expect(getByText('New step')).toBeTruthy();
    // a day with nothing on it
    fireEvent.press(getByTestId('week-board-day-' + FRI));
    expect(getByText('Nothing on this day yet.')).toBeTruthy();
    expect(getByText('2h free')).toBeTruthy();
  });

  it('says a busy day was kept light only where Gremly spread the week and the day is not over', () => {
    // no spread of his on this board (a week changed by hand, or one that did not come back)
    const plain = sheet();
    fireEvent.press(plain.getByTestId('week-board-day-' + THU));
    expect(plain.queryByText("A busy day, so I've kept it light")).toBeNull();
    plain.unmount();
    // a busy day with more on it than it has room for was not kept light
    const over = sheet({
      spread: true,
      board: madeUpBoard({
        todos: [
          ...TODOS,
          { id: 'extra', name: 'One more', time_estimate_minutes: 30, due_day: THU },
        ],
      }),
    });
    fireEvent.press(over.getByTestId('week-board-day-' + THU));
    expect(over.getByText('30m over')).toBeTruthy();
    expect(over.queryByText("A busy day, so I've kept it light")).toBeNull();
  });

  it('says a day is over when more is on it than it has room for', () => {
    const { getByText, getByTestId } = sheet({
      board: madeUpBoard({
        todos: [
          ...TODOS,
          todo('big', 'Clear the garage', { time_estimate_minutes: 90, due_day: TUE }),
        ],
      }),
    });
    fireEvent.press(getByTestId('week-board-day-' + TUE));
    expect(getByText('30m over')).toBeTruthy();
  });

  it('moves a todo to the day or to Later that is tapped, and closes the chips', () => {
    const { getByTestId, getByText, queryByText, onMove } = sheet();
    fireEvent.press(getByTestId('week-board-todo-reports'));
    expect(getByText('Move it to')).toBeTruthy();
    expect(getByTestId('week-move-' + MON).props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByTestId('week-move-' + FRI));
    expect(onMove).toHaveBeenLastCalledWith('reports', FRI);
    expect(queryByText('Move it to')).toBeNull();
    fireEvent.press(getByTestId('week-board-todo-reports'));
    fireEvent.press(getByTestId('week-move-later'));
    expect(onMove).toHaveBeenLastCalledWith('reports', 'later');
    // a second tap on the todo closes its chips with nothing moved
    fireEvent.press(getByTestId('week-board-todo-reports'));
    fireEvent.press(getByTestId('week-board-todo-reports'));
    expect(queryByText('Move it to')).toBeNull();
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('adds one from Later to the day, from a tray grouped by the part of their life', () => {
    const { getByTestId, getByText, queryByTestId, onMove } = sheet();
    expect(getByText('+ Add to Mon')).toBeTruthy();
    fireEvent.press(getByTestId('week-board-add'));
    expect(getByText('Close')).toBeTruthy();
    expect(getByText('Family')).toBeTruthy();
    expect(getByText('Everything else')).toBeTruthy();
    fireEvent.press(getByTestId('week-board-add-present'));
    expect(onMove).toHaveBeenLastCalledWith('present', MON);
    fireEvent.press(getByTestId('week-board-add'));
    expect(queryByTestId('week-board-add-desk')).toBeNull();
  });

  it('says so in the tray when nothing is waiting in Later', () => {
    const { getByTestId, getByText } = sheet({
      board: madeUpBoard({ todos: TODOS.filter((t) => !['present', 'desk'].includes(t.id)) }),
    });
    fireEvent.press(getByTestId('week-board-add'));
    expect(getByText('Nothing is waiting in Later.')).toBeTruthy();
  });
});

describe('the habits', () => {
  it('shows each habit with how many days are planned, and toggles the day tapped', () => {
    const { getByTestId, getByText, onToggleHabit } = sheet();
    fireEvent.press(getByTestId('week-board-tab-habits'));
    expect(
      getByText(
        "Pick the days you'll do each one. I've started you off away from the busy days, and each morning I'll check in on that day's. You can also pause one for the week, or do a lighter version of it.",
      ),
    ).toBeTruthy();
    expect(getByText('2 of 2 planned')).toBeTruthy();
    expect(getByText('40m')).toBeTruthy();
    expect(getByTestId(`week-board-habit-swim-${MON}`).props.accessibilityState.selected).toBe(
      true,
    );
    expect(getByTestId(`week-board-habit-swim-${WED}`).props.accessibilityState.selected).toBe(
      false,
    );
    fireEvent.press(getByTestId(`week-board-habit-swim-${WED}`));
    expect(onToggleHabit).toHaveBeenLastCalledWith('swim', WED);
    fireEvent.press(getByTestId(`week-board-habit-swim-${MON}`));
    expect(onToggleHabit).toHaveBeenLastCalledWith('swim', MON);
  });

  it('offers to pause a habit for the week or do a lighter version, and says which was tapped', () => {
    const { getByTestId, getByText, queryByTestId, onEaseHabit } = sheet();
    fireEvent.press(getByTestId('week-board-tab-habits'));
    expect(getByText('Pause this week')).toBeTruthy();
    expect(getByText('Lighter version')).toBeTruthy();
    expect(getByTestId('week-board-habit-swim-pause').props.accessibilityState.selected).toBe(
      false,
    );
    // nothing to type until a lighter version is on
    expect(queryByTestId('week-board-habit-swim-note')).toBeNull();
    fireEvent.press(getByTestId('week-board-habit-swim-pause'));
    expect(onEaseHabit).toHaveBeenLastCalledWith('swim', 'pause', undefined);
    // a lighter version starts from the habit's own smallest version
    fireEvent.press(getByTestId('week-board-habit-swim-lighter'));
    expect(onEaseHabit).toHaveBeenLastCalledWith('swim', 'lighter', 'Ten lengths');
  });

  it('shows a paused habit with no days to pick, and ends the pause on a second tap', () => {
    const { getByTestId, getByText, queryByTestId, queryByText, onEaseHabit } = sheet({
      board: madeUpBoard({ ease: { swim: { mode: 'pause' } } }),
    });
    fireEvent.press(getByTestId('week-board-tab-habits'));
    expect(getByText('Paused')).toBeTruthy();
    expect(queryByText('2 of 2 planned')).toBeNull();
    expect(queryByTestId(`week-board-habit-swim-${MON}`)).toBeNull();
    expect(
      getByText(
        "It's off your days and I won't ask about it or count it against you. If you do it anyway, it still counts.",
      ),
    ).toBeTruthy();
    expect(getByTestId('week-board-habit-swim-pause').props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByTestId('week-board-habit-swim-pause'));
    expect(onEaseHabit).toHaveBeenLastCalledWith('swim', null, undefined);
  });

  it('takes the lighter version in their own words, and keeps its days', () => {
    const { getByTestId, getByText, onEaseHabit } = sheet({
      board: madeUpBoard({ ease: { swim: { mode: 'lighter', note: 'Ten lengths' } } }),
    });
    fireEvent.press(getByTestId('week-board-tab-habits'));
    expect(getByText('2 of 2 planned · lighter version')).toBeTruthy();
    expect(getByTestId(`week-board-habit-swim-${MON}`).props.accessibilityState.selected).toBe(
      true,
    );
    const note = getByTestId('week-board-habit-swim-note');
    expect(note.props.value).toBe('Ten lengths');
    fireEvent.changeText(note, 'Twenty minutes in the pool');
    expect(onEaseHabit).toHaveBeenLastCalledWith('swim', 'lighter', 'Twenty minutes in the pool');
    // what is typed stays as typed, whatever the board makes of it
    expect(getByTestId('week-board-habit-swim-note').props.value).toBe(
      'Twenty minutes in the pool',
    );
    fireEvent.press(getByTestId('week-board-habit-swim-lighter'));
    expect(onEaseHabit).toHaveBeenLastCalledWith('swim', null, undefined);
  });

  it('closes the days of a pause that holds only part of the week', () => {
    const { getByTestId, getByText, onToggleHabit } = sheet({
      board: madeUpBoard({
        eases: [{ id: 'e1', habit_id: 'swim', mode: 'pause', period_start: MON, period_end: TUE }],
      }),
    });
    fireEvent.press(getByTestId('week-board-tab-habits'));
    expect(getByText('Paused on Mon and Tue')).toBeTruthy();
    const mon = getByTestId(`week-board-habit-swim-${MON}`);
    expect(mon.props.accessibilityState).toMatchObject({ selected: false, disabled: true });
    fireEvent.press(mon);
    expect(onToggleHabit).not.toHaveBeenCalled();
    // the pause chip is for the whole week, which this one is not
    expect(getByTestId('week-board-habit-swim-pause').props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('says so when there are no habits to plan', () => {
    const { getByTestId, getByText } = sheet({ board: madeUpBoard({ habits: [] }) });
    fireEvent.press(getByTestId('week-board-tab-habits'));
    expect(getByText('No habits to plan this week.')).toBeTruthy();
  });
});

describe('Later', () => {
  it('shows everything put off with the day it comes back, and gives one a day when tapped', () => {
    const { getByTestId, getByText, queryByTestId, onMove } = sheet();
    fireEvent.press(getByTestId('week-board-tab-later'));
    expect(getByText('Find a present')).toBeTruthy();
    expect(getByText('Back Thu 15')).toBeTruthy();
    expect(getByText('Look at standing desks')).toBeTruthy();
    expect(getByText('Back Tue 13')).toBeTruthy();
    expect(queryByTestId('week-move-' + SAT)).toBeNull();
    fireEvent.press(getByTestId('week-board-later-desk'));
    expect(getByTestId('week-move-later').props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByTestId('week-move-' + SAT));
    expect(onMove).toHaveBeenLastCalledWith('desk', SAT);
    expect(queryByTestId('week-move-' + SAT)).toBeNull();
  });

  it('says so when nothing is put off', () => {
    const { getByTestId, getByText } = sheet({
      board: madeUpBoard({ todos: TODOS.filter((t) => !['present', 'desk'].includes(t.id)) }),
    });
    fireEvent.press(getByTestId('week-board-tab-later'));
    expect(getByText('Nothing is waiting in Later.')).toBeTruthy();
  });
});

describe('a todo’s done tick', () => {
  /** The board without the todos that are done: what the review hands the sheet once a tick is saved. */
  const without = (...ids: string[]) =>
    madeUpBoard({ todos: TODOS.filter((t) => !ids.includes(t.id)) });

  it('is on every todo, on its day and in Later', () => {
    const { getByTestId } = sheet();
    // Monday holds the reports
    expect(getByTestId('week-board-tick-reports').props.accessibilityState.checked).toBe(false);
    expect(getByTestId('week-board-tick-reports').props.accessibilityLabel).toBe(
      'Mark as done: Gather the grades',
    );
    fireEvent.press(getByTestId('week-board-day-' + TUE));
    expect(getByTestId('week-board-tick-marking')).toBeTruthy();
    fireEvent.press(getByTestId('week-board-tab-later'));
    expect(getByTestId('week-board-tick-present')).toBeTruthy();
    expect(getByTestId('week-board-tick-desk')).toBeTruthy();
  });

  it('says the todo is done, and keeps it in sight on its day with the tick filled', () => {
    const view = sheet();
    fireEvent.press(view.getByTestId('week-board-tick-reports'));
    expect(view.onTick).toHaveBeenLastCalledWith('reports', true);
    // a tick is not a move
    expect(view.onMove).not.toHaveBeenCalled();
    // saved: the board no longer holds it, and the sheet still shows it where it was
    view.rerender(<WeekBoard {...view.props} board={without('reports')} />);
    expect(view.queryByTestId('week-board-todo-reports')).toBeNull();
    expect(view.getByTestId('week-board-done-reports')).toBeTruthy();
    expect(view.getByTestId('week-board-tick-reports').props.accessibilityState.checked).toBe(true);
    expect(view.getByTestId('week-board-tick-reports').props.accessibilityLabel).toBe(
      'Mark as not done: Gather the grades',
    );
    // the day is not empty while it shows one done there
    expect(view.queryByText('Nothing on this day yet.')).toBeNull();
    // it is shown on its own day only
    fireEvent.press(view.getByTestId('week-board-day-' + TUE));
    expect(view.queryByTestId('week-board-done-reports')).toBeNull();
  });

  it('takes the tick back on a second tap', () => {
    const view = sheet();
    fireEvent.press(view.getByTestId('week-board-tick-reports'));
    view.rerender(<WeekBoard {...view.props} board={without('reports')} />);
    fireEvent.press(view.getByTestId('week-board-tick-reports'));
    expect(view.onTick).toHaveBeenLastCalledWith('reports', false);
    // open again: the board holds it, and it is drawn once, as open
    view.rerender(<WeekBoard {...view.props} board={madeUpBoard()} />);
    expect(view.getByTestId('week-board-todo-reports')).toBeTruthy();
    expect(view.queryByTestId('week-board-done-reports')).toBeNull();
    expect(view.getByTestId('week-board-tick-reports').props.accessibilityState.checked).toBe(
      false,
    );
  });

  it('shows a todo as open again when its tick could not be saved', () => {
    const view = sheet();
    fireEvent.press(view.getByTestId('week-board-tick-reports'));
    // nothing changed: the board still holds it
    view.rerender(<WeekBoard {...view.props} board={madeUpBoard()} />);
    expect(view.getByTestId('week-board-todo-reports')).toBeTruthy();
    expect(view.queryByTestId('week-board-done-reports')).toBeNull();
  });

  it('keeps one ticked in Later in sight there, under Done', () => {
    const view = sheet();
    fireEvent.press(view.getByTestId('week-board-tab-later'));
    fireEvent.press(view.getByTestId('week-board-tick-desk'));
    expect(view.onTick).toHaveBeenLastCalledWith('desk', true);
    view.rerender(<WeekBoard {...view.props} board={without('desk')} />);
    expect(view.queryByTestId('week-board-later-desk')).toBeNull();
    expect(
      within(view.getByTestId('week-board-later-done')).getByText('Look at standing desks'),
    ).toBeTruthy();
    fireEvent.press(view.getByTestId('week-board-tick-desk'));
    expect(view.onTick).toHaveBeenLastCalledWith('desk', false);
  });

  it('starts afresh each time the sheet is opened', () => {
    const view = sheet();
    fireEvent.press(view.getByTestId('week-board-tick-reports'));
    view.rerender(<WeekBoard {...view.props} board={without('reports')} visible={false} />);
    view.rerender(<WeekBoard {...view.props} board={without('reports')} />);
    expect(view.queryByTestId('week-board-done-reports')).toBeNull();
  });
});

describe('the sheet itself', () => {
  it('finishes on Done, and takes no second tap while the week is being saved', () => {
    const first = sheet();
    fireEvent.press(first.getByTestId('week-board-done'));
    expect(first.onDone).toHaveBeenCalledTimes(1);
    first.unmount();
    const saving = sheet({ saving: true });
    expect(saving.getByText('Saving your week')).toBeTruthy();
    fireEvent.press(saving.getByTestId('week-board-done'));
    expect(saving.onDone).not.toHaveBeenCalled();
    // nothing on the board takes a tap while the week is written, and the phone's back is not a way out
    expect(saving.getByTestId('week-board').props.pointerEvents).toBe('none');
    saving.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(saving.onClose).not.toHaveBeenCalled();
  });

  it('cannot be finished while the spread for the week is still on its way', () => {
    const waiting = sheet({ fitting: true, doneOff: true });
    const done = waiting.getByTestId('week-board-done');
    expect(done.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(done);
    expect(waiting.onDone).not.toHaveBeenCalled();
    // the way back is still open, by the arrow and by the phone's own back
    fireEvent.press(waiting.getByTestId('week-board-close'));
    waiting.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(waiting.onClose).toHaveBeenCalledTimes(2);
  });

  it('says Gremly is fitting the week while he is, and offers to try again when he could not', () => {
    const fitting = sheet({ fitting: true });
    expect(fitting.getByTestId('week-board-fitting')).toBeTruthy();
    expect(fitting.queryByTestId('week-board-failed')).toBeNull();
    // the days can still be seen and used while he works
    expect(fitting.getByText('Monday')).toBeTruthy();
    fitting.unmount();
    const failed = sheet({ failed: true });
    fireEvent.press(failed.getByTestId('week-board-retry'));
    expect(failed.onRetry).toHaveBeenCalledTimes(1);
  });

  it('draws nothing while it is closed, and opens on the days each time', () => {
    const { queryByTestId, getByTestId, getByText, rerender, props } = sheet({ visible: false });
    expect(queryByTestId('week-board')).toBeNull();
    rerender(<WeekBoard {...props} visible />);
    fireEvent.press(getByTestId('week-board-tab-later'));
    expect(getByText('Back Thu 15')).toBeTruthy();
    rerender(<WeekBoard {...props} visible={false} />);
    rerender(<WeekBoard {...props} visible />);
    expect(getByText('Monday')).toBeTruthy();
    expect(getByTestId('week-board-tab-days').props.accessibilityState.selected).toBe(true);
  });

  it('marks a todo on a day they gave it themselves, and opens on the day it is opened for', () => {
    const own = sheet({ ownTag: true, openOn: TUE });
    // Tuesday's marking is on a day of their own
    expect(own.getByText('Tuesday')).toBeTruthy();
    expect(own.getByText('The Year 9 marking')).toBeTruthy();
    expect(own.getByText('Your day')).toBeTruthy();
    // what Gremly placed is not marked as theirs
    fireEvent.press(own.getByTestId('week-board-day-' + MON));
    expect(own.queryByText('Your day')).toBeNull();
    own.unmount();
    // changing a planned week by hand, every day is theirs and none is marked
    const plain = sheet({ openOn: TUE });
    expect(plain.queryByText('Your day')).toBeNull();
  });

  it('goes back without finishing from the arrow in its header', () => {
    const { getByTestId, onClose, onDone } = sheet();
    fireEvent.press(getByTestId('week-board-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('a week already planned, changed by hand', () => {
  // no spread, and nothing given a day they did not give it
  const changing = () =>
    boardOf({
      today: TODAY,
      span: { span_start: MON, span_end: SUN },
      daysOff: [0, 6],
      row: {
        read: null,
        spread: null,
        answers: { hours: { normal_day: 2, busy_day: 1, weekend_day: 4 } },
      },
      todos: TODOS,
      habits: HABITS,
      habitPlans: [],
      assign: false,
    });

  it('says what it is for, and lists a todo with no day beside what is put off', () => {
    const { getByText, getByTestId, queryByText, onMove } = sheet({
      board: changing(),
      title: 'Change your week',
    });
    expect(getByText('Change your week')).toBeTruthy();
    expect(queryByText('Plan your week')).toBeNull();
    fireEvent.press(getByTestId('week-board-tab-later'));
    expect(
      getByText(
        "Each of these comes back on its day, on Today and in that night's wrap up. The ones with no day yet wait until you give them one. Tap one to give it a day this week.",
      ),
    ).toBeTruthy();
    // put off, with its day; and three that were never given one
    expect(getByText('Back Thu 15')).toBeTruthy();
    expect(getAllByTextOf(getByTestId('week-board'), 'No day yet')).toBe(3);
    fireEvent.press(getByTestId('week-board-later-desk'));
    fireEvent.press(getByTestId('week-move-' + SAT));
    expect(onMove).toHaveBeenLastCalledWith('desk', SAT);
  });

  it('offers a todo with no day in the tray of a day', () => {
    const { getByTestId, onMove } = sheet({ board: changing() });
    fireEvent.press(getByTestId('week-board-add'));
    fireEvent.press(getByTestId('week-board-add-boiler'));
    expect(onMove).toHaveBeenLastCalledWith('boiler', MON);
  });
});
