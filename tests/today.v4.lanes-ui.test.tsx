import React from 'react';
import { format } from 'date-fns';
import { renderWithProviders, screen, fireEvent, waitFor } from './utils/renderWithProviders';
import TodayV4LanesView from '../app/tabs/TodayV4LanesView';
import { useTodayData } from '../selectors/today/useTodayData';

jest.mock('../selectors/today/useTodayData', () => ({
  useTodayData: jest.fn(),
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View {...props}>{children}</View>
    ),
  };
});

const mockUndoCompletion = jest.fn();
const mockGetById = jest.fn();
const mockOpenEdit = jest.fn();

jest.mock('../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({
    user: { user_metadata: { first_name: 'Avery' } },
  }),
}));

jest.mock('../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    undoCompletion: mockUndoCompletion,
    getById: mockGetById,
  }),
}));

jest.mock('../hooks/useUnifiedOverlayController', () => ({
  __esModule: true,
  useUnifiedOverlayController: () => ({
    openEdit: mockOpenEdit,
  }),
}));

const mockedUseTodayData = useTodayData as jest.MockedFunction<typeof useTodayData>;

const fixedDate = new Date('2025-10-30T12:00:00.000Z');
const RealDate = Date;
const leftItem = {
  id: 'todo-1',
  kind: 'todo' as const,
  title: 'Plan demo',
  completed: false,
};
const rightItem = {
  id: 'habit-1',
  kind: 'habit' as const,
  title: 'Daily stretch',
  completed: true,
  cadence: 'daily' as const,
  targetPerDay: 1,
  todayCount: 1,
};

let mockCompleteItem: jest.Mock;

beforeEach(() => {
  // Mock Date to ensure deterministic formatting
  class MockDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(fixedDate.getTime());
        return;
      }
      super(...(args as ConstructorParameters<typeof RealDate>));
    }
  }
  MockDate.now = () => fixedDate.getTime();
  global.Date = MockDate as typeof Date;

  mockCompleteItem = jest.fn();
  mockUndoCompletion.mockReset();
  mockGetById.mockResolvedValue(null);
  mockOpenEdit.mockReset();

  const reanimated = require('react-native-reanimated');
  // useSharedValue already mocked globally in jest-setup.ts
  (reanimated.useAnimatedStyle as jest.Mock).mockImplementation((fn: () => unknown) =>
    typeof fn === 'function' ? fn() : {},
  );

  const haptics = require('expo-haptics');
  (haptics.selectionAsync as jest.Mock).mockResolvedValue(undefined);

  mockedUseTodayData.mockReturnValue({
    items: [leftItem, rightItem],
    left: [leftItem],
    right: [rightItem],
    loading: false,
    progress: 0.5,
    completeItem: mockCompleteItem,
    refresh: jest.fn(),
  });
});

afterEach(() => {
  global.Date = RealDate;
  jest.clearAllMocks();
});

test('renders greeting, formatted date, and lane headers', () => {
  // Sanity check component definition
  expect(typeof TodayV4LanesView).toBe('function');

  renderWithProviders(<TodayV4LanesView />);

  expect(screen.getByText(/Hi, Avery/i)).toBeTruthy();

  const formattedDate = format(fixedDate, 'EEEE, MMMM do');
  expect(screen.getByText(formattedDate)).toBeTruthy();

  expect(screen.getByText(/In Progress/i)).toBeTruthy();
  expect(screen.getByText(/Done/i)).toBeTruthy();

  expect(screen.getByText(/Plan demo/i)).toBeTruthy();
  expect(screen.getByText(/Daily stretch/i)).toBeTruthy();
});

test('tapping checkboxes completes and undoes items', async () => {
  mockUndoCompletion.mockResolvedValue(undefined);

  renderWithProviders(<TodayV4LanesView />);

  fireEvent.press(screen.getByLabelText('Complete item'));
  expect(mockCompleteItem).toHaveBeenCalledWith('todo-1', 'todo');

  fireEvent.press(screen.getByLabelText('Uncomplete item'));

  await waitFor(() => {
    expect(mockUndoCompletion).toHaveBeenCalledWith('habit-1');
  });

  expect(mockCompleteItem).not.toHaveBeenCalledWith('habit-1', 'habit');
});
