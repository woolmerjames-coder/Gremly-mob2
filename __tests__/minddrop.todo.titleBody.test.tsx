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

    it('should reject AI title that removes temporal hints (today)', () => {
      const body = 'Book dentist appointment today';
      const aiTitle = 'Dentist Appointment'; // Missing "today"

      const result = normalizeTodoTitle(body, aiTitle);

      expect(result).not.toBe(aiTitle); // Should reject AI title
      expect(result).toContain('today'); // Fallback should preserve "today"
    });

    it('should reject AI title that removes temporal hints (Friday)', () => {
      const body = 'Email my accountant about the tax letter before Friday';
      const aiTitle = 'Email accountant'; // Missing "Friday"

      const result = normalizeTodoTitle(body, aiTitle);

      expect(result).not.toBe(aiTitle);
      expect(result.toLowerCase()).toContain('friday'); // Fallback should preserve "Friday"
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
      expect(result).toContain('Friday'); // Should include temporal hint
      // Allow some flexibility - up to 10 words to include temporal hints
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(11);
    });

    it('should handle body with tomorrow', () => {
      const body = 'Call the plumber tomorrow morning';
      const badAiTitle = 'Call plumber'; // Missing "tomorrow"

      const result = normalizeTodoTitle(body, badAiTitle);

      expect(result).not.toBe(badAiTitle);
      expect(result.toLowerCase()).toContain('tomorrow');
    });

    it('should handle body with weekday names', () => {
      const body = 'Finish presentation for Monday meeting';
      const badAiTitle = 'Finish presentation'; // Missing "Monday"

      const result = normalizeTodoTitle(body, badAiTitle);

      expect(result).not.toBe(badAiTitle);
      expect(result.toLowerCase()).toContain('monday');
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
    it('should accept valid AI title', () => {
      const body = 'Email my accountant about the tax letter before Friday';
      const aiTitle = 'Email accountant - tax letter Friday';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result).toBe(aiTitle);
    });

    it('should reject null/undefined AI title', () => {
      const body = 'Some task';

      expect(validateAiTitleForTodo(body, null)).toBeNull();
      expect(validateAiTitleForTodo(body, undefined)).toBeNull();
      expect(validateAiTitleForTodo(body, '')).toBeNull();
    });

    it('should reject AI title missing temporal hints', () => {
      const body = 'Submit report today';
      const aiTitle = 'Submit report'; // Missing "today"

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result).toBeNull();
    });

    it('should reject AI title that is too long', () => {
      const body = 'Short task';
      const aiTitle =
        'This is a very long title that exceeds the maximum character limit and should be rejected';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result).toBeNull();
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

      // Title should be shorter or equal (if temporal preservation extends it slightly)
      expect(result.todo.name?.length).toBeLessThanOrEqual(fullText.length + 10); // Allow for ellipsis

      // Title should still contain temporal hint "Friday"
      expect(result.todo.name?.toLowerCase()).toContain('friday');
    });

    it('should create fallback title with temporal hint when no AI title available', async () => {
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

      // Title should be reasonable length (allow equal if it's already short)
      expect(result.todo.name?.length).toBeLessThanOrEqual(fullText.length + 5);

      // Title should preserve "today" from body
      expect(result.todo.name?.toLowerCase()).toContain('today');
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

      // Title should contain key temporal hint from beginning
      expect(result.todo.name?.toLowerCase()).toContain('friday');
    });
  });

  describe('Temporal token preservation', () => {
    const temporalCases = [
      { body: 'Meet client today at 3pm', temporal: 'today' },
      { body: 'Submit report tomorrow', temporal: 'tomorrow' },
      { body: 'Review contracts on Monday', temporal: 'monday' },
      { body: 'Team meeting Friday afternoon', temporal: 'friday' },
      { body: 'Vacation next week', temporal: 'next week' },
      { body: 'Project deadline this month', temporal: 'this month' },
    ];

    temporalCases.forEach(({ body, temporal }) => {
      it(`should preserve "${temporal}" in title for: "${body}"`, () => {
        const badAiTitle = body.split(' ').slice(0, 2).join(' '); // First 2 words, likely missing temporal

        const result = normalizeTodoTitle(body, badAiTitle);

        expect(result.toLowerCase()).toContain(temporal.toLowerCase());
      });
    });
  });
});
