import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';
import { env } from '../lib/env';

jest.mock('../app/screens/NowScreenV1', () => {
  const { View } = require('react-native');
  const MockComponent: React.FC = () => <View testID="now-v1-screen" />;
  return { __esModule: true, default: MockComponent };
});

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

describe('NOW V1 flag', () => {
  it('renders NowScreenV1 when nowV1 is enabled', () => {
    setTodayFlags({ nowV1: true, v4Lanes: false, v3: false });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('now-v1-screen')).toBeTruthy();
  });

  it('NowScreenV1 takes precedence over v4Lanes when both enabled', () => {
    setTodayFlags({ nowV1: true, v4Lanes: true, v3: false });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('now-v1-screen')).toBeTruthy();
  });

  it('NowScreenV1 takes precedence over v3 when both enabled', () => {
    setTodayFlags({ nowV1: true, v4Lanes: false, v3: true });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('now-v1-screen')).toBeTruthy();
  });
});

describe('NOW V1 flag disabled', () => {
  it('renders TodayV4LanesView when nowV1 is disabled and v4Lanes is enabled', () => {
    setTodayFlags({ nowV1: false, v4Lanes: true, v3: false });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('today-v4-lanes-screen')).toBeTruthy();
  });

  it('renders TodayV3View when nowV1 and v4Lanes are disabled but v3 is enabled', () => {
    setTodayFlags({ nowV1: false, v4Lanes: false, v3: true });

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
  });

  it('falls back to legacy TodayScreenV2 when all flags are disabled', () => {
    setTodayFlags({ nowV1: false, v4Lanes: false, v3: false });

    renderWithProviders(<TodayScreen />);
    // TodayScreenV2 doesn't have a specific testID, but it should render without errors
    // and NOT render any of the flagged screens
    expect(screen.queryByTestId('now-v1-screen')).toBeNull();
    expect(screen.queryByTestId('today-v4-lanes-screen')).toBeNull();
    expect(screen.queryByTestId('today-v3-screen')).toBeNull();
  });
});
