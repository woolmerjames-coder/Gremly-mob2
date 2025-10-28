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

import React, { PropsWithChildren, ReactElement, createContext, useContext } from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SheetProvider } from 'react-native-actions-sheet';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { DsToggleProvider } from '../../providers/DsToggleProvider';
import { OverlayProvider } from '../../contexts/OverlayContext';
import type { IRepo } from '../../lib/repo/IRepo';
import type { User } from '@supabase/supabase-js';
import type { ICortexEngine } from '../../cortex/ICortexEngine';
import type { AppRecord, Space, Tag, Person } from '../../lib/types';

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

// ============================================================================
// Mock Contexts and Providers
// ============================================================================

// Auth Context
interface AuthContextValue {
  user: User | null;
  userId: string | null;
  session: any | null;
  loading: boolean;
  error: string | null;
  signInWithEmail: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Repo Context
const RepoContext = createContext<IRepo | null>(null);

// Cortex Context
const CortexContext = createContext<ICortexEngine | null>(null);

// ============================================================================
// Mock Factory Functions
// ============================================================================

/**
 * Creates a mock user for testing
 */
export const makeMockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'test-user-1',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  }) as User;

/**
 * Creates a mock repository with default implementations
 */
export const makeMockRepo = (overrides: Partial<IRepo> = {}): IRepo => {
  console.log('[TEST] Initializing mock repository with overrides:', overrides);
  const defaultEmptyArray = jest.fn().mockResolvedValue([]);
  const defaultNull = jest.fn().mockResolvedValue(null);
  const defaultVoid = jest.fn().mockResolvedValue(undefined);
  const defaultZero = jest.fn().mockResolvedValue(0);

  return {
    // CRUD operations
    create: jest.fn().mockResolvedValue({
      id: 'mock-id',
      type: 'todo',
      title: 'Mock Todo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as AppRecord),
    update: jest.fn().mockResolvedValue({
      id: 'mock-id',
      type: 'todo',
      title: 'Updated Mock Todo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as AppRecord),
    remove: defaultVoid,
    getById: defaultNull,
    listByType: defaultEmptyArray,
    listBySpace: defaultEmptyArray,
    search: defaultEmptyArray,
    countUnsorted: defaultZero,
    listDueToday: defaultEmptyArray,
    listUndefinedDue: defaultEmptyArray,
    countPlannedToday: defaultZero,
    countCompletedToday: defaultZero,
    completeHabit: defaultVoid,
    completeTodo: defaultVoid,
    undoCompletion: defaultVoid,
    listSpaces: defaultEmptyArray,
    createSpace: jest.fn().mockResolvedValue({
      id: 'mock-space-id',
      name: 'Mock Space',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as Space),
    getSpaceById: defaultNull,
    updateSpace: jest.fn().mockResolvedValue({
      id: 'mock-space-id',
      name: 'Updated Mock Space',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as Space),
    deleteSpace: defaultVoid,
    listBySpaceGrouped: jest.fn().mockResolvedValue({
      habits: [],
      todos: [],
      notes: [],
    }),
    getSpaceSummary: defaultNull,
    listTags: defaultEmptyArray,
    listPeople: defaultEmptyArray,
    createPerson: jest.fn().mockResolvedValue({
      id: 'mock-person-id',
      display_name: 'Mock Person',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as Person),
    updatePerson: jest.fn().mockResolvedValue({
      id: 'mock-person-id',
      display_name: 'Updated Mock Person',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as Person),
    deletePerson: defaultVoid,
    listLinkedTags: defaultEmptyArray,
    listLinkedPeople: defaultEmptyArray,
    upsertTag: jest.fn().mockResolvedValue({
      id: 'mock-tag-id',
      name: 'Mock Tag',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    } as Tag),
    listItemTags: defaultEmptyArray,
    linkTag: jest.fn().mockResolvedValue({
      id: 'mock-tagmap-id',
      item_id: 'item-1',
      tag_id: 'tag-1',
      item_type: 'todo',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    }),
    unlinkTag: defaultVoid,
    listLinkedPeopleByItem: defaultEmptyArray,
    linkPerson: jest.fn().mockResolvedValue({
      id: 'mock-entityperson-id',
      item_id: 'item-1',
      item_type: 'todo',
      person_id: 'person-1',
      created_at: new Date().toISOString(),
      owner_id: 'test-user-1',
    }),
    unlinkPerson: defaultVoid,
    inviteBuddy: defaultVoid,
    acceptBuddy: defaultVoid,
    nudgeBuddy: defaultVoid,
    unlinkBuddy: defaultVoid,
    ...overrides,
  } as IRepo;
};

/**
 * Creates a mock Cortex engine for testing
 */
export const makeMockCortex = (): ICortexEngine =>
  ({
    parseInbox: jest.fn().mockResolvedValue({
      todos: [],
      habits: [],
      notes: [],
    }),
    suggestTasks: jest.fn().mockResolvedValue([]),
    analyzeHabit: jest.fn().mockResolvedValue({
      insights: [],
      suggestions: [],
    }),
  }) as any;

// Mock Auth Provider
const MockAuthProvider: React.FC<PropsWithChildren<{ value: AuthContextValue }>> = ({
  children,
  value,
}) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

// Ensure the MockRepoProvider is properly initialized
const MockRepoProvider: React.FC<PropsWithChildren<{ value: IRepo }>> = ({ children, value }) => {
  if (!value) {
    console.warn('[TEST] MockRepoProvider received an undefined value. Defaulting to MemoryRepo.');
    value = makeMockRepo();
  }
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
};

// Mock Cortex Provider
const MockCortexProvider: React.FC<PropsWithChildren<{ value: ICortexEngine }>> = ({
  children,
  value,
}) => <CortexContext.Provider value={value}>{children}</CortexContext.Provider>;

// Export hook for tests to use
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const useRepo = () => {
  const context = useContext(RepoContext);
  if (!context) throw new Error('useRepo must be used within RepoProvider');
  return context;
};

export const useCortex = () => {
  const context = useContext(CortexContext);
  if (!context) throw new Error('useCortex must be used within CortexProvider');
  return context;
};

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Whether to include navigation wrapper (default: true) */
  includeNavigation?: boolean;
  /** Mock user (null for unauthenticated, undefined for default mock user) */
  user?: Partial<User> | null;
  /** Mock repo method overrides */
  repo?: Partial<IRepo>;
  /** Theme mode */
  theme?: 'light' | 'dark';
}

// Validate providers once at module level
const Gesture = assertProvider('GestureHandlerRootView', GestureHandlerRootView);
const Safe = assertProvider('SafeAreaProvider', SafeAreaProvider);
const Sheets = assertProvider('SheetProvider', SheetProvider);
const DsToggle = assertProvider('DsToggleProvider', DsToggleProvider);
const Theme = assertProvider('ThemeProvider', ThemeProvider);
const Nav = assertProvider('NavigationContainer', NavigationContainer);

function AllProviders({
  children,
  includeNavigation = true,
  user: userOverride,
  repo: repoOverrides = {},
  theme = 'light',
}: PropsWithChildren<{
  includeNavigation?: boolean;
  user?: Partial<User> | null;
  repo?: Partial<IRepo>;
  theme?: 'light' | 'dark';
}>) {
  // Log the repo overrides for debugging
  console.log('[TEST] Repo overrides:', repoOverrides);

  const mockUser = userOverride === null ? null : makeMockUser(userOverride);
  const mockRepo = makeMockRepo(repoOverrides);
  const mockCortex = makeMockCortex();

  const authValue: AuthContextValue = {
    user: mockUser,
    userId: mockUser?.id || null,
    session: mockUser
      ? {
          user: mockUser,
          access_token: 'mock-token',
          refresh_token: 'mock-refresh',
        }
      : null,
    loading: false,
    error: null,
    signInWithEmail: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
    clearError: jest.fn(),
  };

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
            <Theme initialMode={theme}>
              <MockAuthProvider value={authValue}>
                <MockRepoProvider value={mockRepo}>
                  <MockCortexProvider value={mockCortex}>
                    <OverlayProvider>{content}</OverlayProvider>
                  </MockCortexProvider>
                </MockRepoProvider>
              </MockAuthProvider>
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
 * const { mockRepo } = renderWithProviders(<TodayScreen />, {
 *   repo: {
 *     listDueToday: jest.fn().mockResolvedValue([...mockTodos]),
 *   },
 * });
 * expect(screen.getByTestId('today-screen')).toBeTruthy();
 * expect(mockRepo.listDueToday).toHaveBeenCalled();
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  { includeNavigation = true, user, repo, theme, ...options }: RenderWithProvidersOptions = {},
) {
  // Clear mock calls before each render
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockSetOptions.mockClear();

  // Create mocks that will be used
  const mockUser = user === null ? null : makeMockUser(user);
  const mockRepo = makeMockRepo(repo);
  const mockCortex = makeMockCortex();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <AllProviders includeNavigation={includeNavigation} user={user} repo={repo} theme={theme}>
        {children}
      </AllProviders>
    );
  }

  return {
    ...rtlRender(ui, { wrapper: Wrapper, ...options }),
    mockNavigate,
    mockGoBack,
    mockSetOptions,
    mockUser,
    mockRepo,
    mockCortex,
  };
}

// Re-export everything from React Native Testing Library for convenience
export * from '@testing-library/react-native';
export { renderWithProviders as render };
