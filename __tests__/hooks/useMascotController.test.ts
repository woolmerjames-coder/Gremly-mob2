/**
 * useMascotController.test.ts - Phase 10.6
 *
 * Tests for mascot state management and transitions
 */

import { renderHook, act } from '@testing-library/react-native';
import { useMascotController } from '../../hooks/useMascotController';

describe('useMascotController', () => {
  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useMascotController());

    expect(result.current.state).toBe('idle');
  });

  it('should transition to thinking state', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.thinking();
    });

    expect(result.current.state).toBe('thinking');
  });

  it('should transition to replying state', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.replying();
    });

    expect(result.current.state).toBe('replying');
  });

  it('should transition to playful state', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.playful();
    });

    expect(result.current.state).toBe('playful');
  });

  it('should transition to celebration state', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.celebrate();
    });

    expect(result.current.state).toBe('celebration');
  });

  it('should transition to rest state and stay there', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.rest();
    });

    expect(result.current.state).toBe('rest');
  });

  it('should manually return to idle state', () => {
    const { result } = renderHook(() => useMascotController());

    // Start with celebration
    act(() => {
      result.current.celebrate();
    });

    expect(result.current.state).toBe('celebration');

    // Manually trigger idle
    act(() => {
      result.current.idle();
    });

    expect(result.current.state).toBe('idle');
  });

  it('should handle rapid state changes gracefully', () => {
    const { result } = renderHook(() => useMascotController());

    // Rapid succession of state changes
    act(() => {
      result.current.thinking();
      result.current.replying();
      result.current.playful();
      result.current.celebrate();
    });

    // Should end up in celebration state
    expect(result.current.state).toBe('celebration');
  });

  it('should provide all expected controller methods', () => {
    const { result } = renderHook(() => useMascotController());

    expect(typeof result.current.thinking).toBe('function');
    expect(typeof result.current.replying).toBe('function');
    expect(typeof result.current.playful).toBe('function');
    expect(typeof result.current.celebrate).toBe('function');
    expect(typeof result.current.rest).toBe('function');
    expect(typeof result.current.idle).toBe('function');
  });
});
