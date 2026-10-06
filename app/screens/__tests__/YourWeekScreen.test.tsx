/**
 * Your week, the screen (app/screens/YourWeekScreen): what it shows for the
 * week in hand, where its buttons go, and changing the week by hand as one
 * change with one Undo. The person is made up (Maya, whose weekly day is
 * Sunday); it is Wednesday 7 October 2026.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
// one navigation for the life of the screen, as the real one is
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  setOptions: () => undefined,
  addListener: () => () => undefined,
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  // every icon the screen and the board draw, as a plain view
  return new Proxy({}, { get: (_t, name) => () => <View testID={`icon-${String(name)}`} /> });
});
const mockStore: any = {};
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: Object.assign((pick: (s: any) => unknown) => pick(mockStore), {
    getState: () => mockStore,
  }),
}));
jest.mock('../../../lib/repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
  changeWeekReview: jest.fn(),
}));
const mockSaveChange = jest.fn();
jest.mock('../../../lib/week/board/change', () => ({
  ...jest.requireActual('../../../lib/week/board/change'),
  saveChange: (...a: unknown[]) => mockSaveChange(...a),
}));

import YourWeekScreen from '../YourWeekScreen';
import { getWeekReview, getWeekSettings } from '../../../lib/repo/weekReviewRepo';
import { useThisWeek } from '../../../lib/week/thisWeek';

const [SUN, MON, WED, THU, FRI, SAT] = [
  '2026-10-04',
  '2026-10-05',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
];

const done = (over: Record<string, unknown> = {}) => ({
  id: 'row-1',
  owner_id: 'maya',
  week_start: MON,
  span_start: MON,
  status: 'done',
  kind: 'weekly',
  read: null,
  spread: null,
  checkins: [],
  prompt_versions: {},
  created_at: `${SUN}T15:00:00.000Z`,
  completed_at: `${SUN}T19:50:00.000Z`,
  answers: {
    step: 'done',
    intention: 'Fewer things, finished.',
    priorities: [{ text: 'Get the reports started', item_ids: [] }],
    hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    planned: {
      todos: 2,
      later: 1,
      habit_days: 1,
      days: {
        [MON]: { todos: ['reports'], habits: [] },
        [WED]: { todos: ['boiler'], habits: [] },
        [SAT]: { todos: [], habits: ['swim'] },
      },
    },
  },
  ...over,
});

let rows: Record<string, any>;

/** Set the clock, open the screen, and let its read of the week come back. */
async function open(day = 7) {
  jest.setSystemTime(new Date(2026, 9, day, 12, 0, 0));
  const screen = render(<YourWeekScreen />);
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return screen;
}

beforeEach(() => {
  jest.useFakeTimers();
  rows = { [MON]: done() };
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  Object.assign(mockStore, {
    userId: 'maya',
    todos: [
      { id: 'reports', name: 'Gather the grades', completed_at: `${MON}T17:00:00` },
      { id: 'boiler', name: 'Sort the boiler', due_day: WED, time_estimate_minutes: 20 },
      { id: 'present', name: 'Find a present', resurface_at: '2026-10-15' },
    ],
    habits: [{ id: 'swim', name: 'Swim', cadence: 'weekly', target_per_period: 1 }],
    habitPlans: [{ habit_id: 'swim', planned_date: SAT }],
    habitProgress: [],
    worlds: [],
    dropWorldLinks: [],
  });
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: null, loaded: false });
  (getWeekSettings as jest.Mock).mockResolvedValue({ weekly_day: 0, days_off: [0, 6] });
  (getWeekReview as jest.Mock).mockImplementation(
    async (_user: string, weekStart: string) => rows[weekStart] ?? null,
  );
  mockSaveChange.mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

describe('your week', () => {
  it('shows the week they planned, read when the screen opens', async () => {
    const { getByText, getByTestId, queryByTestId } = await open();
    expect(getByText('Your week')).toBeTruthy();
    expect(getByText('Mon 5 to Sun 11 Oct')).toBeTruthy();
    expect(getByText('“Fewer things, finished.”')).toBeTruthy();
    expect(getByText('Get the reports started')).toBeTruthy();
    expect(getByText('1 of 1 done')).toBeTruthy();
    expect(getByText('Today, Wed 7')).toBeTruthy();
    expect(getByText('Sort the boiler')).toBeTruthy();
    expect(getByText('One thing is waiting in Later. It comes back Thu 15.')).toBeTruthy();
    expect(queryByTestId('your-week-loading')).toBeNull();
    fireEvent.press(getByTestId('your-week-back'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('says so when the week is not planned, and goes to the review', async () => {
    rows[MON] = done({ status: 'started', completed_at: null, answers: { step: 'shape' } });
    const { getByText, getByTestId, queryByTestId } = await open();
    expect(getByText("This week isn't planned yet.")).toBeTruthy();
    expect(getByText('Plan your week')).toBeTruthy();
    expect(queryByTestId('your-week')).toBeNull();
    fireEvent.press(getByTestId('your-week-plan'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Gremly',
      params: expect.objectContaining({ thread: 'today', step: 'week' }),
    });
  });

  it('says a week planned once and being planned again is just that, not a week still to plan', async () => {
    // the plan from its first go is still kept on the week
    rows[MON] = done({ status: 'started', completed_at: null });
    const { getByText, getByTestId, queryByText } = await open();
    expect(
      getByText("You're planning this week again. Finish it in today's chat and it will be here."),
    ).toBeTruthy();
    expect(queryByText("This week isn't planned yet.")).toBeNull();
    expect(getByText('Carry on planning')).toBeTruthy();
    fireEvent.press(getByTestId('your-week-plan'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Gremly',
      params: expect.objectContaining({ thread: 'today', step: 'week' }),
    });
  });

  it('says so when the week could not be read, and reads it again on Try again', async () => {
    (getWeekSettings as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByTestId } = await open();
    expect(getByText("I couldn't read your week just now. Try again in a moment.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('your-week-retry'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(getByTestId('your-week')).toBeTruthy();
  });
});

describe('the ways on from the screen', () => {
  it('opens the conversation the review happened in: that day’s thread', async () => {
    const { getByTestId } = await open();
    fireEvent.press(getByTestId('your-week-conversation'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Gremly',
      params: expect.objectContaining({ mode: 'chat', thread: 'day', day: SUN }),
    });
  });

  it('opens today’s thread when the review was finished today', async () => {
    rows[MON] = done({ completed_at: `${WED}T09:00:00` });
    const { getByTestId } = await open();
    fireEvent.press(getByTestId('your-week-conversation'));
    const params = mockNavigate.mock.calls[0][1].params;
    expect(params).toMatchObject({ mode: 'chat', thread: 'today' });
    expect(params.step).toBeUndefined();
  });

  it('offers to plan the rest again out of their weekly window, while the week’s extra is free', async () => {
    const free = await open();
    expect(free.getByText('Plan the rest of it again')).toBeTruthy();
    fireEvent.press(free.getByTestId('your-week-plan-more'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Gremly',
      params: expect.objectContaining({ thread: 'today', step: 'week' }),
    });
    free.unmount();
    // the extra is used: the week was already planned again
    rows[MON] = done({ kind: 'extra' });
    const used = await open();
    expect(used.queryByTestId('your-week-plan-more')).toBeNull();
    used.unmount();
    // inside their weekly window (Monday) there is nothing more to offer
    rows[MON] = done();
    const inWindow = await open(5);
    expect(inWindow.queryByTestId('your-week-plan-more')).toBeNull();
  });

  it('offers next week early the day before their weekly day, unless it is planned', async () => {
    const early = await open(10);
    expect(early.getByText('Plan next week')).toBeTruthy();
    early.unmount();
    rows['2026-10-12'] = done({ id: 'row-2', week_start: '2026-10-12' });
    const planned = await open(10);
    expect(planned.queryByTestId('your-week-plan-more')).toBeNull();
  });
});

describe('changing the week by hand', () => {
  it('opens the board from today, saves their moves on Done, and can take them back', async () => {
    const undo = jest.fn(async () => undefined);
    mockSaveChange.mockResolvedValue({ todos: 1, later: 0, habitDays: 0, undo });
    const { getByTestId, getByText, getAllByText, queryByTestId } = await open();
    expect(queryByTestId('week-board')).toBeNull();
    fireEvent.press(getByTestId('your-week-change'));
    // the board says what it is for here: the button's words are its title too
    expect(getByTestId('week-board')).toBeTruthy();
    expect(getAllByText('Change your week')).toHaveLength(2);
    // the days left in the week, from today
    expect(queryByTestId(`week-board-day-${MON}`)).toBeNull();
    expect(getByTestId(`week-board-day-${WED}`)).toBeTruthy();
    fireEvent.press(getByTestId('week-board-todo-boiler'));
    fireEvent.press(getByTestId(`week-move-${FRI}`));
    await act(async () => {
      fireEvent.press(getByTestId('week-board-done'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    const [row, board, moves] = mockSaveChange.mock.calls[0];
    expect(row.id).toBe('row-1');
    expect(moves.placed).toEqual({ boiler: FRI });
    expect(board.days.find((d: any) => d.day === FRI).todos.map((t: any) => t.id)).toEqual([
      'boiler',
    ]);
    expect(queryByTestId('week-board')).toBeNull();
    expect(getByText('Saved. Your week is changed.')).toBeTruthy();
    // the board looked at again and left: what was saved can still be taken back
    fireEvent.press(getByTestId('your-week-change'));
    fireEvent.press(getByTestId('week-board-close'));
    expect(getByText('Saved. Your week is changed.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('your-week-undo'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(getByText('Taken back. Your week is as it was.')).toBeTruthy();
    expect(queryByTestId('your-week-undo')).toBeNull();
  });

  it('saves nothing and says nothing when the board is closed without a move', async () => {
    const { getByTestId, queryByTestId } = await open();
    fireEvent.press(getByTestId('your-week-change'));
    await act(async () => {
      fireEvent.press(getByTestId('week-board-done'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(mockSaveChange).toHaveBeenCalledTimes(1);
    expect(queryByTestId('week-board')).toBeNull();
    expect(queryByTestId('your-week-notice')).toBeNull();
  });

  it('lets go of their moves when the board is left without finishing', async () => {
    const { getByTestId, queryByTestId } = await open();
    fireEvent.press(getByTestId('your-week-change'));
    fireEvent.press(getByTestId('week-board-todo-boiler'));
    fireEvent.press(getByTestId(`week-move-${THU}`));
    fireEvent.press(getByTestId('week-board-close'));
    expect(queryByTestId('week-board')).toBeNull();
    expect(mockSaveChange).not.toHaveBeenCalled();
    // opened again, the boiler is back on its saved day
    fireEvent.press(getByTestId('your-week-change'));
    expect(getByTestId('week-board-todo-boiler')).toBeTruthy();
  });

  it('says so when the change could not be saved, and keeps their moves for another try', async () => {
    mockSaveChange.mockRejectedValueOnce(new Error("1 of the week's changes could not be saved."));
    const { getByTestId, getByText, queryByTestId } = await open();
    fireEvent.press(getByTestId('your-week-change'));
    fireEvent.press(getByTestId('week-board-todo-boiler'));
    fireEvent.press(getByTestId(`week-move-${FRI}`));
    await act(async () => {
      fireEvent.press(getByTestId('week-board-done'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(
      getByText("I couldn't save all of that, so nothing is changed. Try it again."),
    ).toBeTruthy();
    expect(queryByTestId('your-week-undo')).toBeNull();
    fireEvent.press(getByTestId('your-week-change'));
    // a notice with nothing to take back has been read once the board is opened again
    expect(queryByTestId('your-week-notice')).toBeNull();
    fireEvent.press(getByTestId(`week-board-day-${FRI}`));
    expect(getByTestId('week-board-todo-boiler')).toBeTruthy();
  });

  it('keeps the Undo when part of it could not be taken back', async () => {
    const undo = jest.fn(async () => {
      throw new Error("1 of the week's changes could not be put back.");
    });
    mockSaveChange.mockResolvedValue({ todos: 1, later: 0, habitDays: 0, undo });
    const { getByTestId, getByText } = await open();
    fireEvent.press(getByTestId('your-week-change'));
    fireEvent.press(getByTestId('week-board-todo-boiler'));
    fireEvent.press(getByTestId(`week-move-${FRI}`));
    await act(async () => {
      fireEvent.press(getByTestId('week-board-done'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(getByTestId('your-week-undo'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(getByText("I couldn't take all of that back. Have a look at your week.")).toBeTruthy();
    expect(getByTestId('your-week-undo')).toBeTruthy();
  });
});
