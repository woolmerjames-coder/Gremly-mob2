/**
 * Test Utilities - renderWithProviders
 *
 * Comprehensive test helper that wraps components with all app providers:
 * - Navigation (mocked Stack/Tab navigators)
 * - Theme/Tokens
 * - Auth/Repo/Cortex
 * - DsToggle
 * - SafeArea
 * - ActionSheet
 * - GestureHandler
 */

import React, { PropsWithChildren, ReactElement } from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SheetProvider } from 'react-native-actions-sheet';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { AuthProvider } from '../../providers/AuthProvider';
import { RepoProvider } from '../../providers/RepoProvider';
import { CortexProvider } from '../../providers/CortexProvider';
import { DsToggleProvider } from '../../providers/DsToggleProvider';

/**
 * Assert provider is valid and return it or a passthrough stub
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assertProvider = (name: string, Comp: any): React.ComponentType<any> => {
  if (!Comp || (typeof Comp !== 'function' && typeof Comp !== 'object')) {
    // eslint-disable-next-line no-console
    console.warn(`[TEST] Provider missing or invalid: ${name}`, Comp);
    // return a no-op passthrough to keep tests running
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ children }: any) => <>{children}</>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Comp as React.ComponentType<any>;
};

/**
 * Mock navigation functions
 */
export const mockNavigate = jest.fn();
export const mockGoBack = jest.fn();
export const mockSetOptions = jest.fn();
export const mockAddListener = jest.fn(() => jest.fn());

// Mock navigation and route hooks before any tests
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: mockSetOptions,
      addListener: mockAddListener,
      removeListener: jest.fn(),
      dispatch: jest.fn(),
      reset: jest.fn(),
      isFocused: jest.fn(() => true),
      canGoBack: jest.fn(() => false),
      getId: jest.fn(() => 'test-id'),
      getParent: jest.fn(),
      getState: jest.fn(() => ({ routes: [], index: 0 })),
    }),
    useRoute: () => ({
      key: 'test-route',
      name: 'Test',
      params: {},
    }),
    useFocusEffect: jest.fn((callback) => {
      callback();
    }),
  };
});

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Whether to include navigation wrapper (default: true) */
  includeNavigation?: boolean;
}

// Validate providers once at module level
const Gesture = assertProvider('GestureHandlerRootView', GestureHandlerRootView);
const Safe = assertProvider('SafeAreaProvider', SafeAreaProvider);
const Sheets = assertProvider('SheetProvider', SheetProvider);
const DsToggle = assertProvider('DsToggleProvider', DsToggleProvider);
const Theme = assertProvider('ThemeProvider', ThemeProvider);
const Auth = assertProvider('AuthProvider', AuthProvider);
const Repo = assertProvider('RepoProvider', RepoProvider);
const Cortex = assertProvider('CortexProvider', CortexProvider);
const Nav = assertProvider('NavigationContainer', NavigationContainer);

function AllProviders({
  children,
  includeNavigation = true,
}: PropsWithChildren<{ includeNavigation?: boolean }>) {
  const content = includeNavigation ? <Nav>{children}</Nav> : children;

  return (
    <Gesture style={{ flex: 1 }}>
      <Safe
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 812 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <Sheets>
          <DsToggle>
            <Theme>
              <Auth>
                <Repo>
                  <Cortex>{content}</Cortex>
                </Repo>
              </Auth>
            </Theme>
          </DsToggle>
        </Sheets>
      </Safe>
    </Gesture>
  );
}

/**
 * Render component with all app providers
 *
 * @example
 * ```tsx
 * renderWithProviders(<TodayScreen />);
 * expect(screen.getByTestId('today-screen')).toBeTruthy();
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  { includeNavigation = true, ...options }: RenderWithProvidersOptions = {},
) {
  // Clear mock calls before each render
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockSetOptions.mockClear();

  function Wrapper({ children }: PropsWithChildren) {
    return <AllProviders includeNavigation={includeNavigation}>{children}</AllProviders>;
  }

  return {
    ...rtlRender(ui, { wrapper: Wrapper, ...options }),
    mockNavigate,
    mockGoBack,
    mockSetOptions,
  };
}

// Re-export everything from React Native Testing Library for convenience
export * from '@testing-library/react-native';
export { renderWithProviders as render };
