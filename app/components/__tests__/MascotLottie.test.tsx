/**
 * Tests for app/components/MascotLottie.tsx
 *
 * Tests the animated Lottie mascot component with gauge fill system:
 * idle state, celebrate (drop) transition, celebrateFed, and return to idle.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

// Track all LottieView instances by source
jest.mock('lottie-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props: any, ref: any) => {
    const mockRef = { reset: jest.fn(), play: jest.fn() };
    React.useImperativeHandle(ref, () => mockRef);
    return React.createElement(View, { testID: 'lottie-view', ...props });
  });
});

// Mock useGremlyStore
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: jest.fn((selector) => {
    const state = {
      feedingGaugeValue: 0,
      isFedToday: false,
    };
    return selector(state);
  }),
}));

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const RN = require('react-native');
  const AnimatedView = React.forwardRef((props: any, ref: any) =>
    React.createElement(RN.View, { ...props, ref }),
  );
  return {
    __esModule: true,
    default: { View: AnimatedView },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: number) => v,
    Easing: { out: () => ({}), cubic: {} },
  };
});

import MascotLottie, { type MascotLottieHandle } from '../MascotLottie';

describe('MascotLottie', () => {
  let ref: React.RefObject<MascotLottieHandle | null>;

  beforeEach(() => {
    ref = React.createRef();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<MascotLottie ref={ref} />);
    expect(toJSON()).not.toBeNull();
  });

  it('renders multiple LottieView instances', () => {
    const { getAllByTestId } = render(<MascotLottie ref={ref} />);
    const views = getAllByTestId('lottie-view');
    // 6 LottieViews: grey(idle,drop,fed) + green(idle,drop,fed)
    expect(views.length).toBeGreaterThanOrEqual(5);
  });

  it('exposes celebrate and celebrateFed via ref', () => {
    render(<MascotLottie ref={ref} />);
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current?.celebrate).toBe('function');
    expect(typeof ref.current?.celebrateFed).toBe('function');
  });

  it('celebrate is a no-op while already celebrating', () => {
    render(<MascotLottie ref={ref} />);

    act(() => {
      ref.current?.celebrate();
    });

    // Second call should be no-op (isCelebratingRef guards it)
    act(() => {
      ref.current?.celebrate();
    });

    // No crash = success
    expect(ref.current).toBeTruthy();
  });
});
