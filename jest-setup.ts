// Set up environment variables for tests
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890';
process.env.JEST_REDUCED_MOTION = '1'; // Force reduced motion in all tests to avoid animation timers
process.env.JEST_WORKAROUND = '1'; // Enable test-only elements in production code
process.env.JEST_TODAY_LIGHT = process.env.JEST_TODAY_LIGHT ?? '0';

// JSDOM lacks ResizeObserver in some RN libs; provide a stub if accessed
/* eslint-disable @typescript-eslint/no-explicit-any */
(global as any).ResizeObserver =
  (global as any).ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
/* eslint-enable @typescript-eslint/no-explicit-any */

// Ensure requestAnimationFrame exists and is synchronous in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = setTimeout(cb, 0);
  return id as unknown as number;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);

// Use real timers by default (tests can override with jest.useFakeTimers() if needed)
jest.useRealTimers();

// Mock Supabase client globally to avoid channel subscription errors
jest.mock('./lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn().mockResolvedValue({ error: null }),
    })),
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

// Mock Reanimated with minimal implementation
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native');
  const { View } = RN;

  // Mock animation builder chain - must return self for method chaining
  // Using arrow functions instead of jest.fn() to avoid being reset by resetMocks: true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockAnimation = (): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mock: any = {};
    mock.duration = () => mock;
    mock.springify = () => mock;
    mock.mass = () => mock;
    mock.delay = () => mock;
    mock.withInitialValues = () => mock;
    mock.easing = () => mock;
    mock.damping = () => mock;
    mock.stiffness = () => mock;
    return mock;
  };

  return {
    __esModule: true,
    default: {
      View: View, // Use React Native's View for testing
      Text: RN.Text, // Use React Native's Text for testing
      createAnimatedComponent: (Component: unknown) => Component,
    },
    // Animated.View should be a regular View in tests
    Animated: {
      View: View,
      Text: RN.Text,
      ScrollView: RN.ScrollView,
    },
    // Animation entering/exiting helpers
    FadeIn: createMockAnimation(),
    FadeOut: createMockAnimation(),
    SlideInLeft: createMockAnimation(),
    SlideInRight: createMockAnimation(),
    SlideInUp: createMockAnimation(),
    SlideInDown: createMockAnimation(),
    SlideOutLeft: createMockAnimation(),
    SlideOutRight: createMockAnimation(),
    SlideOutUp: createMockAnimation(),
    SlideOutDown: createMockAnimation(),
    ZoomIn: createMockAnimation(),
    ZoomOut: createMockAnimation(),
    // Layout animation - use chainable mock like animations
    Layout: createMockAnimation(),
    // useSharedValue returns a mutable shared value object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useSharedValue: (initialValue: any) => {
      return { value: initialValue ?? 0 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAnimatedStyle: jest.fn((fn: any) => (typeof fn === 'function' ? fn() : {})),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTiming: jest.fn((value: any) => value),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withSpring: jest.fn((value: any) => value),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDecay: jest.fn((value: any) => value),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDelay: jest.fn((_delay: any, value: any) => value),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withRepeat: jest.fn((value: any) => value),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withSequence: jest.fn((...values: any[]) => values[values.length - 1]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cancelAnimation: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createAnimatedComponent: jest.fn((Component: any) => Component),
    useReducedMotion: jest.fn(() => true), // Always return true in tests to skip animations
    Easing: (() => {
      const identity = (value: number) => value;
      const ensureFn = (fn: unknown) => (typeof fn === 'function' ? fn : identity);

      return {
        // Base easing curves
        linear: identity,
        ease: identity,
        quad: identity,
        cubic: identity,
        // Transformers mirroring the public API surface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        in: jest.fn((fn: any) => ensureFn(fn)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        out: jest.fn((fn: any) => ensureFn(fn)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inOut: jest.fn((fn: any) => ensureFn(fn)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        back: jest.fn(() => identity),
      };
    })(),
  };
});

// Note: design/animations mock is set up via moduleNameMapper in jest.config.js

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({
      cancelled: true,
      assets: [],
    }),
  ),
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({
      cancelled: true,
      assets: [],
    }),
  ),
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' }),
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' }),
  ),
  MediaTypeOptions: {
    All: 'All',
    Videos: 'Videos',
    Images: 'Images',
  },
}));

// Mock expo-apple-authentication
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(() =>
    Promise.resolve({
      user: 'mock-user-id',
      email: 'mock@email.com',
      fullName: { givenName: 'Mock', familyName: 'User' },
      identityToken: 'mock-identity-token',
      authorizationCode: 'mock-auth-code',
    }),
  ),
  getCredentialStateAsync: jest.fn(() => Promise.resolve(1)), // AppleAuthenticationCredentialState.AUTHORIZED
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
}));

// Mock actions sheet globally to avoid pulling in gesture-handler/reanimated internals during tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock('react-native-actions-sheet', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children }: any) => children,
  SheetManager: { show: jest.fn(), hide: jest.fn() },
  registerSheet: jest.fn(),
}));

// Mock uuid for deterministic IDs in tests
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-safe-area-context to avoid requiring SafeAreaProvider in every test
// Provide both SafeAreaProvider and SafeAreaView as simple passthroughs
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');

  return {
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SafeAreaProvider: (props: any) => React.createElement(View, props, props.children),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SafeAreaView: (props: any) => {
      const { children, ...rest } = props || {};
      return React.createElement(View, rest, children);
    },
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Default overlay controller mock keeps tests isolated from navigation
jest.mock('./hooks/useOverlayController', () => {
  const controller = {
    state: { visible: false, mode: 'create', initialEntity: null, initialSpaceId: null },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
  };
  return {
    useOverlayController: () => controller,
  };
});

// Provide a no-op global overlay context in tests so callers don't need the provider
jest.mock('./contexts/OverlayContext', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const contextValue = {
    state: {
      visible: false,
      mode: 'create',
      initialEntity: undefined,
      initialSpaceId: undefined,
      initialText: undefined,
    },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  };

  return {
    __esModule: true,
    OverlayProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useGlobalOverlay: () => contextValue,
  };
});

// Note: If RN Animated internals cause issues, prefer local per-test mocks
// over a global mock of NativeAnimatedHelper, as the module path can vary by RN version.

// Mock react-native-gesture-handler Gesture API for tests
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native');

  // Create a mock gesture builder that supports method chaining
  const createMockGesture = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gesture: any = {
      activeOffsetX: jest.fn(() => gesture),
      activeOffsetY: jest.fn(() => gesture),
      failOffsetX: jest.fn(() => gesture),
      failOffsetY: jest.fn(() => gesture),
      onStart: jest.fn(() => gesture),
      onUpdate: jest.fn(() => gesture),
      onEnd: jest.fn(() => gesture),
      onFinalize: jest.fn(() => gesture),
      withTestId: jest.fn(() => gesture),
      enabled: jest.fn(() => gesture),
      shouldCancelWhenOutside: jest.fn(() => gesture),
      hitSlop: jest.fn(() => gesture),
      simultaneousWithExternalGesture: jest.fn(() => gesture),
      requireExternalGestureToFail: jest.fn(() => gesture),
    };
    return gesture;
  };

  return {
    __esModule: true,
    // GestureDetector just renders its children
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GestureDetector: ({ children }: any) => children,
    // Gesture factory methods
    Gesture: {
      Pan: createMockGesture,
      Tap: createMockGesture,
      LongPress: createMockGesture,
      Pinch: createMockGesture,
      Rotation: createMockGesture,
      Fling: createMockGesture,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Simultaneous: (..._gestures: any[]) => createMockGesture(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Exclusive: (..._gestures: any[]) => createMockGesture(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Race: (..._gestures: any[]) => createMockGesture(),
    },
    // Legacy components (still used in some places)
    PanGestureHandler: RN.View,
    TapGestureHandler: RN.View,
    LongPressGestureHandler: RN.View,
    PinchGestureHandler: RN.View,
    RotationGestureHandler: RN.View,
    FlingGestureHandler: RN.View,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    // State enum
    State: {
      UNDETERMINED: 0,
      FAILED: 1,
      BEGAN: 2,
      CANCELLED: 3,
      ACTIVE: 4,
      END: 5,
    },
    // Directions enum
    Directions: {
      RIGHT: 1,
      LEFT: 2,
      UP: 4,
      DOWN: 8,
    },
    // gestureHandlerRootHOC - just pass through
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gestureHandlerRootHOC: (Component: any) => Component,
    // NativeViewGestureHandler
    NativeViewGestureHandler: RN.View,
  };
});
