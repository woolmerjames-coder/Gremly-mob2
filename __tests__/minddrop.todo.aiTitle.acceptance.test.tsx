/**
 * Test to demonstrate the simplified AI title validation logic
 * that now accepts good AI titles even without temporal hints
 */

import { validateAiTitleForTodo } from '../lib/minddrop/normalizeTodoTitle';

describe('AI Title Acceptance (Simplified Validation)', () => {
  describe('Real-world examples that are now ACCEPTED', () => {
    it('should accept "Email Accountant about Tax Letter" even without temporal hint', () => {
      const body = 'Email my accountant about the tax letter before Friday';
      const aiTitle = 'Email Accountant about Tax Letter';

      const result = validateAiTitleForTodo(body, aiTitle);

      // ✅ ACCEPTED: aiTitle is shorter, non-identical, and reasonable
      expect(result.title).toBe(aiTitle);
      expect(result.reason).toBeUndefined();
    });

    it('should accept "Submit Report" even without "tomorrow"', () => {
      const body = 'Submit the quarterly financial report tomorrow morning';
      const aiTitle = 'Submit Report';

      const result = validateAiTitleForTodo(body, aiTitle);

      // ✅ ACCEPTED: aiTitle is shorter and non-identical
      expect(result.title).toBe(aiTitle);
      expect(result.reason).toBeUndefined();
    });

    it('should accept "Book Dentist Appointment" even without "today"', () => {
      const body = 'Book dentist appointment for cleaning today at 3pm';
      const aiTitle = 'Book Dentist Appointment';

      const result = validateAiTitleForTodo(body, aiTitle);

      // ✅ ACCEPTED: aiTitle is shorter and non-identical
      expect(result.title).toBe(aiTitle);
      expect(result.reason).toBeUndefined();
    });

    it('should accept "Review Contracts" even without "Monday"', () => {
      const body = 'Review the vendor contracts before Monday meeting';
      const aiTitle = 'Review Contracts';

      const result = validateAiTitleForTodo(body, aiTitle);

      // ✅ ACCEPTED: aiTitle is shorter and non-identical
      expect(result.title).toBe(aiTitle);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('Rejection cases (still enforced)', () => {
    it('should reject AI title identical to body', () => {
      const body = 'Call mom';
      const aiTitle = 'Call mom';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('identical to body');
    });

    it('should reject AI title that is too long (>80 chars)', () => {
      const body = 'Short task description that needs a very detailed explanation';
      const aiTitle =
        'This is an extremely long AI title that exceeds the eighty character limit for todo titles';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('longer than 80 chars');
    });

    it('should reject AI title that is longer than body', () => {
      const body = 'Quick task';
      const aiTitle = 'This is a much longer title than the original body text';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('longer than or equal to body');
    });

    it('should reject empty AI title', () => {
      const body = 'Some task';
      const aiTitle = '   ';

      const result = validateAiTitleForTodo(body, aiTitle);

      expect(result.title).toBeNull();
      expect(result.reason).toBe('empty after trim');
    });
  });

  describe('Simplified validation rules summary', () => {
    it('validates: non-empty, non-identical, ≤80 chars, shorter than body', () => {
      const testCases = [
        {
          body: 'Call John about the project update meeting tomorrow at 10am',
          aiTitle: 'Call John',
          expected: true,
          reason: 'Short, non-identical, within limits',
        },
        {
          body: 'Buy groceries',
          aiTitle: 'Buy groceries',
          expected: false,
          reason: 'Identical to body',
        },
        {
          body: 'Review document',
          aiTitle: 'Review the important document for approval',
          expected: false,
          reason: 'Longer than body',
        },
        {
          body: 'Send email to team about the upcoming conference and registration details',
          aiTitle: 'Send Email',
          expected: true,
          reason: 'Short, non-identical, within limits',
        },
      ];

      testCases.forEach(({ body, aiTitle, expected, reason: description }) => {
        const result = validateAiTitleForTodo(body, aiTitle);
        const accepted = result.title !== null;

        expect(accepted).toBe(expected);
        // Just for documentation
        if (!accepted && result.reason) {
          expect(result.reason).toBeTruthy();
        }
      });
    });
  });
});
