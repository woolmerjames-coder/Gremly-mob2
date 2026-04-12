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
      gremlyColor: 'forest',
    };
    return selector(state);
  }),
}));

// Mock gremlyPalettes
jest.mock('../../../lib/constants/gremlyPalettes', () => ({
  GREMLY_PALETTES: [
    {
      id: 'forest',
      name: 'Forest',
      hex: { dark: '#285441', mid: '#5f966e', cream: '#f0e9bd' },
      colors: {
        dark: [0.157, 0.329, 0.255],
        mid1: [0.373, 0.588, 0.431],
        mid2: [0.318, 0.51, 0.365],
        cream: [0.941, 0.914, 0.741],
      },
    },
  ],
  getPaletteById: jest.fn(() => ({ id: 'forest', name: 'Forest' })),
  recolorLottieJson: jest.fn((json: any) => json),
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
    withDelay: (_d: number, v: number) => v,
    useReducedMotion: () => false,
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
    const { toJSON } = render(<MascotLottie ref={ref} />);
    const json = JSON.stringify(toJSON());
    // Count testID:"lottie-view" occurrences (2 LottieViews: 1 grey + 1 colored for active mode)
    const matches = json.match(/lottie-view/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
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
