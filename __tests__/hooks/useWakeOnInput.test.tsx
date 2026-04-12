/**
 * useWakeOnInput.test.tsx
 *
 * Tests for the useWakeOnInput hook, which returns a callback that
 * calls resetInactivity from MascotModeContext.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useWakeOnInput } from '../../hooks/useWakeOnInput';
import { MascotModeProvider } from '../../contexts/MascotModeContext';

describe('useWakeOnInput', () => {
  it('calls resetInactivity when invoked', () => {
    const mockReset = jest.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MascotModeProvider value={{ mode: 'sleeping', resetInactivity: mockReset }}>
        {children}
      </MascotModeProvider>
    );

    const { result } = renderHook(() => useWakeOnInput(), { wrapper });

    act(() => {
      result.current();
    });

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('returns a stable callback reference', () => {
    const mockReset = jest.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MascotModeProvider value={{ mode: 'idle', resetInactivity: mockReset }}>
        {children}
      </MascotModeProvider>
    );

    const { result, rerender } = renderHook(() => useWakeOnInput(), { wrapper });
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });

  it('can be called multiple times', () => {
    const mockReset = jest.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MascotModeProvider value={{ mode: 'idle', resetInactivity: mockReset }}>
        {children}
      </MascotModeProvider>
    );

    const { result } = renderHook(() => useWakeOnInput(), { wrapper });

    act(() => {
      result.current();
      result.current();
      result.current();
    });

    expect(mockReset).toHaveBeenCalledTimes(3);
  });
});
