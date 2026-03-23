/**
 * trainingFlow.ts
 *
 * Manages the Day 1 guided experience: the 5-drop sequence, speech prompts
 * for each step, classification hints, and modal trigger logic.
 * Pure functions only -- no store imports, no Supabase, no React.
 */

// ---------------------------------------------------------------------------
// Training drop prompts
// ---------------------------------------------------------------------------

/**
 * Returns the speech bubble text for the current trainingDropStep.
 * Shown BEFORE the user drops. Steps 0 and 1 are handled elsewhere.
 */
export function getTrainingDropPrompt(step: number): { message: string; duration: number } | null {
  switch (step) {
    case 0:
      return null;
    case 1:
      return null;
    case 2:
      return {
        message:
          'That got things started. Try a task next. What do you need to get done this week?',
        duration: 15000,
      };
    case 3:
      return {
        message: "Your Gremly's halfway there. Now try a habit. What do you want to stick to?",
        duration: 15000,
      };
    case 4:
      return {
        message: 'Almost full. How are you feeling today? That counts too.',
        duration: 15000,
      };
    case 5:
      return {
        message: "Last one till your Gremly's fed. Drop anything on your mind, big or small.",
        duration: 15000,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Classification hints
// ---------------------------------------------------------------------------

export type ClassificationHint = 'todo' | 'habit' | 'journal' | null;

/**
 * Returns a hint to pass to the Mind Drop classification pipeline.
 * The hint is a strong prior that boosts the matching entity type's
 * confidence score. If the user's input is clearly incompatible,
 * the classifier ignores it.
 */
export function getClassificationHint(step: number): ClassificationHint {
  switch (step) {
    case 2:
      return 'todo';
    case 3:
      return 'habit';
    case 4:
      return 'journal';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Modal trigger logic
// ---------------------------------------------------------------------------

export type TrainingModal = 'gauge_explanation' | 'first_fed' | 'sweep_unlock' | null;

/**
 * Determines which modal (if any) should show based on current state.
 * Checked in priority order. Only one modal fires at a time.
 * The caller (CatchAllNotepad) is responsible for showing the modal
 * and calling the corresponding markXSeen() action on dismiss.
 */
export function getNextTrainingModal(state: {
  trainingDropStep: number;
  hasSeenGaugeExplanation: boolean;
  hasSeenFirstFedModal: boolean;
  hasSeenSweepUnlockModal: boolean;
  isFedToday: boolean;
}): TrainingModal {
  if (state.trainingDropStep === 1 && !state.hasSeenGaugeExplanation) {
    return 'gauge_explanation';
  }
  if (state.isFedToday && !state.hasSeenFirstFedModal) {
    return 'first_fed';
  }
  if (state.hasSeenFirstFedModal && !state.hasSeenSweepUnlockModal) {
    return 'sweep_unlock';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contextual speech helpers
// ---------------------------------------------------------------------------

/** Shown after the first-fed modal is dismissed. */
export function getPostFirstFedSpeech(): { message: string; duration: number } {
  return {
    message: 'Tap your Gremly anytime to check progress.',
    duration: 5_000,
  };
}

/** Shown after the Day 2+ meter explanation is dismissed. */
export function getPostMeterDismissSpeech(): { message: string; duration: number } {
  return {
    message: 'Your Gremly resets each day. Drop thoughts to fill it back up.',
    duration: 5_000,
  };
}

/** Shown after the graduation ceremony completes. */
export function getPostGraduationSpeech(): { message: string; duration: number } {
  return {
    message: "Training's done. Keep dropping thoughts and Gremly keeps growing. Simple as that.",
    duration: 6_000,
  };
}
