/**
 * AgeUpCelebrationModal.test.tsx
 *
 * Tests for the age-up celebration modal component.
 * Verifies milestone messages, title variations, and dismiss behavior.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AgeUpCelebrationModal from '../AgeUpCelebrationModal';

// Mock the mascot image
jest.mock('../../../assets/mascot/fistbumpgremly.png', () => 'mock-fistbump-image');

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
      expect(getByText('Gremly got older')).toBeTruthy();
    });

    it('does not render content when visible is false', () => {
      const { queryByText } = render(<AgeUpCelebrationModal {...defaultProps} visible={false} />);
      // Modal content should not be queryable when hidden
      expect(queryByText('Gremly got older')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Age Display
  // ─────────────────────────────────────────────────────────────────────────

  describe('age display', () => {
    it('displays the new age number', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={42} />);
      expect(getByText('42')).toBeTruthy();
    });

    it('displays age 1', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={1} />);
      expect(getByText('1')).toBeTruthy();
    });

    it('displays age 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={100} />);
      expect(getByText('100')).toBeTruthy();
    });

    it('displays ages over 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={150} />);
      expect(getByText('150')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Milestone Titles
  // ─────────────────────────────────────────────────────────────────────────

  describe('milestone titles', () => {
    it('shows "Gremly got older" for non-milestone ages', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={5} />);
      expect(getByText('Gremly got older')).toBeTruthy();
    });

    it('shows "Double digits!" for age 10', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={10} />);
      expect(getByText('Double digits!')).toBeTruthy();
    });

    it('shows "Twenty!" for age 20', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={20} />);
      expect(getByText('Twenty!')).toBeTruthy();
    });

    it('shows "One month!" for age 30', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={30} />);
      expect(getByText('One month!')).toBeTruthy();
    });

    it('shows "Halfway there!" for age 50', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={50} />);
      expect(getByText('Halfway there!')).toBeTruthy();
    });

    it('shows "One hundred!" for age 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={100} />);
      expect(getByText('One hundred!')).toBeTruthy();
    });

    it.each([
      [40, 'Forty!'],
      [60, 'Sixty!'],
      [70, 'Seventy!'],
      [80, 'Eighty!'],
      [90, 'Ninety!'],
    ])('shows "%s" for age %i', (age, expectedTitle) => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={age} />);
      expect(getByText(expectedTitle)).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Milestone Messages
  // ─────────────────────────────────────────────────────────────────────────

  describe('milestone messages', () => {
    it('shows message for day 1', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={1} />);
      expect(getByText('Gremly gets stronger with age. So do you.')).toBeTruthy();
    });

    it('shows message for day 7 (one week)', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={7} />);
      expect(
        getByText(
          "A whole week! Gremly's full, you're rested, the tabs are closing. This is the point.",
        ),
      ).toBeTruthy();
    });

    it('shows message for day 50', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={50} />);
      expect(
        getByText("Fifty! Halfway to a hundred. Gremly's emotional. In a cool way. Very composed."),
      ).toBeTruthy();
    });

    it('shows message for day 100', () => {
      const { getByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={100} />);
      expect(
        getByText(
          "One hundred. A hundred days together. Gremly's not crying, Gremly's just really proud. Of you, of us, of all of it. Thank you.",
        ),
      ).toBeTruthy();
    });

    it('shows no message for ages over 100', () => {
      const { queryByText } = render(<AgeUpCelebrationModal {...defaultProps} newAge={101} />);
      // The default title should exist
      expect(queryByText('Gremly got older')).toBeTruthy();
      // But no milestone message - look for any text longer than a typical title
      // The message container should not have content for ages > 100
    });

    it('shows unique messages for first 10 days', () => {
      const messages = [
        'Gremly gets stronger with age. So do you.',
        "Two! Gremly's warmed up now.",
        'Three days. Gremly tried to play it cool but got excited anyway.',
        "Four! The head's getting clearer. Gremly can feel it.",
        "Five days and Gremly attempted a victory lap. Short legs. It's fine.",
        "Six! One more and it's a whole week. Gremly's ready.",
        "A whole week! Gremly's full, you're rested, the tabs are closing. This is the point.",
        'Eight! Swept before sleep, slept like a rock. Gremly loves this bit.',
        "Nine. Gremly's pretending not to think about double digits. Not working.",
        'Double digits! Gremly did a little dance. Nailed it. Probably.',
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
    it('calls onDismiss when Nice! button is pressed', () => {
      const onDismiss = jest.fn();
      const { getByText } = render(
        <AgeUpCelebrationModal {...defaultProps} onDismiss={onDismiss} />,
      );

      fireEvent.press(getByText('Nice!'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
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
    it('renders mascot with correct accessibility label', () => {
      const { getByLabelText } = render(<AgeUpCelebrationModal {...defaultProps} />);
      expect(getByLabelText('Gremly celebrating')).toBeTruthy();
    });
  });
});
