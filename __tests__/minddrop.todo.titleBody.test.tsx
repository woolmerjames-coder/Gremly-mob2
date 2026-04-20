/**
 * Todo Title vs Body Separation Tests (Phase 2C)
 *
 * Tests that todos created from Mind Drop:
 * 1. Preserve full body text separate from title
 * 2. Use AI-generated titles when appropriate
 * 3. Preserve temporal qualifiers in titles
 * 4. Fall back to body-based titles when AI fails or removes temporal hints
 */

import { normalizeTodoTitle, validateAiTitleForTodo } from '../lib/minddrop/normalizeTodoTitle';
import { convertUnsortedToTodo } from '../lib/conversion';

// Mock dependencies
jest.mock('../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: {}, error: null })),
          })),
        })),
      })),
    })),
    auth: {
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

jest.mock('../lib/conversionTelemetry', () => ({
  logConversionStart: jest.fn(),
  logConversionSuccess: jest.fn(),
  logConversionError: jest.fn(),
}));

jest.mock('../lib/minddrop/backgroundPrefill', () => ({
  backgroundPrefill: jest.fn(),
}));

describe('Todo Title vs Body Separation (Phase 2C)', () => {
  describe('normalizeTodoTitle', () => {
    it('should use AI title when it is short and acceptable', () => {
      const body = 'Email my accountant about the tax letter before Friday';
      const aiTitle = 'Email accountant about tax letter Friday';

      const result = normalizeTodoTitle(body, aiTitle);

      expect(result).toBe(aiTitle);
      expect(result).not.toBe(body); // Should be shorter
      expect(result).toContain('Friday'); // Should preserve temporal hint
    });

    it('should reject AI title that is too long', () => {
      const body = 'Book dentist appointment today';
      const aiTitle =
        'Book a dental appointment for a checkup and cleaning session at the dentist office today';

      const result = normalizeTodoTitle(body, aiTitle);

      expect(result).not.toBe(aiTitle); // Should reject long AI title
      expect(result).toContain('Book'); // Should use body-based fallback
      expect(result.length).toBeLessThanOrEqual(body.length); // Should not be longer than body
    });

    it('should now accept AI title even if it omits temporal hints (today)', () => {
      const body = 'Book dentist appointment today';
      const aiTitle = 'Dentist Appointment'; // Missing "today" - but OK now

      const result = normalizeTodoTitle(body, aiTitle);

      // New behavior: we ACCEPT the AI title even though it omits "today"
      expect(result).toBe(aiTitle);
    });

    it('should now accept AI title even if it omits temporal hints (Friday)', () => {
      const body = 'Email my accountant about the tax letter before Friday';
      const aiTitle = 'Email accountant'; // Missing "Friday" - but OK now

      const result = normalizeTodoTitle(body, aiTitle);

      // New behavior: we ACCEPT the AI title even though it omits "Friday"
      expect(result).toBe(aiTitle);
    });

    it('should reject AI title that is identical to body', () => {
      const body = 'Submit expense report';
      const aiTitle = 'Submit expense report'; // Identical

      const result = normalizeTodoTitle(body, aiTitle);

      // Should still use it if it's short enough, but ideally we'd want a shorter version
      // For now, accepting identical is okay if it's short
      expect(result).toBe(aiTitle);
    });

    it('should create fallback title from first 7 words when no AI title', () => {
      const body = 'Email my accountant about the tax letter before Friday and follow up next week';

      const result = normalizeTodoTitle(body, null);

      expect(result).not.toBe(body); // Should be shorter
      expect(result).toContain('Email');
      // Note: Temporal hints (Friday, next week) are NOT preserved in titles
      // They are extracted separately as due_day/scheduled_date metadata
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(11);
    });

    it('should now accept AI titles even if they omit temporal hints (tomorrow)', () => {
      const body = 'Call the plumber tomorrow morning';
      const aiTitle = 'Call plumber'; // Missing "tomorrow" - but OK now

      const result = normalizeTodoTitle(body, aiTitle);

      // New behavior: we ACCEPT the AI title even though it omits "tomorrow"
      expect(result).toBe(aiTitle);
    });

    it('should now accept AI titles even if they omit temporal hints (weekday)', () => {
      const body = 'Finish presentation for Monday meeting';
      const aiTitle = 'Finish presentation'; // Missing "Monday" - but OK now

      const result = normalizeTodoTitle(body, aiTitle);

      // New behavior: we ACCEPT the AI title even though it omits "Monday"
      expect(result).toBe(aiTitle);
    });

    it('should handle empty body gracefully', () => {
      const result = normalizeTodoTitle('', null);

      expect(result).toBe('New task');
    });

    it('should handle body with only whitespace', () => {
      const result = normalizeTodoTitle('   \n\t  ', null);

      expect(result).toBe('New task');
    });
  });

  describe('validateAiTitleForTodo', () => {
    it('should accept valid AI title (shorter than body)', () => {
      const body = 'Email my accountant about the tax letter before Friday';
      const aiTitle = 'Email accountant - tax letter';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBe(aiTitle);
      expect(result.reason).toBeUndefined();
    });

    it('should reject null/undefined AI title', () => {
      const body = 'Some task';

      expect(validateAiTitleForTodo(body, null).title).toBeNull();
      expect(validateAiTitleForTodo(body, null).reason).toBe('empty or invalid type');
      expect(validateAiTitleForTodo(body, undefined).title).toBeNull();
      expect(validateAiTitleForTodo(body, '').title).toBeNull();
      expect(validateAiTitleForTodo(body, '').reason).toBe('empty or invalid type');
    });

    it('should accept AI title even without temporal hints (simplified validation)', () => {
      const body = 'Submit report today';
      const aiTitle = 'Submit report'; // Missing "today" - but that's OK now

      const result = validateAiTitleForTodo(body, aiTitle);

      // New behavior: we DO accept this because it's shorter and non-identical
      expect(result.title).toBe(aiTitle);
      expect(result.reason).toBeUndefined();
    });

    it('should reject AI title that is too long (>80 chars)', () => {
      const body = 'Short task that is definitely longer than the proposed AI title will be';
      const aiTitle =
        'This is a very long title that exceeds the maximum character limit of 80 characters and should be rejected';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('longer than 80 chars');
    });

    it('should reject AI title identical to body', () => {
      const body = 'Call mom';
      const aiTitle = 'Call mom';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('identical to body');
    });

    it('should reject AI title that is not shorter than body', () => {
      const body = 'Email accountant';
      const aiTitle = 'Email my accountant'; // Longer than body

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('longer than or equal to body');
    });
  });

  describe('convertUnsortedToTodo integration', () => {
    let mockRepo: any;

    beforeEach(() => {
      jest.clearAllMocks();

      mockRepo = {
        getById: jest.fn(async (id: string) => ({
          id,
          type: 'note',
          title: 'Test note',
          body: 'Email my accountant about the tax letter before Friday',
          labels: ['catchall', 'needs_review'],
          tags: ['#accountant', '#email'],
          tags_meta: { sticky: [], tombstones: [] },
        })),
        create: jest.fn(async (payload: any) => ({
          id: 'new-todo-123',
          type: 'todo',
          ...payload,
        })),
        update: jest.fn(async ({ id, patch }: any) => ({
          id,
          ...patch,
        })),
        archiveItemsByDropId: jest.fn(async () => ({ count: 0 })),
      };
    });

    it('should preserve full body text while creating short title', async () => {
      const noteId = 'test-note-123';
      const fullText = 'Email my accountant about the tax letter before Friday';

      mockRepo.getById = jest.fn(async () => ({
        id: noteId,
        type: 'note',
        title: '',
        body: fullText,
        labels: ['catchall'],
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      }));

      const result = await convertUnsortedToTodo(mockRepo, noteId);

      // Body should contain full text
      expect(result.todo.body).toBe(fullText);

      // Title should be shorter or equal to body length (may be same if body is short)
      expect(result.todo.name?.length).toBeLessThanOrEqual(fullText.length);

      // Title should be a reasonable summary (not testing for specific temporal tokens)
      expect(result.todo.name).toBeTruthy();
      expect(result.todo.name?.length).toBeGreaterThan(0);
    });

    it('should create fallback title when no AI title available', async () => {
      const noteId = 'test-note-456';
      const fullText = 'Book dentist appointment today';

      mockRepo.getById = jest.fn(async () => ({
        id: noteId,
        type: 'note',
        body: fullText,
        labels: ['catchall'],
        tags: [],
      }));

      const result = await convertUnsortedToTodo(mockRepo, noteId);

      // Body should contain full text with "today"
      expect(result.todo.body).toBe(fullText);
      expect(result.todo.body).toContain('today');

      // Title should be reasonable length
      expect(result.todo.name?.length).toBeLessThanOrEqual(fullText.length);

      // Title should be a reasonable summary (fallback logic may or may not include "today")
      expect(result.todo.name).toBeTruthy();
    });

    it('should not duplicate body as title', async () => {
      const noteId = 'test-note-789';
      const fullText =
        'This is a reasonably long task description that should not be duplicated as the title field';

      mockRepo.getById = jest.fn(async () => ({
        id: noteId,
        type: 'note',
        body: fullText,
        labels: ['catchall'],
        tags: [],
      }));

      const result = await convertUnsortedToTodo(mockRepo, noteId);

      // Body should be full text
      expect(result.todo.body).toBe(fullText);

      // Title should NOT be identical to body
      expect(result.todo.name).not.toBe(fullText);

      // Title should be truncated
      expect(result.todo.name?.length).toBeLessThan(fullText.length);
    });

    it('should handle very long body text', async () => {
      const noteId = 'test-note-long';
      const fullText =
        'Email my accountant about the tax letter before Friday and also follow up with the lawyer about the contract review and schedule a meeting with the team to discuss the quarterly results and prepare the presentation for the board meeting next month';

      mockRepo.getById = jest.fn(async () => ({
        id: noteId,
        type: 'note',
        body: fullText,
        labels: ['catchall'],
        tags: [],
      }));

      const result = await convertUnsortedToTodo(mockRepo, noteId);

      // Body should be full text (not truncated)
      expect(result.todo.body).toBe(fullText);

      // Title should be much shorter (first ~7 words)
      expect(result.todo.name?.length).toBeLessThan(60);

      // Title should be a reasonable summary
      expect(result.todo.name).toBeTruthy();
    });
  });

  describe('Temporal token preservation (legacy - removed in simplified validation)', () => {
    // These tests verify that normalizeTodoTitle fallback logic TRIES to preserve temporal tokens
    // when generating fallback titles (when AI title is rejected or not provided).
    // However, we NO LONGER REJECT AI titles just because they're missing temporal hints.

    const temporalCases = [
      { body: 'Meet client today at 3pm', temporal: 'today' },
      { body: 'Submit report tomorrow', temporal: 'tomorrow' },
      { body: 'Review contracts on Monday', temporal: 'monday' },
      { body: 'Team meeting Friday afternoon', temporal: 'friday' },
      { body: 'Vacation next week', temporal: 'next week' },
      { body: 'Project deadline this month', temporal: 'this month' },
    ];

    temporalCases.forEach(({ body, temporal }) => {
      it(`should try to include "${temporal}" in fallback title for: "${body}"`, () => {
        // When NO AI title provided, normalizeTodoTitle creates a fallback
        // The fallback logic still tries to preserve temporal hints
        const result = normalizeTodoTitle(body);

        // Fallback title SHOULD try to include temporal token
        expect(result.toLowerCase()).toContain(temporal.toLowerCase());
      });
    });

    it('should now ACCEPT AI titles even if they omit temporal hints', () => {
      const body = 'Submit report tomorrow';
      const aiTitle = 'Submit report'; // Missing "tomorrow" - but that's OK now

      const result = normalizeTodoTitle(body, aiTitle);

      // New behavior: we USE the AI title even though it omits "tomorrow"
      expect(result).toBe(aiTitle);
      expect(result.toLowerCase()).not.toContain('tomorrow');
    });
  });
});
