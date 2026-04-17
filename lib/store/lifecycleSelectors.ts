import { useGremlyStore } from './useGremlyStore';

/** True once lifecycle state is confirmed from Supabase (or cached fallback). */
export const useIsLifecycleReady = () => useGremlyStore((s) => s.isInitialized);

/** User has not yet completed the 4 onboarding screens. */
export const useNeedsOnboarding = () => useGremlyStore((s) => !s.onboardingCompletedAt);

/** User has not yet completed the 5-drop MindDrop tutorial.
 *  Testers still do this once; they just skip paywall gating. */
export const useNeedsMindDropTutorial = () =>
  useGremlyStore((s) => s.isTrainingMode && !s.graduatedAt);

/** User is flagged as internal/tester. Bypasses paywall and read-only mode only. */
export const useIsTester = () => useGremlyStore((s) => s.tsisTester);

/** User has started the 7-fed-days challenge (i.e. completed tutorial). */
export const useChallengeActive = () =>
  useGremlyStore((s) => s.challengeStartedAt !== null && s.challengeCompletedAt === null);

/** User has completed the 7-fed-days challenge. Drives mascot-sheet pre/post. */
export const useChallengeCompleted = () => useGremlyStore((s) => s.challengeCompletedAt !== null);

/** Current training step (0-6). Only meaningful when useNeedsMindDropTutorial is true. */
export const useTrainingDropStep = () => useGremlyStore((s) => s.trainingDropStep);
