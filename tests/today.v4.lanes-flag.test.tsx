import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';
import { env } from '../lib/env';

jest.mock('../app/tabs/TodayV4LanesView', () => {
  const { View } = require('react-native');
  const MockComponent: React.FC = () => <View testID="today-v4-lanes-screen" />;
  return { __esModule: true, default: MockComponent };
});

jest.mock('../app/tabs/TodayV3View', () => {
  const { View } = require('react-native');
  const MockComponent: React.FC = () => <View testID="today-v3-screen" />;
  return { __esModule: true, default: MockComponent };
});

jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

type TodayFeatureFlags = typeof env.feature.today;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const originalTodayFlags: Mutable<TodayFeatureFlags> = { ...env.feature.today };
const mutableTodayFlags = env.feature.today as unknown as Mutable<TodayFeatureFlags>;

const setTodayFlags = (overrides: Partial<Mutable<TodayFeatureFlags>>) => {
  Object.assign(mutableTodayFlags, overrides);
};

afterEach(() => {
  Object.assign(mutableTodayFlags, originalTodayFlags);
});

describe('Today V4 Lanes flag', () => {
  it('renders TodayV4LanesView when v4Lanes is enabled', () => {
    setTodayFlags({ v4Lanes: true, v3: false });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('today-v4-lanes-screen')).toBeTruthy();
  });
});

describe('Today V3 fallback when v4Lanes is disabled', () => {
  it('renders TodayV3View when v4Lanes is disabled and v3 is enabled', () => {
    setTodayFlags({ v4Lanes: false, v3: true });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
  });
});
