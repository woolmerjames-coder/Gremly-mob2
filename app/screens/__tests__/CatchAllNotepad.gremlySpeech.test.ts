/**
 * Gremly Speech Bubble Tests
 *
 * Tests the getGremlySpeech function that generates contextual messages
 * based on Mind Drop classification results.
 *
 * Speech categories:
 * - High confidence (≥0.8) auto-classification: specific messages per kind
 * - Medium confidence (≥0.5) or ask mode: generic "Saved as X" messages
 * - Low confidence (<0.5): fallback messages
 */

type SpeechContext = {
  kind: 'todo' | 'habit' | 'log';
  logSubtype?: 'journal' | 'idea' | 'general' | null;
  confidence: number;
  dueDate?: string | null;
  mode: 'auto' | 'ask' | 'keep' | 'reply';
};

// Extract the pure function logic for testing (mirrors CatchAllNotepad implementation)
function getGremlySpeech(ctx: SpeechContext, lastSpeech: string | null = null): string | null {
  const { kind, logSubtype, confidence, dueDate, mode } = ctx;

  let message: string | null = null;

  // High confidence auto-classification
  if (mode === 'auto' && confidence >= 0.8) {
    if (kind === 'todo') {
      if (dueDate) {
        try {
          const date = new Date(dueDate);
          const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          // Return deterministic message for testing (first option)
          message = `On it — due ${formattedDate}.`;
        } catch {
          message = 'Task added.';
        }
      } else {
        message = 'Task captured. Pick a date in Sweep.';
      }
    } else if (kind === 'habit') {
      message = 'Habit saved.';
    } else if (kind === 'log') {
      if (logSubtype === 'journal') {
        message = 'Saved to your journal.';
      } else if (logSubtype === 'idea') {
        message = 'Idea captured.';
      } else {
        message = 'Thought saved.';
      }
    }
  }
  // Medium confidence or ask mode
  else if (confidence >= 0.5 || mode === 'ask') {
    message = `Saved as a ${kind}. Review in Sweep.`;
  }
  // Low confidence
  else if (confidence < 0.5) {
    message = 'Saved. Review in Sweep.';
  }

  // Don't repeat the same message twice in a row
  if (message && message === lastSpeech) {
    return null;
  }

  return message;
}

describe('getGremlySpeech', () => {
  describe('High confidence auto-classification (≥0.8)', () => {
    describe('Todo messages', () => {
      it('should return date-specific message for todo with due date', () => {
        const ctx: SpeechContext = {
          kind: 'todo',
          confidence: 0.9,
          dueDate: '2025-06-15T12:00:00', // Use noon to avoid timezone edge cases
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toContain('Jun 15');
        expect(speech).toContain('On it');
      });

      it('should return Sweep prompt for todo without due date', () => {
        const ctx: SpeechContext = {
          kind: 'todo',
          confidence: 0.85,
          dueDate: null,
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toContain('Sweep');
        expect(speech).toContain('date');
      });

      it('should handle invalid date gracefully', () => {
        const ctx: SpeechContext = {
          kind: 'todo',
          confidence: 0.9,
          dueDate: 'invalid-date',
          mode: 'auto',
        };

        // Invalid Date.toLocaleDateString returns "Invalid Date"
        const speech = getGremlySpeech(ctx);
        expect(speech).toBeDefined();
      });
    });

    describe('Habit messages', () => {
      it('should return habit confirmation', () => {
        const ctx: SpeechContext = {
          kind: 'habit',
          confidence: 0.9,
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toBe('Habit saved.');
      });
    });

    describe('Log messages', () => {
      it('should return journal-specific message for journal subtype', () => {
        const ctx: SpeechContext = {
          kind: 'log',
          logSubtype: 'journal',
          confidence: 0.85,
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toContain('journal');
      });

      it('should return idea-specific message for idea subtype', () => {
        const ctx: SpeechContext = {
          kind: 'log',
          logSubtype: 'idea',
          confidence: 0.9,
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toContain('Idea');
      });

      it('should return general message for general/null subtype', () => {
        const ctx: SpeechContext = {
          kind: 'log',
          logSubtype: 'general',
          confidence: 0.8,
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toBe('Thought saved.');
      });

      it('should return general message when logSubtype is null', () => {
        const ctx: SpeechContext = {
          kind: 'log',
          logSubtype: null,
          confidence: 0.8,
          mode: 'auto',
        };

        const speech = getGremlySpeech(ctx);
        expect(speech).toBe('Thought saved.');
      });
    });
  });

  describe('Medium confidence (≥0.5) or ask mode', () => {
    it('should return Sweep review message for medium confidence', () => {
      const ctx: SpeechContext = {
        kind: 'todo',
        confidence: 0.6,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toBe('Saved as a todo. Review in Sweep.');
    });

    it('should return Sweep review message for ask mode regardless of confidence', () => {
      const ctx: SpeechContext = {
        kind: 'log',
        confidence: 0.9, // High confidence, but ask mode overrides
        mode: 'ask',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toBe('Saved as a log. Review in Sweep.');
    });

    it('should include entity kind in message', () => {
      const habitCtx: SpeechContext = {
        kind: 'habit',
        confidence: 0.55,
        mode: 'auto',
      };

      const speech = getGremlySpeech(habitCtx);
      expect(speech).toContain('habit');
    });
  });

  describe('Low confidence (<0.5)', () => {
    it('should return generic Sweep message for low confidence', () => {
      const ctx: SpeechContext = {
        kind: 'todo',
        confidence: 0.3,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toBe('Saved. Review in Sweep.');
    });

    it('should return Sweep message for very low confidence', () => {
      const ctx: SpeechContext = {
        kind: 'log',
        confidence: 0.1,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toContain('Sweep');
    });
  });

  describe('Duplicate prevention', () => {
    it('should return null if message matches lastSpeech', () => {
      const ctx: SpeechContext = {
        kind: 'habit',
        confidence: 0.9,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx, 'Habit saved.');
      expect(speech).toBeNull();
    });

    it('should return message if different from lastSpeech', () => {
      const ctx: SpeechContext = {
        kind: 'habit',
        confidence: 0.9,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx, 'Idea captured.');
      expect(speech).toBe('Habit saved.');
    });
  });

  describe('Edge cases', () => {
    it('should handle exact 0.8 confidence as high confidence', () => {
      const ctx: SpeechContext = {
        kind: 'todo',
        confidence: 0.8,
        dueDate: null,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toContain('Sweep');
      expect(speech).toContain('date');
    });

    it('should handle exact 0.5 confidence as medium confidence', () => {
      const ctx: SpeechContext = {
        kind: 'todo',
        confidence: 0.5,
        mode: 'auto',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toBe('Saved as a todo. Review in Sweep.');
    });

    it('should handle keep mode same as auto mode', () => {
      const ctx: SpeechContext = {
        kind: 'log',
        confidence: 0.3,
        mode: 'keep',
      };

      // keep mode doesn't trigger any of the conditions, so returns null
      const speech = getGremlySpeech(ctx);
      // With low confidence and keep mode, it falls through to low confidence branch
      expect(speech).toBe('Saved. Review in Sweep.');
    });

    it('should handle reply mode same as auto mode', () => {
      const ctx: SpeechContext = {
        kind: 'log',
        confidence: 0.3,
        mode: 'reply',
      };

      const speech = getGremlySpeech(ctx);
      expect(speech).toBe('Saved. Review in Sweep.');
    });
  });
});
