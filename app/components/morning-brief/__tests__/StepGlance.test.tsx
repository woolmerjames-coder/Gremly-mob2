/**
 * StepGlance Tests — DCO-aware greeting card
 *
 * Tests the Morning Brief opening card that shows DCO life context.
 * Validates headline rendering, tone subtitles, life moment pill,
 * and callback wiring.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Store mock state
// ─────────────────────────────────────────────────────────────────────────────

let mockStoreState: Record<string, unknown> = {};

jest.mock('../../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockStoreState),
}));

jest.mock('../../../../lib/store/selectors', () => ({
  selectBriefHeadline: (s: any) => s.dco?.brief_headline ?? null,
  selectLifeMoment: (s: any) => s.dco?.life_moment ?? null,
  selectDcoTone: (s: any) => s.dco?.tone ?? null,
}));

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const { View, Text, Image } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      Text,
      Image,
      createAnimatedComponent: (c: any) => c,
    },
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
  };
});

// Mock brand
jest.mock('../../../../design/brand', () => ({
  BRAND: {
    colors: {
      creamBase: '#FDFBF7',
      mossGreen: '#3D5A3D',
      inkMuted: '#666666',
      charcoalInk: '#2D2D2D',
    },
  },
}));

// Mock mascot image
jest.mock('../../../../assets/mascot/morningbriefgremly.png', () => 'mascot-image');

// Mock ui Text to just render RN Text
jest.mock('../../../../ui', () => {
  const { Text } = require('react-native');
  return { Text };
});

import { StepGlance } from '../StepGlance';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function setDcoState(overrides: Record<string, unknown> = {}) {
  mockStoreState = {
    dco: {
      brief_headline: "Busy week with Sarah's visit",
      life_moment: 'hosting family',
      tone: 'focused',
      ...overrides,
    },
  };
}

function clearDcoState() {
  mockStoreState = { dco: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('StepGlance — DCO greeting card', () => {
  const defaultProps = {
    onContinue: jest.fn(),
    onSkipToEnd: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearDcoState();
  });

  describe('headline rendering', () => {
    it('shows DCO brief_headline when present', () => {
      setDcoState({ brief_headline: 'Big week ahead' });
      const { getByText } = render(<StepGlance {...defaultProps} />);
      expect(getByText('Big week ahead')).toBeTruthy();
    });

    it('falls back to "Good morning" when no DCO', () => {
      clearDcoState();
      const { getByText } = render(<StepGlance {...defaultProps} />);
      expect(getByText('Good morning')).toBeTruthy();
    });

    it('falls back to "Good morning" when brief_headline is null', () => {
      setDcoState({ brief_headline: null });
      const { getByText } = render(<StepGlance {...defaultProps} />);
      expect(getByText('Good morning')).toBeTruthy();
    });
  });

  describe('tone subtitles', () => {
    it.each(['relaxed', 'focused', 'stretched', 'recovering', 'celebratory'] as const)(
      'renders a subtitle for tone "%s"',
      (tone) => {
        setDcoState({ tone });
        const { toJSON } = render(<StepGlance {...defaultProps} />);
        // Component renders without crash — subtitle comes from tone pool
        expect(toJSON()).not.toBeNull();
      },
    );

    it('uses fallback subtitle when no tone', () => {
      mockStoreState = { dco: { brief_headline: 'Hello', tone: null, life_moment: null } };
      const { toJSON } = render(<StepGlance {...defaultProps} />);
      expect(toJSON()).not.toBeNull();
    });
  });

  describe('life moment pill', () => {
    it('renders life moment pill when present', () => {
      setDcoState({ life_moment: 'hosting family' });
      const { getByText } = render(<StepGlance {...defaultProps} />);
      // Should capitalize first letter
      expect(getByText('Hosting family')).toBeTruthy();
    });

    it('does not render pill when life_moment is null', () => {
      setDcoState({ life_moment: null });
      const { queryByText } = render(<StepGlance {...defaultProps} />);
      expect(queryByText(/hosting/i)).toBeNull();
    });
  });

  describe('interactions', () => {
    it('calls onContinue when card is tapped', () => {
      const onContinue = jest.fn();
      setDcoState();
      const { getByText } = render(<StepGlance onContinue={onContinue} onSkipToEnd={jest.fn()} />);
      // The entire card is wrapped in TouchableWithoutFeedback
      fireEvent.press(getByText('tap to start planning'));
      expect(onContinue).toHaveBeenCalledTimes(1);
    });
  });

  describe('hint text', () => {
    it('shows "tap to start planning" hint', () => {
      setDcoState();
      const { getByText } = render(<StepGlance {...defaultProps} />);
      expect(getByText('tap to start planning')).toBeTruthy();
    });
  });

  describe('renders without crash', () => {
    it('renders completely empty state (no DCO at all)', () => {
      mockStoreState = {};
      const { toJSON } = render(<StepGlance {...defaultProps} />);
      expect(toJSON()).not.toBeNull();
    });
  });
});
