/**
 * The bubble's reaction to a drop (Mind Drop rethink stage 10): the reaction
 * alone, never a follow up line, the bubble's own line only when the title
 * call failed, and the guided training drops as before.
 */
import { reactionSpeechOf, type ReactionSpeechContext } from '../reactionSpeech';
import { getTrainingDropPrompt } from '../../training/trainingFlow';

const ctx = (over: Partial<ReactionSpeechContext> = {}): ReactionSpeechContext => ({
  trainingStep: null,
  trainingPrompt: getTrainingDropPrompt,
  poolLine: jest.fn(() => 'Grabbed it.'),
  ...over,
});

const payload = (message: string | null, followUp: 'multi' | 'clarify' | null = null) => ({
  localId: 'd-1',
  message,
  rawReaction: message,
  followUp,
});

describe('reactionSpeechOf', () => {
  it('shows the reaction alone', () => {
    const c = ctx();
    expect(reactionSpeechOf(payload('She will love that.'), c)).toEqual({
      show: 'reaction',
      message: 'She will love that.',
      fromPool: false,
    });
    expect(c.poolLine).not.toHaveBeenCalled();
  });

  it('never shows a follow up line, even when an older payload still names one', () => {
    for (const followUp of ['multi', 'clarify'] as const) {
      expect(reactionSpeechOf(payload('Two things, both safe.', followUp), ctx())).toEqual({
        show: 'reaction',
        message: 'Two things, both safe.',
        fromPool: false,
      });
    }
  });

  it("uses the bubble's own line when the title call failed, for any drop", () => {
    expect(reactionSpeechOf(payload(null, 'clarify'), ctx())).toEqual({
      show: 'reaction',
      message: 'Grabbed it.',
      fromPool: true,
    });
    expect(reactionSpeechOf(payload(null), ctx({ poolLine: () => null }))).toEqual({
      show: 'nothing',
    });
  });

  it('holds the first guided drop’s reaction for the gauge card', () => {
    expect(reactionSpeechOf(payload('Pepper time!'), ctx({ trainingStep: 1 }))).toEqual({
      show: 'hold',
      reaction: 'Pepper time!',
    });
    expect(reactionSpeechOf(payload(null), ctx({ trainingStep: 1 }))).toEqual({
      show: 'hold',
      reaction: null,
    });
  });

  it('gives guided drops two to four the reaction, then the next prompt', () => {
    for (const step of [2, 3, 4]) {
      const prompt = getTrainingDropPrompt(step + 1)!.message;
      expect(reactionSpeechOf(payload('Nice.'), ctx({ trainingStep: step }))).toEqual({
        show: 'training',
        message: 'Nice.\n\n' + prompt,
      });
      expect(reactionSpeechOf(payload(null), ctx({ trainingStep: step }))).toEqual({
        show: 'training',
        message: prompt,
      });
    }
  });

  it('never uses the bubble’s own line during training', () => {
    const c = ctx({ trainingStep: 3 });
    reactionSpeechOf(payload(null), c);
    expect(c.poolLine).not.toHaveBeenCalled();
  });
});
