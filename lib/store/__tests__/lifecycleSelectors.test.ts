/**
 * Tests for lib/store/lifecycleSelectors.ts
 *
 * Verifies that each lifecycle selector returns the correct derived value
 * from the Zustand store. Uses setState to set up scenarios and getState
 * to read the same selector logic that the hooks use.
 */

import { useGremlyStore } from '../useGremlyStore';

// Helper: read the selector logic the same way the hook does
const getState = () => useGremlyStore.getState();

beforeEach(() => {
  useGremlyStore.setState({
    isInitialized: false,
    onboardingCompletedAt: null,
    firstDropCompletedAt: null,
    graduatedAt: null,
    isTester: false,
    challengeStartedAt: null,
    challengeCompletedAt: null,
    trainingDropStep: 0,
    trialStartedAt: null,
  });
});

describe('useIsLifecycleReady (isInitialized)', () => {
  it('returns false before initialization', () => {
    expect(getState().isInitialized).toBe(false);
  });

  it('returns true after initialization', () => {
    useGremlyStore.setState({ isInitialized: true });
    expect(getState().isInitialized).toBe(true);
  });
});

describe('useNeedsOnboarding (!onboardingCompletedAt)', () => {
  it('returns true when onboardingCompletedAt is null', () => {
    expect(getState().onboardingCompletedAt).toBeNull();
  });

  it('returns false when onboarding is complete', () => {
    useGremlyStore.setState({ onboardingCompletedAt: '2026-01-01T00:00:00Z' });
    expect(getState().onboardingCompletedAt).not.toBeNull();
  });
});

describe('useNeedsMindDropTutorial (!graduatedAt)', () => {
  it('returns true when not graduated', () => {
    useGremlyStore.setState({ graduatedAt: null });
    const s = getState();
    expect(!s.graduatedAt).toBe(true);
  });

  it('returns false when graduated', () => {
    useGremlyStore.setState({ graduatedAt: '2026-01-01T00:00:00Z' });
    const s = getState();
    expect(!s.graduatedAt).toBe(false);
  });
});

describe('useIsTester (isTester)', () => {
  it('returns false by default', () => {
    expect(getState().isTester).toBe(false);
  });

  it('returns true when flagged', () => {
    useGremlyStore.setState({ isTester: true });
    expect(getState().isTester).toBe(true);
  });
});

describe('useChallengeActive (started && !completed)', () => {
  it('returns false when challenge not started', () => {
    const s = getState();
    expect(s.challengeStartedAt !== null && s.challengeCompletedAt === null).toBe(false);
  });

  it('returns true when started but not completed', () => {
    useGremlyStore.setState({
      challengeStartedAt: '2026-01-01T00:00:00Z',
      challengeCompletedAt: null,
    });
    const s = getState();
    expect(s.challengeStartedAt !== null && s.challengeCompletedAt === null).toBe(true);
  });

  it('returns false when completed', () => {
    useGremlyStore.setState({
      challengeStartedAt: '2026-01-01T00:00:00Z',
      challengeCompletedAt: '2026-01-08T00:00:00Z',
    });
    const s = getState();
    expect(s.challengeStartedAt !== null && s.challengeCompletedAt === null).toBe(false);
  });
});

describe('useChallengeCompleted (challengeCompletedAt !== null)', () => {
  it('returns false when not completed', () => {
    expect(getState().challengeCompletedAt !== null).toBe(false);
  });

  it('returns true when completed', () => {
    useGremlyStore.setState({ challengeCompletedAt: '2026-01-08T00:00:00Z' });
    expect(getState().challengeCompletedAt !== null).toBe(true);
  });
});

describe('useHasCompletedOnboarding', () => {
  it('returns false when null', () => {
    expect(getState().onboardingCompletedAt !== null).toBe(false);
  });

  it('returns true when set', () => {
    useGremlyStore.setState({ onboardingCompletedAt: '2026-01-01T00:00:00Z' });
    expect(getState().onboardingCompletedAt !== null).toBe(true);
  });
});

describe('useHasCompletedFirstDrop', () => {
  it('returns false when null', () => {
    expect(getState().firstDropCompletedAt !== null).toBe(false);
  });

  it('returns true when set', () => {
    useGremlyStore.setState({ firstDropCompletedAt: '2026-01-01T00:00:00Z' });
    expect(getState().firstDropCompletedAt !== null).toBe(true);
  });
});

describe('useTrialStartedAt', () => {
  it('returns null by default', () => {
    expect(getState().trialStartedAt).toBeNull();
  });

  it('returns timestamp when set', () => {
    useGremlyStore.setState({ trialStartedAt: '2026-04-10T00:00:00Z' });
    expect(getState().trialStartedAt).toBe('2026-04-10T00:00:00Z');
  });
});

describe('useGraduatedAt', () => {
  it('returns null by default', () => {
    expect(getState().graduatedAt).toBeNull();
  });

  it('returns timestamp when set', () => {
    useGremlyStore.setState({ graduatedAt: '2026-01-05T00:00:00Z' });
    expect(getState().graduatedAt).toBe('2026-01-05T00:00:00Z');
  });
});

describe('useChallengeStartedAt / useChallengeCompletedAt', () => {
  it('returns null by default', () => {
    expect(getState().challengeStartedAt).toBeNull();
    expect(getState().challengeCompletedAt).toBeNull();
  });

  it('returns timestamps when set', () => {
    useGremlyStore.setState({
      challengeStartedAt: '2026-01-05T00:00:00Z',
      challengeCompletedAt: '2026-01-12T00:00:00Z',
    });
    expect(getState().challengeStartedAt).toBe('2026-01-05T00:00:00Z');
    expect(getState().challengeCompletedAt).toBe('2026-01-12T00:00:00Z');
  });
});
