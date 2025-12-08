/**
 * Unit tests for meta-intent detection system
 */

import {
  detectSaveThisIntent,
  detectSummaryIntent,
  extractInlineContent,
  mightBeMetaIntent,
  explicitTypeToSaveableType,
  SaveThisIntent,
  ExplicitSaveType,
} from '../../lib/chat/metaIntents';

describe('metaIntents', () => {
  describe('detectSaveThisIntent', () => {
    describe('basic save requests', () => {
      test.each(['save this', 'save that', 'Save this', 'SAVE THIS', 'save it'])(
        'detects "%s" as save request',
        (text) => {
          const result = detectSaveThisIntent(text);
          expect(result).not.toBeNull();
          expect(result?.isSaveRequest).toBe(true);
          expect(result?.explicitType).toBe('auto');
        },
      );
    });

    describe('polite save requests', () => {
      test.each([
        'can you save this',
        'can you save this for me',
        'please save this',
        'please save that',
      ])('detects "%s" as save request', (text) => {
        const result = detectSaveThisIntent(text);
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('auto');
      });
    });

    describe('remember/keep requests', () => {
      test.each([
        'remember this',
        'remember that',
        'keep this',
        'keep that',
        "don't let me forget this",
        'do not let me forget this',
      ])('detects "%s" as save request', (text) => {
        expect(detectSaveThisIntent(text)).not.toBeNull();
      });
    });

    describe('note requests', () => {
      test.each(['note this', 'note that', 'note this down', 'take note of this'])(
        'detects "%s" as save request',
        (text) => {
          expect(detectSaveThisIntent(text)).not.toBeNull();
        },
      );
    });

    describe('"I want to" requests', () => {
      test.each([
        'I want to save this',
        'I want to remember this',
        'I want to keep this',
        "I'd like to save this",
        'I would like to save this',
      ])('detects "%s" as save request', (text) => {
        expect(detectSaveThisIntent(text)).not.toBeNull();
      });
    });

    describe('type-specific requests', () => {
      test('detects "make this a todo"', () => {
        const result = detectSaveThisIntent('make this a todo');
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('todo');
      });

      test('detects "make this a task"', () => {
        const result = detectSaveThisIntent('make this a task');
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('todo');
      });

      test('detects "turn this into a habit"', () => {
        const result = detectSaveThisIntent('turn this into a habit');
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('habit');
      });

      test('detects "add this as a note"', () => {
        const result = detectSaveThisIntent('add this as a note');
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('note');
      });

      test('detects "create this as a log"', () => {
        const result = detectSaveThisIntent('create this as a log');
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('note');
      });

      test('detects "save this as a todo"', () => {
        const result = detectSaveThisIntent('save this as a todo');
        expect(result).not.toBeNull();
        expect(result?.explicitType).toBe('todo');
      });
    });

    describe('non-save requests', () => {
      test.each([
        'what should I do',
        'help me plan',
        'I want to exercise',
        'save the world',
        'this is great',
        'how do I save money',
        'save me some time',
        'remember when we talked',
        'keep going',
      ])('returns null for "%s"', (text) => {
        expect(detectSaveThisIntent(text)).toBeNull();
      });
    });

    describe('edge cases', () => {
      test('handles empty string', () => {
        expect(detectSaveThisIntent('')).toBeNull();
      });

      test('handles null/undefined gracefully', () => {
        expect(detectSaveThisIntent(null as unknown as string)).toBeNull();
        expect(detectSaveThisIntent(undefined as unknown as string)).toBeNull();
      });

      test('handles whitespace', () => {
        expect(detectSaveThisIntent('  save this  ')).not.toBeNull();
      });
    });
  });

  describe('detectSummaryIntent', () => {
    describe('direct summary requests', () => {
      test.each([
        'give me a summary',
        'summary',
        'a summary',
        'summary of this chat',
        'summary of our conversation',
      ])('detects "%s" as summary request', (text) => {
        expect(detectSummaryIntent(text)).toBe(true);
      });
    });

    describe('summarize requests', () => {
      test.each([
        'summarize this chat',
        'summarize our conversation',
        'summarise this chat',
        'summarise our conversation',
        'summarize',
        'summarise',
      ])('detects "%s" as summary request', (text) => {
        expect(detectSummaryIntent(text)).toBe(true);
      });
    });

    describe('recap requests', () => {
      test.each(['recap', 'recap this chat', 'recap our conversation', 'give me a recap'])(
        'detects "%s" as summary request',
        (text) => {
          expect(detectSummaryIntent(text)).toBe(true);
        },
      );
    });

    describe('discussion questions', () => {
      test.each([
        'what have we discussed',
        'what have we talked about',
        'what did we talk about',
        'what did we discuss',
        'what have we covered',
      ])('detects "%s" as summary request', (text) => {
        expect(detectSummaryIntent(text)).toBe(true);
      });
    });

    describe('informal requests', () => {
      test.each(['catch me up', "what's the tldr", 'what is the tl;dr', 'tldr', 'tl;dr'])(
        'detects "%s" as summary request',
        (text) => {
          expect(detectSummaryIntent(text)).toBe(true);
        },
      );
    });

    describe('non-summary requests', () => {
      test.each([
        'how are you',
        'I want to plan something',
        'summary of the book',
        'can you help me',
        'save this',
        'remember this',
        'what should I do',
      ])('returns false for "%s"', (text) => {
        expect(detectSummaryIntent(text)).toBe(false);
      });
    });

    describe('edge cases', () => {
      test('handles empty string', () => {
        expect(detectSummaryIntent('')).toBe(false);
      });

      test('handles null/undefined gracefully', () => {
        expect(detectSummaryIntent(null as unknown as string)).toBe(false);
        expect(detectSummaryIntent(undefined as unknown as string)).toBe(false);
      });
    });
  });

  describe('extractInlineContent', () => {
    describe('save this: content', () => {
      test('extracts content after "save this:"', () => {
        expect(extractInlineContent('save this: call dentist tomorrow')).toBe(
          'call dentist tomorrow',
        );
      });

      test('extracts content after "save that:"', () => {
        expect(extractInlineContent('save that: buy groceries')).toBe('buy groceries');
      });
    });

    describe('remember this: content', () => {
      test('extracts content after "remember this:"', () => {
        expect(extractInlineContent('remember this: buy milk')).toBe('buy milk');
      });

      test('extracts content after "remember that:"', () => {
        expect(extractInlineContent('remember that: meeting at 3pm')).toBe('meeting at 3pm');
      });
    });

    describe('note this: content', () => {
      test('extracts content after "note this:"', () => {
        expect(extractInlineContent('note this: important idea')).toBe('important idea');
      });

      test('extracts content after "note:"', () => {
        expect(extractInlineContent('note: check email')).toBe('check email');
      });
    });

    describe('no inline content', () => {
      test('returns null for regular save request', () => {
        expect(extractInlineContent('save this')).toBeNull();
      });

      test('returns null for non-save text', () => {
        expect(extractInlineContent('hello world')).toBeNull();
      });

      test('returns null for empty content after colon', () => {
        expect(extractInlineContent('save this:   ')).toBeNull();
      });
    });

    describe('edge cases', () => {
      test('handles empty string', () => {
        expect(extractInlineContent('')).toBeNull();
      });

      test('handles null/undefined gracefully', () => {
        expect(extractInlineContent(null as unknown as string)).toBeNull();
        expect(extractInlineContent(undefined as unknown as string)).toBeNull();
      });

      test('preserves content with colons', () => {
        expect(extractInlineContent('save this: time is 3:30 pm')).toBe('time is 3:30 pm');
      });
    });
  });

  describe('mightBeMetaIntent', () => {
    test('returns true for save-related words', () => {
      expect(mightBeMetaIntent('save this')).toBe(true);
      expect(mightBeMetaIntent('remember that')).toBe(true);
      expect(mightBeMetaIntent('keep this note')).toBe(true);
    });

    test('returns true for summary-related words', () => {
      expect(mightBeMetaIntent('give me a summary')).toBe(true);
      expect(mightBeMetaIntent('summarize please')).toBe(true);
      expect(mightBeMetaIntent('recap this')).toBe(true);
      expect(mightBeMetaIntent('tldr')).toBe(true);
    });

    test('returns false for regular messages', () => {
      expect(mightBeMetaIntent('how are you')).toBe(false);
      expect(mightBeMetaIntent('I want to exercise')).toBe(false);
      expect(mightBeMetaIntent('what should I do')).toBe(false);
    });

    test('handles edge cases', () => {
      expect(mightBeMetaIntent('')).toBe(false);
      expect(mightBeMetaIntent(null as unknown as string)).toBe(false);
    });
  });

  describe('explicitTypeToSaveableType', () => {
    test('converts todo to SaveableType', () => {
      expect(explicitTypeToSaveableType('todo')).toBe('todo');
    });

    test('converts habit to SaveableType', () => {
      expect(explicitTypeToSaveableType('habit')).toBe('habit');
    });

    test('converts note to log-general', () => {
      expect(explicitTypeToSaveableType('note')).toBe('log-general');
    });

    test('returns null for auto', () => {
      expect(explicitTypeToSaveableType('auto')).toBeNull();
    });
  });
});
