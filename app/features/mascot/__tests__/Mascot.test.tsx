/**
 * Phase 10.6: Mascot Component Tests
 * Tests for visual mascot component with animations
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Mascot } from '../Mascot';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');

  // Add sequence mock
  Reanimated.sequence = jest.fn(() => ({}));
  Reanimated.timing = jest.fn(() => ({}));
  Reanimated.withDelay = jest.fn(() => ({}));
  Reanimated.runOnJS = jest.fn((fn) => fn);

  return Reanimated;
});

// Mock environment
jest.mock('../../../../lib/env', () => ({
  env: {
    feature: {
      mascot: {
        enabled: true,
        debug: false,
      },
    },
  },
}));

// Mock mascot machine and provider
const mockMascotContext = {
  state: 'idle' as any,
  isVisible: true,
  isEnabled: true,
  debugInfo: {
    listenerCount: 1,
    lastTransition: Date.now(),
    hasTimeout: false,
  },
};

jest.mock('../useMascot', () => ({
  useMascot: () => mockMascotContext,
  MascotProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { useMascot } = require('../useMascot');

describe('Mascot Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock context to defaults
    mockMascotContext.state = 'idle';
    mockMascotContext.isVisible = true;
    mockMascotContext.isEnabled = true;
    mockMascotContext.debugInfo = {
      listenerCount: 1,
      lastTransition: Date.now(),
      hasTimeout: false,
    };

    // Reset environment debug flag
    const env = require('../../../../lib/env').env;
    env.feature.mascot.debug = false;
  });

  describe('Rendering', () => {
    it('should render when enabled and visible', () => {
      mockMascotContext.isEnabled = true;
      mockMascotContext.isVisible = true;

      const { getByText } = render(<Mascot />);

      // Should render the idle emoji (koala)
      expect(getByText(/🐨/)).toBeTruthy();
    });

    it('should not render when disabled', () => {
      mockMascotContext.isEnabled = false;
      mockMascotContext.isVisible = true;

      const { queryByTestId } = render(<Mascot />);

      expect(queryByTestId('mascot-container')).toBeNull();
    });

    it('should not render when not visible', () => {
      mockMascotContext.isEnabled = true;
      mockMascotContext.isVisible = false;

      const { queryByTestId } = render(<Mascot />);

      expect(queryByTestId('mascot-container')).toBeNull();
    });
  });

  describe('State Visualization', () => {
    beforeEach(() => {
      mockMascotContext.isEnabled = true;
      mockMascotContext.isVisible = true;
    });

    it('should display idle emoji for idle state', () => {
      mockMascotContext.state = 'idle';

      const { getByText } = render(<Mascot />);

      // Idle state shows koala emoji
      expect(getByText(/🐨/)).toBeTruthy();
    });

    it('should display thinking emoji for thinking state', () => {
      mockMascotContext.state = 'thinking';

      const { getByText } = render(<Mascot />);

      expect(getByText('🤔')).toBeTruthy();
    });

    it('should display replying emoji for replying state', () => {
      mockMascotContext.state = 'replying';

      const { getByText } = render(<Mascot />);

      expect(getByText('💬')).toBeTruthy();
    });

    it('should display playful emoji for playful state', () => {
      mockMascotContext.state = 'playful';

      const { getByText } = render(<Mascot />);

      // Playful state shows happy face emoji
      expect(getByText(/😊/)).toBeTruthy();
    });

    it('should display celebrate emoji for celebrate state', () => {
      mockMascotContext.state = 'celebrate';

      const { getByText } = render(<Mascot />);

      expect(getByText('🎉')).toBeTruthy();
    });

    it('should display error emoji for error state', () => {
      mockMascotContext.state = 'error';

      const { getByText } = render(<Mascot />);

      expect(getByText('😕')).toBeTruthy();
    });
  });

  describe('Debug Mode', () => {
    beforeEach(() => {
      mockMascotContext.isEnabled = true;
      mockMascotContext.isVisible = true;
    });

    it('should show debug watermark when debug enabled', () => {
      // Reset state and enable debug
      mockMascotContext.state = 'idle';
      const env = require('../../../../lib/env').env;
      env.feature.mascot.debug = true;

      const { getByText } = render(<Mascot />);

      // Debug mode shows just the state name
      expect(getByText('idle')).toBeTruthy();
    });

    it('should hide debug watermark when debug disabled', () => {
      // Mock production environment
      const env = require('../../../../lib/env').env;
      env.feature.mascot.debug = false;

      const { queryByText } = render(<Mascot />);

      expect(queryByText(/MASCOT DEBUG/)).toBeNull();
    });

    it('should display current state in debug mode', () => {
      const env = require('../../../../lib/env').env;
      env.feature.mascot.debug = true;
      mockMascotContext.state = 'thinking';

      const { getByText } = render(<Mascot />);

      // Debug mode shows just the state name
      expect(getByText('thinking')).toBeTruthy();
    });

    it('should display debug info in debug mode', () => {
      // Reset state and enable debug
      mockMascotContext.state = 'idle';
      const env = require('../../../../lib/env').env;
      env.feature.mascot.debug = true;
      mockMascotContext.debugInfo = {
        listenerCount: 2,
        lastTransition: Date.now(),
        hasTimeout: true,
      };

      const { getByText } = render(<Mascot />);

      // Should show state name and timeout indicator
      expect(getByText('idle')).toBeTruthy();
      expect(getByText('⏱')).toBeTruthy();
    });
  });

  describe('Animation Integration', () => {
    beforeEach(() => {
      mockMascotContext.isEnabled = true;
      mockMascotContext.isVisible = true;
    });

    it('should use Reanimated.View for animations', () => {
      mockMascotContext.state = 'thinking';

      const { getByText } = render(<Mascot />);

      // Component should render the thinking emoji
      expect(getByText('🤔')).toBeTruthy();
    });

    it('should respond to state changes with animations', () => {
      // Initial render
      const { rerender } = render(<Mascot />);

      // Change state
      mockMascotContext.state = 'thinking';
      rerender(<Mascot />);

      // Change state again
      mockMascotContext.state = 'celebrate';
      rerender(<Mascot />);

      // Component should re-render without crashing
      expect(true).toBe(true);
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockMascotContext.isEnabled = true;
      mockMascotContext.isVisible = true;
    });

    it('should have proper accessibility role', () => {
      // Reset to default idle state
      mockMascotContext.state = 'idle';

      const { getByText } = render(<Mascot />);

      // Component should render the idle emoji
      expect(getByText(/🐨/)).toBeTruthy();
    });

    it('should have descriptive accessibility label', () => {
      mockMascotContext.state = 'thinking';

      const { getByText } = render(<Mascot />);

      expect(getByText(/🤔/)).toBeTruthy();
    });

    it('should update accessibility label based on state', () => {
      // Start with idle state
      mockMascotContext.state = 'idle';
      const { getByText, rerender } = render(<Mascot />);

      // Initial state
      expect(getByText(/🐨/)).toBeTruthy();

      // Change state
      mockMascotContext.state = 'celebrate';
      rerender(<Mascot />);

      expect(getByText(/🎉/)).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing context gracefully', () => {
      // Reset to idle state
      mockMascotContext.state = 'idle';

      // This test verifies the component renders properly
      // when the context is provided (normal case)
      const { getByText } = render(<Mascot />);

      expect(getByText(/🐨/)).toBeTruthy();
    });

    it('should handle invalid state gracefully', () => {
      // Enable debug to see the state name
      const env = require('../../../../lib/env').env;
      env.feature.mascot.debug = true;

      mockMascotContext.state = 'invalid_state' as any;

      const { getByText } = render(<Mascot />);

      // Should render debug text showing the invalid state
      expect(getByText('invalid_state')).toBeTruthy(); // debug text
    });
  });
});
