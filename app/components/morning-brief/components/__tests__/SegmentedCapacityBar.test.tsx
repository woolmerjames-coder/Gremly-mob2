/**
 * SegmentedCapacityBar Tests
 *
 * Tests the multi-segment animated bar showing event/todo/habit breakdown.
 *
 * Covers:
 * - Renders without crashing at zero
 * - Label shows only nonzero segments joined with " · "
 * - "Nothing selected" fallback when all are zero
 * - Correct fmt() formatting
 * - Bar track renders at correct height
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.View = require('react-native').View;
  return Reanimated;
});

// Make RN Animated synchronous
(Animated as any).spring = (value: any, config: any) => ({
  start: (cb?: any) => {
    value.setValue(config.toValue);
    cb?.({ finished: true });
  },
  stop: () => {},
});
(Animated as any).parallel = (anims: any[]) => ({
  start: (cb?: any) => {
    anims.forEach((a: any) => a.start());
    cb?.({ finished: true });
  },
  stop: () => {},
});

import { SegmentedCapacityBar } from '../SegmentedCapacityBar';

describe('SegmentedCapacityBar', () => {
  describe('label rendering', () => {
    it('shows "Nothing selected" when all minutes are zero', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={0}
          todoMinutes={0}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('Nothing selected')).toBeTruthy();
    });

    it('shows only events label when only events have minutes', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={120}
          todoMinutes={0}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('2h events')).toBeTruthy();
    });

    it('shows only todos label when only todos have minutes', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={0}
          todoMinutes={90}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('1h 30m todos')).toBeTruthy();
    });

    it('shows only habits label when only habits have minutes', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={0}
          todoMinutes={0}
          habitMinutes={30}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('30m habits')).toBeTruthy();
    });

    it('shows events and todos joined with " · " when habits are zero', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={60}
          todoMinutes={45}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('1h events · 45m todos')).toBeTruthy();
    });

    it('shows all three segments joined with " · " when all nonzero', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={120}
          todoMinutes={90}
          habitMinutes={30}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('2h events · 1h 30m todos · 30m habits')).toBeTruthy();
    });
  });

  describe('fmt helper', () => {
    it('formats minutes-only correctly', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={45}
          todoMinutes={0}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('45m events')).toBeTruthy();
    });

    it('formats hours-only correctly (exact hour)', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={180}
          todoMinutes={0}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('3h events')).toBeTruthy();
    });

    it('formats hours+minutes correctly', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={0}
          todoMinutes={150}
          habitMinutes={0}
          totalDayMinutes={480}
        />,
      );
      expect(getByText('2h 30m todos')).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('renders without crashing with all zeros', () => {
      const { toJSON } = render(
        <SegmentedCapacityBar
          eventMinutes={0}
          todoMinutes={0}
          habitMinutes={0}
          totalDayMinutes={0}
        />,
      );
      expect(toJSON()).not.toBeNull();
    });

    it('handles totalDayMinutes of zero without division error', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={60}
          todoMinutes={30}
          habitMinutes={0}
          totalDayMinutes={0}
        />,
      );
      // Should still render labels
      expect(getByText('1h events · 30m todos')).toBeTruthy();
    });

    it('handles very large values', () => {
      const { getByText } = render(
        <SegmentedCapacityBar
          eventMinutes={600}
          todoMinutes={300}
          habitMinutes={120}
          totalDayMinutes={1020}
        />,
      );
      expect(getByText('10h events · 5h todos · 2h habits')).toBeTruthy();
    });
  });
});
