/**
 * What Gremly's bubble says when a drop's reaction arrives (Mind Drop rethink
 * stage 10). The reaction is the only comment on a drop: it comes as the card
 * sorts and never repeats the card, so there is no follow up line (the
 * question or the split is already on the card). When the title call failed
 * the reaction is null and the bubble uses its own line after a drop, as
 * before.
 *
 * The guided training drops keep their own shape: on the first, the reaction
 * waits for the gauge card to close (CatchAllNotepad's
 * pendingTrainingReactionRef); on the next three it comes with the training
 * prompt.
 *
 * Pure, so the listener in CatchAllNotepad and the tests read the same rules.
 */

export type ReactionSpeech =
  /** the first guided drop: held for the gauge card */
  | { show: 'hold'; reaction: string | null }
  /** a guided drop after the first: the reaction, then the next prompt */
  | { show: 'training'; message: string }
  /** any other drop: the reaction, or the bubble's own line when there is none */
  | { show: 'reaction'; message: string; fromPool: boolean }
  | { show: 'nothing' };

export interface ReactionSpeechContext {
  /** The guided training drop this is (1 to 4), or null outside training. */
  trainingStep: number | null;
  trainingPrompt: (step: number) => { message: string } | null;
  /** The bubble's own line after a drop, for a reaction that never came. */
  poolLine: () => string | null;
}

export function reactionSpeechOf(
  payload: { message: string | null; rawReaction: string | null },
  ctx: ReactionSpeechContext,
): ReactionSpeech {
  const step = ctx.trainingStep;
  if (step !== null && step >= 1 && step <= 4) {
    if (step === 1) return { show: 'hold', reaction: payload.rawReaction || null };
    const prompt = ctx.trainingPrompt(step + 1);
    if (!prompt) return { show: 'nothing' };
    const reaction = payload.rawReaction || '';
    return {
      show: 'training',
      message: reaction ? reaction + '\n\n' + prompt.message : prompt.message,
    };
  }
  if (payload.message) return { show: 'reaction', message: payload.message, fromPool: false };
  const line = ctx.poolLine();
  return line ? { show: 'reaction', message: line, fromPool: true } : { show: 'nothing' };
}
