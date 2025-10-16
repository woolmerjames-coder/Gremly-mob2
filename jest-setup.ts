// Mock Reanimated with minimal implementation
jest.mock('react-native-reanimated', () => ({
  default: {
    call: jest.fn(),
  },
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn((fn) => (typeof fn === 'function' ? fn() : {})),
  withTiming: jest.fn((value) => value),
  withSpring: jest.fn((value) => value),
  withDecay: jest.fn((value) => value),
  createAnimatedComponent: jest.fn((Component) => Component),
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    quad: jest.fn(),
    cubic: jest.fn(),
  },
}));

// Mock actions sheet globally to avoid pulling in gesture-handler/reanimated internals during tests
jest.mock('react-native-actions-sheet', () => {
  return {
    __esModule: true,
    default: ({ children }: any) => children,
    SheetManager: { show: jest.fn(), hide: jest.fn() },
  };
});
