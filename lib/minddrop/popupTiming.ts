/**
 * The order things happen in after a Mind Drop question is answered: the
 * popup shows its tick, fades out, and only then do the cards slide away and
 * the toast come in. One thing at a time, so each is seen.
 */

/** How long the clarification popup shows "Great, on it" before it closes. */
export const CLARIFY_CONFIRM_MS = 1000;

/** A popup's fade out as it closes (a React Native Modal, animationType fade). */
export const POPUP_FADE_MS = 350;

/** The toast comes in a beat after the cards start to slide. */
export const TOAST_AFTER_CARDS_MS = 150;

/** The tick after keeping a drop that has another question: short, as the question follows. */
export const NEXT_QUESTION_CONFIRM_MS = 700;
