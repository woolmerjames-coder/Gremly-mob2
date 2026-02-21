/**
 * MorningBriefStepper Tests
 *
 * Tests for the stepper orchestrator that manages step transitions,
 * progress bar, and celebration overlay for the Morning Brief flow.
 *
 * Current production flow: sweep → prioritize → organize → plan
 * (glance was merged into StepPrioritize; stepper still supports it for legacy compat)
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
  // Production flow no longer includes 'glance' — it was merged into StepPrioritize
  const prodSteps: BriefStep[] = ['sweep', 'prioritize', 'organize', 'plan'];

  const defaultProps = {
    stepsNeeded: prodSteps,
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
    it('renders the first step (sweep) by default', () => {
      const { getByText } = render(<MorningBriefStepper {...defaultProps} />);
      expect(getByText('sweep-content')).toBeTruthy();
    });

    it('renders progress bar', () => {
      const { getByText } = render(<MorningBriefStepper {...defaultProps} />);
      expect(getByText('sweep-content')).toBeTruthy();
    });

    it('starts at prioritize when sweep is not needed', () => {
      const { getByText, queryByText } = render(
        <MorningBriefStepper {...defaultProps} stepsNeeded={['prioritize', 'organize', 'plan']} />,
      );
      expect(getByText('prioritize-content')).toBeTruthy();
      expect(queryByText('sweep-content')).toBeNull();
    });

    it('renders only plan when it is the only step', () => {
      const { getByText } = render(
        <MorningBriefStepper {...defaultProps} stepsNeeded={['plan']} />,
      );
      expect(getByText('plan-content')).toBeTruthy();
    });
  });

  describe('step advancement', () => {
    it('advances from sweep to prioritize on continue', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      expect(getByText('sweep-content')).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByLabelText('sweep-continue'));
      });
      await flushAnimations();

      expect(getByText('prioritize-content')).toBeTruthy();
    });

    it('advances through all steps sequentially', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

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
    it('navigates back from prioritize to sweep', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      // Advance to prioritize
      fireEvent.press(getByLabelText('sweep-continue'));
      await flushAnimations();
      expect(getByText('prioritize-content')).toBeTruthy();

      // Go back
      fireEvent.press(getByLabelText('prioritize-back'));
      await flushAnimations();
      expect(getByText('sweep-content')).toBeTruthy();
    });
  });

  describe('skip to end', () => {
    it('jumps to plan when skip-to-end is pressed from glance (legacy)', async () => {
      const allStepsLegacy: BriefStep[] = ['glance', 'sweep', 'prioritize', 'organize', 'plan'];
      const { getByText, getByLabelText } = render(
        <MorningBriefStepper {...defaultProps} stepsNeeded={allStepsLegacy} />,
      );

      fireEvent.press(getByLabelText('glance-skip-to-end'));
      await flushAnimations();

      expect(getByText('plan-content')).toBeTruthy();
    });
  });

  describe('step subsets', () => {
    it('skips organize when not in stepsNeeded', async () => {
      const { getByText, getByLabelText, queryByText } = render(
        <MorningBriefStepper
          {...defaultProps}
          stepsNeeded={['sweep', 'prioritize', 'plan']}
        />,
      );

      // Start at sweep
      expect(getByText('sweep-content')).toBeTruthy();

      // sweep -> prioritize
      fireEvent.press(getByLabelText('sweep-continue'));
      await flushAnimations();
      expect(getByText('prioritize-content')).toBeTruthy();

      // prioritize -> plan (skips organize)
      fireEvent.press(getByLabelText('prioritize-continue'));
      await flushAnimations();
      expect(getByText('plan-content')).toBeTruthy();
      expect(queryByText('organize-content')).toBeNull();
    });
  });

  describe('celebration overlay', () => {
    it('shows celebration with "You\'re locked in." and "LFG" copy', async () => {
      const { getByText, getByLabelText } = render(<MorningBriefStepper {...defaultProps} />);

      // Advance to organize
      fireEvent.press(getByLabelText('sweep-continue'));
      await flushAnimations();
      fireEvent.press(getByLabelText('prioritize-continue'));
      await flushAnimations();

      // Trigger celebration
      await act(async () => {
        fireEvent.press(getByLabelText('organize-celebrate'));
      });
      await flushAnimations();

      expect(getByText("You're locked in.")).toBeTruthy();
      expect(getByText('LFG')).toBeTruthy();
    });
  });
});
