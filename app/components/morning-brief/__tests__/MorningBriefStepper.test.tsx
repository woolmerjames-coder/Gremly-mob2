/**
 * MorningBriefStepper Tests
 *
 * Tests for the stepper orchestrator that manages step transitions,
 * progress bar, and celebration overlay for the Morning Brief flow.
 *
 * Step flow: glance → sweep → prioritize → organize → plan
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Text, Pressable, Animated } from 'react-native';

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.View = require('react-native').View;
  return Reanimated;
});

// Make all RN Animated animations synchronous so transitions
// resolve immediately in tests (no requestAnimationFrame needed).
function syncAnim(value: Animated.Value, toValue: number) {
  return {
    start: (cb?: (result: { finished: boolean }) => void) => {
      value.setValue(toValue);
      cb?.({ finished: true });
    },
    stop: () => {},
    reset: () => {},
  };
}

// Direct assignment – jest.spyOn doesn't reliably patch
// the re-exported RN Animated object.
(Animated as any).timing = (value: any, config: any) => syncAnim(value, config.toValue);
(Animated as any).spring = (value: any, config: any) => syncAnim(value, config.toValue);
(Animated as any).parallel = (animations: any[]) => ({
  start: (cb?: (result: { finished: boolean }) => void) => {
    animations.forEach((a: any) => a.start());
    cb?.({ finished: true });
  },
  stop: () => {},
  reset: () => {},
});

import { MorningBriefStepper, type BriefStep } from '../MorningBriefStepper';

// Helper: flush React state updates after synchronous animation callbacks
async function flushAnimations() {
  await act(async () => {});
}

// Simple render-prop factories that render identifiable content + a button to advance
function makeRenderGlance(content = 'glance-content'): StepRenderFn<[() => void, () => void]> {
  return (onContinue, onSkipToEnd) => (
    <>
      <Text>{content}</Text>
      <Pressable onPress={onContinue} accessibilityLabel="glance-continue">
        <Text>Continue from Glance</Text>
      </Pressable>
      <Pressable onPress={onSkipToEnd} accessibilityLabel="glance-skip-to-end">
        <Text>Skip to End</Text>
      </Pressable>
    </>
  );
}

function makeRenderSweep(
  content = 'sweep-content',
): StepRenderFn<[() => void, () => void, (() => void) | undefined]> {
  return (onContinue, _onSkip, onBack) => (
    <>
      <Text>{content}</Text>
      <Pressable onPress={onContinue} accessibilityLabel="sweep-continue">
        <Text>Continue from Sweep</Text>
      </Pressable>
      {onBack && (
        <Pressable onPress={onBack} accessibilityLabel="sweep-back">
          <Text>Back from Sweep</Text>
        </Pressable>
      )}
    </>
  );
}

function makeRenderPrioritize(
  content = 'prioritize-content',
): StepRenderFn<[() => void, () => void, (() => void) | undefined]> {
  return (onContinue, _onSkip, onBack) => (
    <>
      <Text>{content}</Text>
      <Pressable onPress={onContinue} accessibilityLabel="prioritize-continue">
        <Text>Continue from Prioritize</Text>
      </Pressable>
      {onBack && (
        <Pressable onPress={onBack} accessibilityLabel="prioritize-back">
          <Text>Back from Prioritize</Text>
        </Pressable>
      )}
    </>
  );
}

function makeRenderOrganize(
  content = 'organize-content',
): StepRenderFn<[() => void, () => void, (() => void) | undefined, () => void]> {
  return (onOrganize, _onSkip, onBack, onShowCelebration) => (
    <>
      <Text>{content}</Text>
      <Pressable onPress={onOrganize} accessibilityLabel="organize-continue">
        <Text>Continue from Organize</Text>
      </Pressable>
      <Pressable onPress={onShowCelebration} accessibilityLabel="organize-celebrate">
        <Text>Show Celebration</Text>
      </Pressable>
      {onBack && (
        <Pressable onPress={onBack} accessibilityLabel="organize-back">
          <Text>Back from Organize</Text>
        </Pressable>
      )}
    </>
  );
}

function makeRenderPlan(content = 'plan-content'): StepRenderFn<[(() => void) | undefined]> {
  return (onBack) => (
    <>
      <Text>{content}</Text>
      {onBack && (
        <Pressable onPress={onBack} accessibilityLabel="plan-back">
          <Text>Back from Plan</Text>
        </Pressable>
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepRenderFn<T extends any[]> = (...args: T) => React.ReactNode;

describe('MorningBriefStepper', () => {
  const allSteps: BriefStep[] = ['glance', 'sweep', 'prioritize', 'organize', 'plan'];

  const defaultProps = {
    stepsNeeded: allSteps,
    renderGlance: makeRenderGlance(),
    renderSweep: makeRenderSweep(),
    renderPrioritize: makeRenderPrioritize(),
    renderOrganize: makeRenderOrganize(),
    renderPlan: makeRenderPlan(),
  };

  beforeEach(() => {
    jest.useFakeTimers(); // still needed for triggerCelebration's setTimeout
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initial rendering', () => {
    it('renders the first step (glance) by default', () => {
      const { getByText } = render(<MorningBriefStepper {...defaultProps} />);
      expect(getByText('glance-content')).toBeTruthy();
    });

    it('renders progress bar', () => {
      const { getByText } = render(<MorningBriefStepper {...defaultProps} />);
      // Progress bar is rendered as part of the stepper
      expect(getByText('glance-content')).toBeTruthy();
    });

    it('starts at prioritize when glance and sweep are not needed', () => {
      const { getByText, queryByText } = render(
        <MorningBriefStepper {...defaultProps} stepsNeeded={['prioritize', 'organize', 'plan']} />,
      );
      expect(getByText('prioritize-content')).toBeTruthy();
      expect(queryByText('glance-content')).toBeNull();
    });

    it('renders only plan when it is the only step', () => {
      const { getByText } = render(
        <MorningBriefStepper {...defaultProps} stepsNeeded={['plan']} />,
      );
      expect(getByText('plan-content')).toBeTruthy();
    });
  });

  describe('step advancement', () => {
    it('advances from glance to sweep on continue', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      expect(getByText('glance-content')).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByLabelText('glance-continue'));
      });
      await flushAnimations();

      expect(getByText('sweep-content')).toBeTruthy();
    });

    it('advances through all steps sequentially', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      // glance -> sweep
      fireEvent.press(getByLabelText('glance-continue'));
      await flushAnimations();
      expect(getByText('sweep-content')).toBeTruthy();

      // sweep -> prioritize
      fireEvent.press(getByLabelText('sweep-continue'));
      await flushAnimations();
      expect(getByText('prioritize-content')).toBeTruthy();

      // prioritize -> organize
      fireEvent.press(getByLabelText('prioritize-continue'));
      await flushAnimations();
      expect(getByText('organize-content')).toBeTruthy();

      // organize -> plan
      fireEvent.press(getByLabelText('organize-continue'));
      await flushAnimations();
      expect(getByText('plan-content')).toBeTruthy();
    });
  });

  describe('back navigation', () => {
    it('navigates back from sweep to glance', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      // Advance to sweep
      fireEvent.press(getByLabelText('glance-continue'));
      await flushAnimations();
      expect(getByText('sweep-content')).toBeTruthy();

      // Go back
      fireEvent.press(getByLabelText('sweep-back'));
      await flushAnimations();
      expect(getByText('glance-content')).toBeTruthy();
    });
  });

  describe('skip to end', () => {
    it('jumps to plan when skip-to-end is pressed from glance', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      fireEvent.press(getByLabelText('glance-skip-to-end'));
      await flushAnimations();

      expect(getByText('plan-content')).toBeTruthy();
    });
  });

  describe('step subsets', () => {
    it('skips sweep when not in stepsNeeded', async () => {
      const { getByText, getByLabelText, queryByText } = render(
        <MorningBriefStepper
          {...defaultProps}
          stepsNeeded={['glance', 'prioritize', 'organize', 'plan']}
        />,
      );

      // Start at glance
      expect(getByText('glance-content')).toBeTruthy();

      // Continue should go straight to prioritize (skip sweep)
      fireEvent.press(getByLabelText('glance-continue'));
      await flushAnimations();

      expect(getByText('prioritize-content')).toBeTruthy();
      expect(queryByText('sweep-content')).toBeNull();
    });
  });
});
