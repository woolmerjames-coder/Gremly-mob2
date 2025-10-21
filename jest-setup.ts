// Set up environment variables for tests
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890';
process.env.JEST_REDUCED_MOTION = '1'; // Force reduced motion in all tests to avoid animation timers
process.env.JEST_WORKAROUND = '1'; // Enable test-only elements in production code
process.env.JEST_TODAY_LIGHT = process.env.JEST_TODAY_LIGHT ?? '0';

// JSDOM lacks ResizeObserver in some RN libs; provide a stub if accessed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).ResizeObserver =
  (global as any).ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

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

// Mock Reanimated with minimal implementation
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');

  return {
    default: {
      View: View, // Use React Native's View for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createAnimatedComponent: (Component: any) => Component,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useSharedValue: jest.fn(() => ({ value: 0 })),
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
