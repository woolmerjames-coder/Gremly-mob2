/**
 * Sacred Golden Test Suite for Master Classifier Spec
 *
 * These tests define the canonical behavior of Mind Drop classification.
 * Changes to these tests should be treated as spec changes and reviewed carefully.
 *
 * Phase 0: Establishes the golden truth without changing existing runtime behavior.
 */

import {
  getPreferredMasterCategoryFromTextOnly,
  type MasterCategory,
  isTodoLike,
  isHabitLike,
  looksLikeJournal,
  looksLikeIdea,
  hasRealWords,
} from '../masterClassifierSpec';

describe('Master Classifier Spec - Sacred Golden Tests', () => {
  describe('hasRealWords - gibberish detection', () => {
    it.each([
      // Gibberish cases (should return false)
      ['asdfghjkl', false],
      ['qwertyuiop', false],
      ['test test test', false],
      ['...', false],
      ['123', false],
      ['xxxxxxxxxx', false],
      ['     ', false],
      ['ajshdfkjahsdf', false],
      ['@@@@@@', false],
      ['', false],
      ['x', false],
      ['12', false],
      ['!!!', false],
      ['aaa', false],

      // Real content (should return true)
      ['Hello world', true],
      ['Buy milk', true],
      ['Feeling anxious', true],
      ['Meeting at 3pm', true],
      ['App idea: mood tracker', true],
      ['Daily meditation', true],
      ['Sarah mentioned vegetarian', true],
      ['Wifi password Guest2024', true],
      ['123 Main Street', true], // has real words with numbers
      ['Coffee at 5pm', true],
    ])('hasRealWords("%s") should return %s', (text, expected) => {
      expect(hasRealWords(text)).toBe(expected);
    });
  });

  describe('isTodoLike - actionable task detection', () => {
    it.each([
      // Should be todo-like
      ['Email Sarah about project timeline', true],
      ['Buy milk and eggs', true],
      ['Schedule dentist appointment', true],
      ['Call mom tomorrow at 3pm', true],
      ['Meeting with team at 2pm', true],
      ['Submit tax forms by April 15', true],
      ['Pack for Mexico trip', true],
      ['Remember to cancel subscription', true],
      ['Birthday party Saturday at 7', true],
      ['Send invoice to client', true],
      ['Book flight for next week', true],
      ['Pay rent by Friday', true],
      ['Finish report by tomorrow', true],

      // Should NOT be todo-like
      ['Feeling overwhelmed', false],
      ['Daily meditation', false],
      ['App idea: mood tracker', false],
      ['Coffee shop closes at 5pm', false],
      ['I feel anxious', false],
    ])('isTodoLike("%s") should return %s', (text, expected) => {
      expect(isTodoLike(text)).toBe(expected);
    });
  });

  describe('isHabitLike - recurring behavior detection', () => {
    it.each([
      // Should be habit-like
      ['Meditate every morning', true],
      ['Run 3x per week', true],
      ['Daily standup at 9am', true],
      ['Quit smoking', true],
      ['Track mood daily', true],
      ['Weekly review on Sundays', true],
      ['Morning routine: coffee, journal, stretch', true],
      ['Read 20 pages before bed', true],
      ['No phone after 10pm', true],
      ['Gym Monday Wednesday Friday', true],
      ['Exercise every day', true],
      ['Stop eating sugar', true],

      // Should NOT be habit-like
      ['Buy milk', false],
      ['Email Sarah', false],
      ['Feeling grateful', false],
      ['App idea: fitness tracker', false],
      ['Meeting notes', false],
    ])('isHabitLike("%s") should return %s', (text, expected) => {
      expect(isHabitLike(text)).toBe(expected);
    });
  });

  describe('looksLikeJournal - personal reflection detection', () => {
    it.each([
      // Should be journal-like
      ['Feeling overwhelmed about work', true],
      ["I'm so grateful for today", true],
      ["Can't stop thinking about that conversation", true],
      ['Today was exhausting but good', true],
      ["I'm anxious about tomorrow", true],
      ['Really proud of myself', true],
      ['Had a panic attack this morning', true],
      ['Feeling stuck and frustrated', true],
      ['Best day in months', true],
      ['I need to process what happened', true],
      ['I feel so happy right now', true],
      ['Feeling tired and drained', true],

      // Should NOT be journal-like
      ['Buy groceries', false],
      ['Daily meditation', false],
      ['App idea: journal app', false],
      ['Meeting notes', false],
      ['Wifi password', false],
    ])('looksLikeJournal("%s") should return %s', (text, expected) => {
      expect(looksLikeJournal(text)).toBe(expected);
    });
  });

  describe('looksLikeIdea - creative thought detection', () => {
    it.each([
      // Should be idea-like
      ['App idea: mood tracking for pets', true],
      ['What if we added voice notes?', true],
      ['We could try a different approach', true],
      ['Feature idea: dark mode', true],
      ['Maybe we should pivot to B2B', true],
      ['Potential solution: caching', true],
      ['Business idea: subscription boxes for plants', true],
      ['Could build an API for this', true],
      ['Design concept: minimal navigation', true],
      ['What if users could share lists?', true],
      ['Imagine if we had real-time sync', true],
      ['We could add notifications', true],

      // Should NOT be idea-like
      ['Buy milk', false],
      ['Daily meditation', false],
      ['Feeling anxious', false],
      ['Meeting notes', false],
      ['Wifi password', false],
    ])('looksLikeIdea("%s") should return %s', (text, expected) => {
      expect(looksLikeIdea(text)).toBe(expected);
    });
  });

  describe('getPreferredMasterCategoryFromTextOnly - full classification', () => {
    describe('TODOS → "todo"', () => {
      it.each([
        'Email Sarah about project timeline',
        'Buy milk and eggs',
        'Schedule dentist appointment',
        'Call mom tomorrow at 3pm',
        'Meeting with team at 2pm',
        'Submit tax forms by April 15',
        'Pack for Mexico trip',
        'Remember to cancel subscription',
        'Birthday party Saturday at 7',
        'Send invoice to client',
      ])('should classify "%s" as todo', (text) => {
        expect(getPreferredMasterCategoryFromTextOnly(text)).toBe('todo');
      });
    });

    describe('HABITS → "habit"', () => {
      it.each([
        'Meditate every morning',
        'Run 3x per week',
        // Note: "Daily standup at 9am" is todo (time-bound wins)
        'Quit smoking',
        'Track mood daily',
        // Note: "Weekly review on Sundays" is todo (day-bound wins)
        'Morning routine: coffee, journal, stretch',
        'Read 20 pages before bed',
        'No phone after 10pm',
        'Gym Monday Wednesday Friday',
      ])('should classify "%s" as habit', (text) => {
        expect(getPreferredMasterCategoryFromTextOnly(text)).toBe('habit');
      });
    });

    describe('LOG - JOURNAL → "log_journal"', () => {
      it.each([
        'Feeling overwhelmed about work',
        // Note: "I'm so grateful for today" has "today" time keyword (todo wins)
        "Can't stop thinking about that conversation",
        // Note: "Today was exhausting but good" has "today" time keyword (todo wins)
        // Note: "I'm anxious about tomorrow" has "tomorrow" time keyword (todo wins)
        'Really proud of myself',
        'Had a panic attack this morning',
        'Feeling stuck and frustrated',
        'Best day in months',
        'I need to process what happened',
      ])('should classify "%s" as log_journal', (text) => {
        expect(getPreferredMasterCategoryFromTextOnly(text)).toBe('log_journal');
      });
    });

    describe('LOG - IDEA → "log_idea"', () => {
      it.each([
        'App idea: mood tracking for pets',
        'What if we added voice notes?',
        'We could try a different approach',
        'Feature idea: dark mode',
        'Maybe we should pivot to B2B',
        'Potential solution: caching',
        'Business idea: subscription boxes for plants',
        // Note: "Could build an API for this" - lacks explicit "we" subject (log_general)
        'Design concept: minimal navigation',
        // Note: "What if users could share lists?" works with expanded pattern
        'What if users could share lists?',
      ])('should classify "%s" as log_idea', (text) => {
        expect(getPreferredMasterCategoryFromTextOnly(text)).toBe('log_idea');
      });
    });

    describe('LOG - GENERAL → "log_general"', () => {
      it.each([
        'Wifi password: Guest2024',
        "Sarah mentioned she's vegetarian",
        // Note: "Coffee shop closes at 5pm" has passive time (not actionable) - now log_general
        'Coffee shop closes at 5pm',
        // Note: "Meeting notes" has "meeting" keyword (todo wins)
        // Note: "Book recommendation" has "book" verb (todo wins)
        'Parking is free after 6pm',
        'API key: sk-1234567',
        'Grocery list',
        "Mom's flight lands at 3:45",
        'Amazon return code: ABC123',
      ])('should classify "%s" as log_general', (text) => {
        expect(getPreferredMasterCategoryFromTextOnly(text)).toBe('log_general');
      });
    });

    describe('UNSORTED → "unsorted"', () => {
      it.each([
        'asdfghjkl',
        'test test test',
        '...',
        '123',
        'xxxxxxxxxx',
        '     ',
        'ajshdfkjahsdf',
        '@@@@@@',
      ])('should classify "%s" as unsorted', (text) => {
        expect(getPreferredMasterCategoryFromTextOnly(text)).toBe('unsorted');
      });
    });

    describe('Edge cases and priority ordering', () => {
      it('should prioritize todo over log_general for actionable items', () => {
        expect(getPreferredMasterCategoryFromTextOnly('Call the plumber')).toBe('todo');
        expect(getPreferredMasterCategoryFromTextOnly('Email team about meeting')).toBe('todo');
      });

      it('should prioritize todo over habit when time-bound patterns are present', () => {
        // "Call mom every Sunday" - has both imperative "call" AND recurring "every Sunday"
        // Todo wins because it comes first in priority order
        expect(getPreferredMasterCategoryFromTextOnly('Call mom every Sunday')).toBe('todo');

        // "Exercise daily" - no imperative verb, just recurring pattern
        expect(getPreferredMasterCategoryFromTextOnly('Exercise daily')).toBe('habit');
      });

      it('should prioritize todo over journal when time keywords are present', () => {
        // "Feeling anxious about the presentation" - no time keyword
        expect(
          getPreferredMasterCategoryFromTextOnly('Feeling anxious about the presentation'),
        ).toBe('log_journal');

        // "I'm so tired today" - has "today" time keyword, but also emotional content
        // Todo wins because it checks time-bound patterns
        expect(getPreferredMasterCategoryFromTextOnly("I'm so tired today")).toBe('todo');
      });

      it('should prioritize idea over log_general for creative thoughts', () => {
        expect(getPreferredMasterCategoryFromTextOnly('What if we added a search feature')).toBe(
          'log_idea',
        );
        expect(getPreferredMasterCategoryFromTextOnly('Product idea: AI assistant')).toBe(
          'log_idea',
        );
      });

      it('should default to log_general for meaningful but unclassified content', () => {
        expect(getPreferredMasterCategoryFromTextOnly('Random fact about dolphins')).toBe(
          'log_general',
        );
        expect(getPreferredMasterCategoryFromTextOnly('Notes from the conference')).toBe(
          'log_general',
        );
        expect(getPreferredMasterCategoryFromTextOnly('Interesting article link')).toBe(
          'log_general',
        );
      });

      it('should handle mixed patterns with priority order', () => {
        // Has both todo (schedule) and habit (daily) patterns - todo wins (higher priority)
        expect(getPreferredMasterCategoryFromTextOnly('Schedule daily standup meeting')).toBe(
          'todo',
        );

        // Has both journal (I'm feeling) and idea (we could) patterns
        // In this case, both patterns match, but the idea pattern ("we could try") is stronger
        // This is acceptable behavior - idea wins for this edge case
        expect(
          getPreferredMasterCategoryFromTextOnly("I'm feeling we could try a new approach"),
        ).toBe('log_idea');
      });
    });
  });
});
