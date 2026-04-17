/**
 * Training Speech Combo Tests
 *
 * Tests the training-mode speech logic where:
 * 1. drop:reaction_ready stashes rawReaction (step 1) or combines it with
 *    the training prompt (steps 2-4)
 * 2. GaugeExplanationModal onDismiss reads pendingTrainingReactionRef and
 *    combines with training prompt for step 2
 */

describe('Training speech combo — reaction event handler', () => {
  /**
   * Simulates the training guard from the drop:reaction_ready listener.
   * Returns what would be passed to setGremlySpeech, or { stashed: string }
   * for step 1.
   */
  function simulateTrainingReactionHandler(opts: {
    trainingDropStep: number;
    isTrainingMode: boolean;
    rawReaction: string | null;
    message: string | null;
    getTrainingDropPrompt: (step: number) => { message: string } | null;
    pendingRef: { current: string | null };
  }): { stashed: true } | { message: string; variant: string } | null {
    const { trainingDropStep, isTrainingMode, rawReaction, getTrainingDropPrompt, pendingRef } =
      opts;

    if (!isTrainingMode || trainingDropStep < 1 || trainingDropStep > 4) {
      return null; // Not handled by training guard
    }

    if (trainingDropStep === 1) {
      pendingRef.current = rawReaction || null;
      return { stashed: true };
    }

    // Steps 2-4
    const trainingPrompt = getTrainingDropPrompt(trainingDropStep + 1);
    if (trainingPrompt) {
      const reaction = rawReaction || '';
      const combined = reaction
        ? reaction + '\n\n' + trainingPrompt.message
        : trainingPrompt.message;
      return { message: combined, variant: 'default' };
    }

    return null;
  }

  it('step 1: stashes rawReaction in pendingRef', () => {
    const pendingRef = { current: null as string | null };

    const result = simulateTrainingReactionHandler({
      trainingDropStep: 1,
      isTrainingMode: true,
      rawReaction: 'Bella time!',
      message: 'Nice one! Bella time!',
      getTrainingDropPrompt: jest.fn(),
      pendingRef,
    });

    expect(result).toEqual({ stashed: true });
    expect(pendingRef.current).toBe('Bella time!');
  });

  it('step 1: stashes null when no rawReaction', () => {
    const pendingRef = { current: null as string | null };

    simulateTrainingReactionHandler({
      trainingDropStep: 1,
      isTrainingMode: true,
      rawReaction: null,
      message: null,
      getTrainingDropPrompt: jest.fn(),
      pendingRef,
    });

    expect(pendingRef.current).toBeNull();
  });

  it('step 1: uses rawReaction not message', () => {
    const pendingRef = { current: null as string | null };

    simulateTrainingReactionHandler({
      trainingDropStep: 1,
      isTrainingMode: true,
      rawReaction: 'Clean reaction',
      message: 'Opener + Clean reaction',
      getTrainingDropPrompt: jest.fn(),
      pendingRef,
    });

    expect(pendingRef.current).toBe('Clean reaction');
    expect(pendingRef.current).not.toBe('Opener + Clean reaction');
  });

  it('step 2: combines rawReaction with training prompt', () => {
    const pendingRef = { current: null as string | null };

    const result = simulateTrainingReactionHandler({
      trainingDropStep: 2,
      isTrainingMode: true,
      rawReaction: 'Great drop!',
      message: 'I love it! Great drop!',
      getTrainingDropPrompt: () => ({ message: 'Try another one!' }),
      pendingRef,
    });

    expect(result).toEqual({
      message: 'Great drop!\n\nTry another one!',
      variant: 'default',
    });
  });

  it('step 3: shows only training prompt when rawReaction is null', () => {
    const pendingRef = { current: null as string | null };

    const result = simulateTrainingReactionHandler({
      trainingDropStep: 3,
      isTrainingMode: true,
      rawReaction: null,
      message: null,
      getTrainingDropPrompt: () => ({ message: 'Keep going!' }),
      pendingRef,
    });

    expect(result).toEqual({
      message: 'Keep going!',
      variant: 'default',
    });
  });

  it('non-training mode returns null (not handled)', () => {
    const pendingRef = { current: null as string | null };

    const result = simulateTrainingReactionHandler({
      trainingDropStep: 0,
      isTrainingMode: false,
      rawReaction: 'test',
      message: 'test',
      getTrainingDropPrompt: jest.fn(),
      pendingRef,
    });

    expect(result).toBeNull();
  });
});

describe('Training speech combo — gauge modal dismiss', () => {
  /**
   * Simulates the GaugeExplanationModal onDismiss handler logic.
   */
  function simulateGaugeDismiss(opts: {
    pendingRef: { current: string | null };
    getTrainingDropPrompt: (step: number) => { message: string } | null;
  }): string | null {
    const { pendingRef, getTrainingDropPrompt } = opts;

    const nextPrompt = getTrainingDropPrompt(2);
    if (nextPrompt) {
      const reaction = pendingRef.current;
      pendingRef.current = null;
      const combined = reaction ? reaction + '\n\n' + nextPrompt.message : nextPrompt.message;
      return combined;
    }
    return null;
  }

  it('combines stashed reaction with training prompt', () => {
    const pendingRef = { current: 'Bella time!' };
    const getPrompt = () => ({ message: 'Now try dropping another thought!' });

    const result = simulateGaugeDismiss({
      pendingRef,
      getTrainingDropPrompt: getPrompt,
    });

    expect(result).toBe('Bella time!\n\nNow try dropping another thought!');
    expect(pendingRef.current).toBeNull(); // Ref should be cleared
  });

  it('shows only training prompt when no stashed reaction', () => {
    const pendingRef = { current: null };
    const getPrompt = () => ({ message: 'Now try dropping another thought!' });

    const result = simulateGaugeDismiss({
      pendingRef,
      getTrainingDropPrompt: getPrompt,
    });

    expect(result).toBe('Now try dropping another thought!');
  });

  it('clears the pendingRef after reading it', () => {
    const pendingRef = { current: 'Stashed value' };
    const getPrompt = () => ({ message: 'Prompt' });

    simulateGaugeDismiss({ pendingRef, getTrainingDropPrompt: getPrompt });

    expect(pendingRef.current).toBeNull();
  });

  it('returns null when no training prompt available', () => {
    const pendingRef = { current: 'Stashed' };

    const result = simulateGaugeDismiss({
      pendingRef,
      getTrainingDropPrompt: () => null,
    });

    expect(result).toBeNull();
  });
});
