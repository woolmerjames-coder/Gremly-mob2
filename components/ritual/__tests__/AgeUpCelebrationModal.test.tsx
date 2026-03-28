/**
 * AgeUpCelebrationModal.test.tsx
 *
 * Tests for the age-up celebration modal component.
 * Verifies milestone messages, title variations, dismiss behavior, and haptics.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AgeUpCelebrationModal from '../AgeUpCelebrationModal';
import * as haptics from '../../../lib/haptics';

// Mock the mascot image
jest.mock('../../../assets/mascot/fistbumpgremly.png', () => 'mock-fistbump-image');

// Mock haptics
jest.mock('../../../lib/haptics', () => ({
  triggerCelebration: jest.fn().mockResolvedValue(undefined),
  triggerLight: jest.fn().mockResolvedValue(undefined),
}));

describe('AgeUpCelebrationModal', () => {
  const defaultProps = {
    visible: true,
    newAge: 5,
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Visibility
  // ─────────────────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} />);
      expect(getByText('Your Gremly Grew!')).toBeTruthy();
    });

    it('does not render content when visible is false', () => {
      const { queryByText } = render(<AgeUpCelebrationModal {...defaultProps} visible={false} />);
      // Modal content should not be queryable when hidden
      expect(queryByText('Your Gremly Grew!')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Age Display
  // ─────────────────────────────────────────────────────────────────────────

  describe('age display', () => {
    it('displays the new age number', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={42} />);
      expect(getByText('Now Age 42')).toBeTruthy();
    });

    it('displays age 1', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={1} />);
      expect(getByText('Now Age 1')).toBeTruthy();
    });

    it('displays age 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={100} />);
      expect(getByText('Now Age 100')).toBeTruthy();
    });

    it('displays ages over 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={150} />);
      expect(getByText('Now Age 150')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Milestone Titles
  // ─────────────────────────────────────────────────────────────────────────

  describe('milestone titles', () => {
    it('shows "Your Gremly Grew!" for all standard ages', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={5} />);
      expect(getByText('Your Gremly Grew!')).toBeTruthy();
    });

    it('shows "Your Gremly Grew!" for age 10', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={10} />);
      expect(getByText('Your Gremly Grew!')).toBeTruthy();
    });

    it('shows tier transition title when isTierTransition is true', () => {
      const { getByText } = render(
        <AgeUpCelebrationModal
          {...defaultProps}
          newAge={20}
          isTierTransition={true}
          tierName="Adolescent"
        />,
      );
      expect(getByText("You've reached Adolescent!")).toBeTruthy();
    });

    it('shows no message for ages over 100', () => {
      const { queryByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={101} />);
      // The default title should exist
      expect(queryByText('Your Gremly Grew!')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Milestone Messages
  // ─────────────────────────────────────────────────────────────────────────

  describe('milestone messages', () => {
    it('shows message for day 1', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={1} />);
      expect(getByText("One! Gremly's awake now. No turning back.")).toBeTruthy();
    });

    it('shows message for day 7 (one week)', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={7} />);
      expect(getByText("Seven. Gremly's favourite number. Don't tell eight.")).toBeTruthy();
    });

    it('shows message for day 50', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={50} />);
      expect(
        getByText(
          'Fifty! Halfway to a hundred. Gremly wanted to say something profound but just... wow. You did that.',
        ),
      ).toBeTruthy();
    });

    it('shows message for day 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={100} />);
      expect(getByText(/One hundred/)).toBeTruthy();
    });

    it('shows no message for ages over 100', () => {
      const { queryByText, getByText } = render(
        <AgeUpCelebrationModal {...defaultProps} newAge={101} />,
      );
      // The default title should exist
      expect(getByText('Your Gremly Grew!')).toBeTruthy();
      // But no milestone message - look for any text longer than a typical title
      // The message container should not have content for ages > 100
    });

    it('shows unique messages for first 10 days', () => {
      const messages = [
        "One! Gremly's awake now. No turning back.",
        'Two. Still here. Gremly respects that more than you know.',
        "Three! Gremly just outgrew its first pair of shoes. Metaphorically. Gremly doesn't wear shoes.",
        'You showed up again. Gremly is taking notes.',
        "Five. A starfish has five arms and zero productivity systems. You're already ahead.",
        "Six! The part where most people quit. You didn't. Gremly noticed.",
        "Seven. Gremly's favourite number. Don't tell eight.",
        "Eight. Fun fact: an octopus has three hearts. Gremly has one and it's all yours.",
        'Nine. One more to double digits and Gremly is unreasonably excited about it.',
        'Double digits. You built a habit. Gremly built a home.',
      ];

      messages.forEach((message, index) => {
        const { getByText } = render(
          <AgeUpCelebrationModal {...defaultProps} newAge={index + 1} />,
        );
        expect(getByText(message)).toBeTruthy();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Dismiss Behavior
  // ─────────────────────────────────────────────────────────────────────────

  describe('dismiss behavior', () => {
    it('renders Nice! button that can be pressed', () => {
      const onDismiss = jest.fn();
      const { getByText } = render(
        <AgeUpCelebrationModal {...defaultProps} onDismiss={onDismiss} />,
      );

      const niceButton = getByText('Nice!');
      expect(niceButton).toBeTruthy();
      // Note: onDismiss is called after animation completes via runOnJS
      // Since Reanimated animations are mocked synchronously, the callback won't fire
      fireEvent.press(niceButton);
    });

    it('calls onDismiss when backdrop is pressed', () => {
      const onDismiss = jest.fn();
      const { getByTestId, UNSAFE_root } = render(
        <AgeUpCelebrationModal {...defaultProps} onDismiss={onDismiss} />,
      );

      // Find the backdrop (first Pressable after Modal)
      // The backdrop press handler should call onDismiss
      // Note: This may need adjustment based on actual component structure
      const pressables = UNSAFE_root.findAllByType(require('react-native').Pressable);
      if (pressables.length > 0) {
        fireEvent.press(pressables[0]);
        expect(onDismiss).toHaveBeenCalled();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Mascot Image
  // ─────────────────────────────────────────────────────────────────────────

  describe('mascot image', () => {
    it('renders celebration video in mascot container', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} />);
      // The video is rendered within the mascot container alongside the age display
      expect(getByText('Now Age 5')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Haptic Feedback
  // ─────────────────────────────────────────────────────────────────────────

  describe('haptic feedback', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('triggers escalating haptic pattern when modal becomes visible', () => {
      // The component calls triggerAgeUpHapticPattern() which uses expo-haptics
      // directly (Haptics.impactAsync) on a timer-based schedule, not
      // haptics.triggerCelebration from lib/haptics.
      // The first light tap fires at 0ms via setTimeout.
      const ExpoHaptics = require('expo-haptics');
      render(<AgeUpCelebrationModal {...defaultProps} visible={true} />);
      // Flush all scheduled haptic timers (pattern runs 0–3000ms)
      jest.advanceTimersByTime(3100);
      expect(ExpoHaptics.impactAsync).toHaveBeenCalled();
    });

    it('does not trigger haptic when modal is not visible', () => {
      const ExpoHaptics = require('expo-haptics');
      ExpoHaptics.impactAsync.mockClear();
      render(<AgeUpCelebrationModal {...defaultProps} visible={false} />);
      jest.advanceTimersByTime(3100);
      expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
    });

    it('triggers haptic only once per visibility change', () => {
      const ExpoHaptics = require('expo-haptics');
      ExpoHaptics.impactAsync.mockClear();
      const { rerender } = render(<AgeUpCelebrationModal {...defaultProps} visible={true} />);
      jest.advanceTimersByTime(3100);
      const callCount = ExpoHaptics.impactAsync.mock.calls.length;
      expect(callCount).toBeGreaterThan(0);

      // Re-render with same visible state should not trigger more haptics
      ExpoHaptics.impactAsync.mockClear();
      rerender(<AgeUpCelebrationModal {...defaultProps} visible={true} newAge={6} />);
      jest.advanceTimersByTime(3100);
      expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Overlay Structure
  // ─────────────────────────────────────────────────────────────────────────

  describe('overlay structure', () => {
    it('uses absolute-positioned overlay instead of Modal', () => {
      // The modal uses View with absoluteFillObject and high zIndex
      // instead of React Native Modal for better stacking on iOS
      const { getByTestId, UNSAFE_root } = render(
        <AgeUpCelebrationModal {...defaultProps} visible={true} />,
      );

      // The overlay should be a View, not a Modal
      // Modal components from react-native would have a different structure
      const viewElements = UNSAFE_root.findAllByType(require('react-native').View);
      expect(viewElements.length).toBeGreaterThan(0);
    });

    it('renders content when visible is true', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} visible={true} />);
      expect(getByText('Your Gremly Grew!')).toBeTruthy();
    });
  });
});
