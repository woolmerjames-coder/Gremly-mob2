/**
 * Tests for useRemoveRowAnimation hook
 *
 * Note: Animation callbacks are difficult to test in Jest due to react-native-reanimated mocking.
 * These tests focus on the synchronous behavior and state changes.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useRemoveRowAnimation } from '../../components/now/useRemoveRowAnimation';

describe('useRemoveRowAnimation', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useRemoveRowAnimation({}));

    expect(result.current.animationPhase).toBe('idle');
    expect(result.current.isAnimating).toBe(false);
    expect(result.current.isDone).toBe(false);
  });

  it('transitions to animating state when animateAndRemove is called', () => {
    const onRemove = jest.fn();
    const { result } = renderHook(() => useRemoveRowAnimation({ onRemove }));

    act(() => {
      result.current.animateAndRemove();
    });

    // Animation should have started (phase depends on reducedMotion setting)
    expect(result.current.animationPhase).not.toBe('idle');
  });

  it('prevents double-triggering of animation', () => {
    const onRemove = jest.fn();
    const { result } = renderHook(() => useRemoveRowAnimation({ onRemove }));

    // First trigger
    act(() => {
      result.current.animateAndRemove();
    });
    const phaseAfterFirst = result.current.animationPhase;

    // Second trigger should not change anything
    act(() => {
      result.current.animateAndRemove();
    });
    expect(result.current.animationPhase).toBe(phaseAfterFirst);
  });

  it('provides handleLayout callback', () => {
    const { result } = renderHook(() => useRemoveRowAnimation({}));

    expect(typeof result.current.handleLayout).toBe('function');

    // Should not throw when called
    expect(() => {
      result.current.handleLayout({ nativeEvent: { layout: { height: 50 } } });
    }).not.toThrow();
  });
});
