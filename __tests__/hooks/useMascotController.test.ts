/**
 * useMascotController.test.ts
 *
 * Tests for unified mascot animation state machine
 */

import { renderHook, act } from '@testing-library/react-native';
import { useMascotController } from '../../hooks/useMascotController';

describe('useMascotController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with idle mode', () => {
    const { result } = renderHook(() => useMascotController());
    expect(result.current.mode).toBe('idle');
  });

  it('should transition to drop on celebrate and auto-return', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.celebrate();
    });
    expect(result.current.mode).toBe('drop');

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(result.current.mode).toBe('idle');
  });

  it('should transition to fed on celebrateFed and auto-return', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.celebrateFed();
    });
    expect(result.current.mode).toBe('fed');

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(result.current.mode).toBe('idle');
  });

  it('should transition to waving and auto-return', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.wave();
    });
    expect(result.current.mode).toBe('waving');

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.mode).toBe('idle');
  });

  it('should transition fallingAsleep → sleeping automatically', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.fallAsleep();
    });
    expect(result.current.mode).toBe('fallingAsleep');

    act(() => {
      jest.advanceTimersByTime(5500);
    });
    expect(result.current.mode).toBe('sleeping');
  });

  it('should stay in sleeping with no auto-return', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.sleep();
    });
    expect(result.current.mode).toBe('sleeping');

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(result.current.mode).toBe('sleeping');
  });

  it('should transition wakingUp → idle', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.sleep();
    });
    act(() => {
      result.current.wakeUp();
    });
    expect(result.current.mode).toBe('wakingUp');

    act(() => {
      jest.advanceTimersByTime(5500);
    });
    expect(result.current.mode).toBe('idle');
  });

  it('should manually return to idle', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.wave();
    });
    expect(result.current.mode).toBe('waving');

    act(() => {
      result.current.idle();
    });
    expect(result.current.mode).toBe('idle');
  });

  it('should handle rapid state changes gracefully', () => {
    const { result } = renderHook(() => useMascotController());

    act(() => {
      result.current.celebrate();
      result.current.celebrateFed();
      result.current.wave();
    });

    expect(result.current.mode).toBe('waving');
  });

  it('should provide all expected controller methods', () => {
    const { result } = renderHook(() => useMascotController());

    expect(typeof result.current.celebrate).toBe('function');
    expect(typeof result.current.celebrateFed).toBe('function');
    expect(typeof result.current.wave).toBe('function');
    expect(typeof result.current.fallAsleep).toBe('function');
    expect(typeof result.current.sleep).toBe('function');
    expect(typeof result.current.wakeUp).toBe('function');
    expect(typeof result.current.idle).toBe('function');
  });
});
