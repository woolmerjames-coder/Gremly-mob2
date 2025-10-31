import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayV4LanesView from '../app/tabs/TodayV4LanesView';
import { useTodayData } from '../selectors/today/useTodayData';

jest.mock('../selectors/today/useTodayData', () => ({
  useTodayData: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => ({
    user: { user_metadata: { first_name: 'Avery' } },
  }),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => ({
    undoCompletion: jest.fn(),
    getById: jest.fn(),
  }),
}));

jest.mock('../hooks/useUnifiedOverlayController', () => ({
  ...jest.requireActual('../hooks/useUnifiedOverlayController'),
  useUnifiedOverlayController: () => ({
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    openView: jest.fn(),
  }),
}));

const mockedUseTodayData = useTodayData as jest.MockedFunction<typeof useTodayData>;

beforeEach(() => {
  const reanimated = require('react-native-reanimated');
  (reanimated.useSharedValue as jest.Mock).mockImplementation(() => ({ value: 0 }));
  (reanimated.useAnimatedStyle as jest.Mock).mockImplementation((fn: () => unknown) =>
    typeof fn === 'function' ? fn() : {},
  );

  mockedUseTodayData.mockReturnValue({
    left: [],
    right: [],
    items: [],
    loading: false,
    progress: 0.5,
    completeItem: jest.fn(),
    refresh: jest.fn(),
  } as any);
});

test('renders gradient progress strip', () => {
  renderWithProviders(<TodayV4LanesView />);
  expect(screen.getByTestId('today-v4-lanes-screen')).toBeTruthy();
});
