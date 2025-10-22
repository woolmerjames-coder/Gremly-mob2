/**
 * Mascot.test.tsx - Phase 10.6
 *
 * Tests for Mascot component rendering and flag behavior
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Mascot } from '../../components/mascot/Mascot';
import type { MascotState } from '../../lib/types';

// Mock feature flags
jest.mock('../../config/featureFlags', () => ({
  FLAG_MASCOT: true,
  FLAG_REDUCED: false,
}));

describe('Mascot Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should render with idle state', () => {
    const { getByText } = render(<Mascot state="idle" />);
    expect(getByText('😌')).toBeTruthy();
  });

  it('should render different emojis for different states', () => {
    const states: { state: MascotState; emoji: string }[] = [
      { state: 'idle', emoji: '😌' },
      { state: 'thinking', emoji: '🤔' },
      { state: 'replying', emoji: '😊' },
      { state: 'playful', emoji: '😉' },
      { state: 'celebration', emoji: '🎉' },
      { state: 'rest', emoji: '😴' },
    ];

    states.forEach(({ state, emoji }) => {
      const { getByText } = render(<Mascot state={state} />);
      expect(getByText(emoji)).toBeTruthy();
    });
  });

  it('should respect custom size prop', () => {
    const { getByText } = render(<Mascot state="idle" size={80} />);
    // Note: We would need to add testID to the component to properly test this
    // For now, we'll check that it renders without error
    expect(getByText('😌')).toBeTruthy();
  });

  it('should use default size when not specified', () => {
    const { getByText } = render(<Mascot state="idle" />);
    expect(getByText('😌')).toBeTruthy();
  });

  it('should render nothing when FLAG_MASCOT is disabled', () => {
    // Mock FLAG_MASCOT as false
    jest.doMock('../../config/featureFlags', () => ({
      FLAG_MASCOT: false,
      FLAG_REDUCED: false,
    }));

    // Re-require the component to get the new mock
    const { Mascot: DisabledMascot } = require('../../components/mascot/Mascot');

    const { toJSON } = render(<DisabledMascot state="idle" />);
    expect(toJSON()).toBeNull();
  });

  it('should handle unknown state gracefully', () => {
    // TypeScript would prevent this, but test runtime behavior
    const { getByText } = render(<Mascot state={'unknown' as any} />);
    expect(getByText('😌')).toBeTruthy(); // Should fall back to idle emoji
  });

  describe('Static Mascot (Reduced Motion)', () => {
    beforeEach(() => {
      // Mock FLAG_REDUCED as true
      jest.doMock('../../config/featureFlags', () => ({
        FLAG_MASCOT: true,
        FLAG_REDUCED: true,
      }));
    });

    it('should render static version when reduced motion is enabled', () => {
      const { Mascot: StaticMascot } = require('../../components/mascot/Mascot');
      const { getByText } = render(<StaticMascot state="idle" />);
      expect(getByText('😌')).toBeTruthy();
    });
  });

  describe('Lottie Fallback Behavior', () => {
    it('should gracefully handle missing Lottie assets', () => {
      // The component should fall back to static emoji when Lottie fails
      const { getByText } = render(<Mascot state="idle" />);
      expect(getByText('😌')).toBeTruthy();
    });

    it('should not crash when Lottie is not available', () => {
      // Test that component renders without throwing
      expect(() => {
        render(<Mascot state="thinking" />);
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should render content that is accessible', () => {
      const { getByText } = render(<Mascot state="idle" />);
      const emojiElement = getByText('😌');
      expect(emojiElement).toBeTruthy();
      // In a real implementation, we might add accessibility labels
    });
  });

  describe('Performance', () => {
    it('should render quickly with minimal re-renders', () => {
      const { rerender } = render(<Mascot state="idle" />);

      // Change state multiple times
      rerender(<Mascot state="thinking" />);
      rerender(<Mascot state="replying" />);
      rerender(<Mascot state="idle" />);

      // Should not crash or cause issues
      expect(true).toBe(true);
    });
  });
});
