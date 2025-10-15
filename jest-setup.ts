// Mock Reanimated with minimal implementation
jest.mock('react-native-reanimated', () => ({
  default: {
    call: jest.fn(),
  },
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn((fn) => fn()),
  withTiming: jest.fn((value) => value),
  withSpring: jest.fn((value) => value),
  withDecay: jest.fn((value) => value),
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    quad: jest.fn(),
    cubic: jest.fn(),
  },
}));
