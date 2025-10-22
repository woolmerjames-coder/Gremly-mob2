/**
 * Phase 10.6: Mascot Provider Tests
 * Tests for React hooks and provider functionality
 */

import React from 'react';
import { render, renderHook, act } from '@testing-library/react-native';
import { MascotProvider, useMascot } from '../useMascot';
import { emitChatEvent } from '../../../lib/chat/events';

// Mock the mascot machine
jest.mock('../mascotMachine', () => {
  const mockMachine = {
    getState: jest.fn(() => 'idle'),
    dispatch: jest.fn(),
    subscribe: jest.fn((callback) => {
      // Immediately call with current state
      callback('idle');
      // Return unsubscribe function
      return jest.fn();
    }),
    destroy: jest.fn(),
    getStateInfo: jest.fn(() => ({
      current: 'idle',
      lastTransition: Date.now(),
      hasTimeout: false,
      listenerCount: 1,
    })),
  };

  return {
    MascotMachine: jest.fn(() => mockMachine),
    createMascotController: jest.fn(() => mockMachine),
    shouldShowMascot: jest.fn((lane) => lane === 'space_chat'),
    STATE_TIMEOUTS: {
      idle: null,
      thinking: null,
      replying: 1200,
      playful: 2500,
      celebrate: 1800,
      error: 3000,
    },
  };
});

// Mock environment flags
jest.mock('../../../lib/env', () => ({
  env: {
    feature: {
      mascot: {
        enabled: true,
        debug: false,
      },
    },
  },
}));

const MockMascotMachine = require('../mascotMachine').MascotMachine;
const mockCreateMascotController = require('../mascotMachine').createMascotController;
const mockShouldShowMascot = require('../mascotMachine').shouldShowMascot;

describe('MascotProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mock to return a proper machine
    mockCreateMascotController.mockReturnValue({
      getState: jest.fn(() => 'idle'),
      dispatch: jest.fn(),
      subscribe: jest.fn((callback) => {
        callback('idle');
        return jest.fn();
      }),
      destroy: jest.fn(),
      getStateInfo: jest.fn(() => ({
        current: 'idle',
        lastTransition: Date.now(),
        hasTimeout: false,
        listenerCount: 1,
      })),
    });
  });

  describe('Provider Setup', () => {
    it('should render children without crashing', () => {
      const TestComponent = () => <div>Test</div>;

      const { getByText } = render(
        <MascotProvider>
          <TestComponent />
        </MascotProvider>,
      );

      expect(getByText('Test')).toBeTruthy();
    });

    it('should create mascot machine instance', () => {
      render(
        <MascotProvider>
          <div>Test</div>
        </MascotProvider>,
      );

      expect(mockCreateMascotController).toHaveBeenCalledWith('idle');
    });
  });

  describe('useMascot Hook', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MascotProvider>{children}</MascotProvider>
    );

    it('should provide current mascot state', () => {
      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.state).toBe('idle');
    });

    it('should provide visibility based on lane', () => {
      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.isVisible).toBe(true);
      expect(result.current.isEnabled).toBe(true);
    });

    it('should provide debug info in development', () => {
      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.debugInfo).toEqual({
        current: 'idle',
        lastTransition: expect.any(Number),
        hasTimeout: false,
        listenerCount: 1,
      });
    });

    it('should throw error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useMascot());
      }).toThrow('useMascot must be used within a MascotProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Event Integration', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MascotProvider>{children}</MascotProvider>
    );

    it('should listen to chat events and dispatch to machine', () => {
      const mockDispatch = jest.fn();
      MockMascotMachine.mockImplementation(() => ({
        ...MockMascotMachine(),
        dispatch: mockDispatch,
      }));

      renderHook(() => useMascot(), { wrapper });

      // Emit a chat event
      act(() => {
        emitChatEvent({
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        });
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });
    });

    it('should handle state changes from machine', () => {
      let stateCallback: (state: string) => void;

      MockMascotMachine.mockImplementation(() => ({
        ...MockMascotMachine(),
        subscribe: jest.fn((callback) => {
          stateCallback = callback;
          callback('idle');
          return jest.fn();
        }),
      }));

      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.state).toBe('idle');

      // Simulate state change
      act(() => {
        stateCallback('thinking');
      });

      expect(result.current.state).toBe('thinking');
    });
  });

  describe('Lane-specific Visibility', () => {
    it('should show mascot for space_chat lane', () => {
      mockShouldShowMascot.mockReturnValue(true);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MascotProvider lane="space_chat">{children}</MascotProvider>
      );

      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.isVisible).toBe(true);
      expect(mockShouldShowMascot).toHaveBeenCalledWith('space_chat');
    });

    it('should hide mascot for other lanes', () => {
      mockShouldShowMascot.mockReturnValue(false);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MascotProvider lane="other_lane">{children}</MascotProvider>
      );

      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.isVisible).toBe(false);
      expect(mockShouldShowMascot).toHaveBeenCalledWith('other_lane');
    });

    it('should handle undefined lane', () => {
      mockShouldShowMascot.mockReturnValue(false);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MascotProvider>{children}</MascotProvider>
      );

      const { result } = renderHook(() => useMascot(), { wrapper });

      expect(result.current.isVisible).toBe(false);
      expect(mockShouldShowMascot).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Environment Flag Integration', () => {
    it('should respect feature flag for mascot visibility', () => {
      // Mock disabled feature flag
      const env = require('../../../lib/env').env;
      env.feature.mascot.enabled = false;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MascotProvider lane="space_chat">{children}</MascotProvider>
      );

      const { result } = renderHook(() => useMascot(), { wrapper });

      // Should respect global flag even for space_chat
      expect(result.current.isEnabled).toBe(false);
      expect(result.current.isVisible).toBe(false);

      // Restore
      env.feature.mascot.enabled = true;
    });
  });
});
