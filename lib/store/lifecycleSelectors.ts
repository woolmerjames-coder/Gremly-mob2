import { useGremlyStore } from './useGremlyStore';

/** True once lifecycle state is confirmed from Supabase (or cached fallback). */
export const useIsLifecycleReady = () => useGremlyStore((s) => s.isInitialized);

/** User has not yet completed the 4 onboarding screens. */
export const useNeedsOnboarding = () => useGremlyStore((s) => !s.onboardingCompletedAt);

/** User has not yet completed the 5-drop MindDrop tutorial.
 *  Testers still do this once; they just skip paywall gating. */
export const useNeedsMindDropTutorial = () => useGremlyStore((s) => !s.graduatedAt);

/** User is flagged as internal/tester. Bypasses paywall and read-only mode only. */
export const useIsTester = () => useGremlyStore((s) => s.isTester);

/** User has started the 7-fed-days challenge (i.e. completed tutorial). */
export const useChallengeActive = () =>
  useGremlyStore((s) => s.challengeStartedAt !== null && s.challengeCompletedAt === null);

/** User has completed the 7-fed-days challenge. Drives mascot-sheet pre/post. */
export const useChallengeCompleted = () => useGremlyStore((s) => s.challengeCompletedAt !== null);

/** User has graduated the tutorial but hasn't completed the 7-fed-days challenge yet. */
export const useIsInChallenge = () =>
  useGremlyStore((s) => s.graduatedAt !== null && s.challengeCompletedAt === null);

/** Current training step (0-6). Only meaningful when useNeedsMindDropTutorial is true. */
export const useTrainingDropStep = () => useGremlyStore((s) => s.trainingDropStep);

/** User has completed the onboarding screens. */
export const useHasCompletedOnboarding = () =>
  useGremlyStore((s) => s.onboardingCompletedAt !== null);

/** User has completed their first drop post-onboarding. */
export const useHasCompletedFirstDrop = () =>
  useGremlyStore((s) => s.firstDropCompletedAt !== null);

/** Trial/free-period start timestamp. Null only for brand new users. */
export const useTrialStartedAt = () => useGremlyStore((s) => s.trialStartedAt);

/** Raw graduated_at timestamp, if any. Prefer useNeedsMindDropTutorial for gating. */
export const useGraduatedAt = () => useGremlyStore((s) => s.graduatedAt);

/** Challenge start timestamp. Null if user hasn't graduated the tutorial. */
export const useChallengeStartedAt = () => useGremlyStore((s) => s.challengeStartedAt);

/** Challenge completion timestamp. Null while in challenge. */
export const useChallengeCompletedAt = () => useGremlyStore((s) => s.challengeCompletedAt);

/** Whether user has already seen the one-time read-only intro sheet. */
export const useHasSeenReadonlyIntro = () => useGremlyStore((s) => s.hasSeenReadonlyIntro);

// Re-export access selectors from useSubscriptionStatus (defined there to avoid circular imports)
export {
  useHasAccess,
  useIsReadOnly,
  useCanCreate,
  useCanChat,
} from '../subscriptions/useSubscriptionStatus';
