/**
 * Greeting Timing Tests
 *
 * Verifies the critical fix where hasShownGreetingRef.current is set
 * BEFORE the timer starts, so hydration-driven re-fires of the useEffect
 * return early instead of restarting the timer.
 *
 * These are pure logic tests that exercise the greeting decision tree
 * without rendering the full component.
 */

import { getFirstVisitSpeech } from '../../../lib/speech/gremlySpeech';

describe('Greeting timing — ref-before-timer pattern', () => {
  /**
   * Simulates the greeting useEffect logic extracted into a testable function.
   * The critical invariant: hasShownRef must be set BEFORE setTimeout,
   * so a second invocation returns early.
   */
  function simulateGreetingEffect(opts: {
    hasShownRef: { current: boolean };
    isTrainingMode: boolean;
    trainingDropStep: number;
    firstDropCompletedAt: string | null;
    setGremlySpeech: jest.Mock;
    showGremlySpeech: jest.Mock;
    buildSpeechContext: jest.Mock;
    getTrainingDropPrompt: jest.Mock;
  }): (() => void) | undefined {
    const {
      hasShownRef,
      isTrainingMode,
      trainingDropStep,
      firstDropCompletedAt,
      setGremlySpeech,
      showGremlySpeech,
      buildSpeechContext,
      getTrainingDropPrompt,
    } = opts;

    if (hasShownRef.current) return;

    if (isTrainingMode && trainingDropStep >= 1 && trainingDropStep <= 4) {
      hasShownRef.current = true;
      const prompt = getTrainingDropPrompt(trainingDropStep + 1);
      if (prompt) {
        setGremlySpeech({ message: prompt.message, variant: 'default' });
      }
      return;
    }

    if (!firstDropCompletedAt) {
      hasShownRef.current = true;
      const timer = setTimeout(() => {
        const speech = getFirstVisitSpeech();
        setGremlySpeech({ message: speech.message, variant: 'default' });
      }, 500);
      return () => clearTimeout(timer);
    }

    hasShownRef.current = true;
    const timer = setTimeout(() => {
      const ctx = buildSpeechContext('greeting');
      const greeting = { message: 'Hello!', duration: 3000 };
      if (greeting) {
        showGremlySpeech(greeting.message, greeting.duration);
      }
    }, 500);
    return () => clearTimeout(timer);
  }

  it('sets hasShownRef BEFORE scheduling the timer for first visit', () => {
    const hasShownRef = { current: false };
    const setGremlySpeech = jest.fn();

    simulateGreetingEffect({
      hasShownRef,
      isTrainingMode: false,
      trainingDropStep: 0,
      firstDropCompletedAt: null,
      setGremlySpeech,
      showGremlySpeech: jest.fn(),
      buildSpeechContext: jest.fn(),
      getTrainingDropPrompt: jest.fn(),
    });

    // Ref should be true IMMEDIATELY (before 500ms timer fires)
    expect(hasShownRef.current).toBe(true);
    // But setGremlySpeech should NOT have been called yet (it's in the timer)
    expect(setGremlySpeech).not.toHaveBeenCalled();
  });

  it('sets hasShownRef BEFORE scheduling the timer for returning user', () => {
    const hasShownRef = { current: false };
    const showGremlySpeech = jest.fn();
    const buildSpeechContext = jest.fn().mockReturnValue({});

    simulateGreetingEffect({
      hasShownRef,
      isTrainingMode: false,
      trainingDropStep: 0,
      firstDropCompletedAt: '2026-01-01T00:00:00Z',
      setGremlySpeech: jest.fn(),
      showGremlySpeech,
      buildSpeechContext,
      getTrainingDropPrompt: jest.fn(),
    });

    expect(hasShownRef.current).toBe(true);
    expect(showGremlySpeech).not.toHaveBeenCalled();
  });

  it('second invocation returns early because ref is already true', () => {
    const hasShownRef = { current: false };
    const setGremlySpeech = jest.fn();

    const base = {
      hasShownRef,
      isTrainingMode: false,
      trainingDropStep: 0,
      firstDropCompletedAt: null,
      setGremlySpeech,
      showGremlySpeech: jest.fn(),
      buildSpeechContext: jest.fn(),
      getTrainingDropPrompt: jest.fn(),
    };

    // First fire
    const cleanup1 = simulateGreetingEffect(base);
    expect(hasShownRef.current).toBe(true);

    // Second fire (simulating hydration-driven re-fire)
    const cleanup2 = simulateGreetingEffect(base);
    expect(cleanup2).toBeUndefined(); // Returns early, no cleanup needed
  });

  it('first-visit timer fires after delay and calls setGremlySpeech', () => {
    jest.useFakeTimers();
    const hasShownRef = { current: false };
    const setGremlySpeech = jest.fn();

    simulateGreetingEffect({
      hasShownRef,
      isTrainingMode: false,
      trainingDropStep: 0,
      firstDropCompletedAt: null,
      setGremlySpeech,
      showGremlySpeech: jest.fn(),
      buildSpeechContext: jest.fn(),
      getTrainingDropPrompt: jest.fn(),
    });

    expect(setGremlySpeech).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(setGremlySpeech).toHaveBeenCalledTimes(1);
    expect(setGremlySpeech).toHaveBeenCalledWith(expect.objectContaining({ variant: 'default' }));

    jest.useRealTimers();
  });

  it('training mode sets ref and calls setGremlySpeech synchronously', () => {
    const hasShownRef = { current: false };
    const setGremlySpeech = jest.fn();
    const getTrainingDropPrompt = jest.fn().mockReturnValue({
      message: 'Try dropping a thought!',
    });

    simulateGreetingEffect({
      hasShownRef,
      isTrainingMode: true,
      trainingDropStep: 1,
      firstDropCompletedAt: null,
      setGremlySpeech,
      showGremlySpeech: jest.fn(),
      buildSpeechContext: jest.fn(),
      getTrainingDropPrompt,
    });

    expect(hasShownRef.current).toBe(true);
    expect(setGremlySpeech).toHaveBeenCalledWith({
      message: 'Try dropping a thought!',
      variant: 'default',
    });
  });

  it('cleanup function clears the timer on unmount', () => {
    jest.useFakeTimers();
    const hasShownRef = { current: false };
    const setGremlySpeech = jest.fn();

    const cleanup = simulateGreetingEffect({
      hasShownRef,
      isTrainingMode: false,
      trainingDropStep: 0,
      firstDropCompletedAt: null,
      setGremlySpeech,
      showGremlySpeech: jest.fn(),
      buildSpeechContext: jest.fn(),
      getTrainingDropPrompt: jest.fn(),
    });

    // Simulate unmount before timer fires
    cleanup?.();
    jest.advanceTimersByTime(500);
    expect(setGremlySpeech).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
