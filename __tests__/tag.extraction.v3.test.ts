/**
 * Tests for Tag Extraction v3 (Gremly-Tuned)
 *
 * Verifies the extraction follows all rules from the specification:
 * - Meaningful nouns only (people, places, objects, activities, topics)
 * - No verbs, adjectives, generic concepts, or filler words
 * - Max 1 emotion tag for journal entries
 * - Habit-specific conversions
 * - List detection
 * - Maximum 6 tags with proper prioritization
 */

import { extractMeaningfulTags } from '../lib/tags/extractTags';

describe('Tag Extraction v3 - Core Rules', () => {
  describe('Example scenarios from spec', () => {
    it('extracts people, places, and objects: "Sarah mentioned the coffee place on Oak Street"', () => {
      const tags = extractMeaningfulTags('Sarah mentioned the coffee place on Oak Street');

      expect(tags).toContain('sarah');
      expect(tags).toContain('coffee');
      expect(tags).toContain('oak-street');
      expect(tags.length).toBeLessThanOrEqual(6);
    });

    it('extracts items and adds groceries: "Need to buy milk and eggs"', () => {
      const tags = extractMeaningfulTags('Need to buy milk and eggs', 'list');

      expect(tags).toContain('milk');
      expect(tags).toContain('eggs');
      expect(tags).toContain('groceries');
    });

    it('extracts topic and emotion: "Feeling overwhelmed about work presentation"', () => {
      const tags = extractMeaningfulTags('Feeling overwhelmed about work presentation', 'journal');

      expect(tags).toContain('presentation');
      expect(tags).toContain('overwhelmed');
      // "work" might be included as a topic
      expect(tags.length).toBeLessThanOrEqual(6);
    });

    it('extracts specific nouns only: "Email my accountant about the tax letter before Friday"', () => {
      const tags = extractMeaningfulTags('Email my accountant about the tax letter before Friday');

      expect(tags).toContain('accountant');
      expect(tags).toContain('tax-letter');

      // Should NOT include verbs or filler
      expect(tags).not.toContain('email');
      expect(tags).not.toContain('about');
      expect(tags).not.toContain('before');
    });

    it('converts habit text to activity: "Start running every morning again"', () => {
      const tags = extractMeaningfulTags('Start running every morning again');

      expect(tags).toContain('running');
      expect(tags).toContain('morning');

      // Should NOT include generic habit words
      expect(tags).not.toContain('start');
      expect(tags).not.toContain('every');
      expect(tags).not.toContain('again');
    });

    it('extracts meaningful topic: "Work has been a lot lately"', () => {
      const tags = extractMeaningfulTags('Work has been a lot lately');

      // May or may not include "work" depending on frequency
      // Should NOT include filler words
      expect(tags).not.toContain('been');
      expect(tags).not.toContain('lot');
      expect(tags).not.toContain('lately');
    });
  });

  describe('NEVER include rules', () => {
    it('excludes verbs', () => {
      const tags = extractMeaningfulTags('I want to know if you think we should go there');

      expect(tags).not.toContain('want');
      expect(tags).not.toContain('know');
      expect(tags).not.toContain('think');
      expect(tags).not.toContain('should');
      expect(tags).not.toContain('go');
    });

    it('excludes adjectives', () => {
      const tags = extractMeaningfulTags('This is amazing and good but also bad');

      expect(tags).not.toContain('amazing');
      expect(tags).not.toContain('good');
      expect(tags).not.toContain('bad');
    });

    it('excludes generic concepts', () => {
      const tags = extractMeaningfulTags('Daily task routine habit appointment');

      expect(tags).not.toContain('task');
      expect(tags).not.toContain('routine');
      expect(tags).not.toContain('habit');
      expect(tags).not.toContain('daily');
      expect(tags).not.toContain('appointment');
    });

    it('excludes filler words', () => {
      const tags = extractMeaningfulTags('The thing is that stuff happens sometimes');

      expect(tags).not.toContain('the');
      expect(tags).not.toContain('thing');
      expect(tags).not.toContain('that');
      expect(tags).not.toContain('stuff');
      expect(tags).not.toContain('sometimes');
    });

    it('excludes meta words', () => {
      const tags = extractMeaningfulTags('Meeting appointment event note reminder');

      expect(tags).not.toContain('meeting');
      expect(tags).not.toContain('appointment');
      expect(tags).not.toContain('event');
      expect(tags).not.toContain('note');
      expect(tags).not.toContain('reminder');
    });
  });

  describe('Emotion rules', () => {
    it('includes max 1 emotion for journal entries', () => {
      const tags = extractMeaningfulTags('Feeling anxious and overwhelmed and stressed', 'journal');

      const emotions = tags.filter((tag) =>
        [
          'anxious',
          'overwhelmed',
          'stressed',
          'sad',
          'angry',
          'excited',
          'nervous',
          'calm',
          'grateful',
          'tired',
        ].includes(tag),
      );

      expect(emotions.length).toBeLessThanOrEqual(1);
    });

    it('includes emotion only if explicit', () => {
      const tags = extractMeaningfulTags('Had a bad day at work', 'journal');

      // "bad" is adjective, not explicit emotion
      expect(tags).not.toContain('sad');
      expect(tags).not.toContain('angry');
    });

    it('does not include emotions for non-journal', () => {
      const tags = extractMeaningfulTags('Buy groceries feeling tired', 'list');

      // No journal context, so emotion might be filtered
      expect(tags).toContain('groceries');
    });
  });

  describe('People extraction', () => {
    it('extracts single names', () => {
      const tags = extractMeaningfulTags('Talked to Sarah today');

      expect(tags).toContain('sarah');
    });

    it('extracts two-word names', () => {
      const tags = extractMeaningfulTags('Met with John Smith about the project');

      expect(tags).toContain('john-smith');
    });

    it('extracts doctor names', () => {
      const tags = extractMeaningfulTags('Appointment with Dr. Johnson');

      expect(tags).toContain('@dr-johnson');
    });

    it('limits to 2 people max', () => {
      const tags = extractMeaningfulTags('Sarah, John, Mike, and Lisa are coming');

      // Count only person names (capitalized in source, but returned as lowercase)
      // People should be first in the prioritized list
      const peopleNames = ['sarah', 'john', 'mike', 'lisa'];
      const extractedPeople = tags.filter((tag) => peopleNames.includes(tag));
      expect(extractedPeople.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Places extraction', () => {
    it('extracts places after location prepositions', () => {
      const tags = extractMeaningfulTags('Going to the gym');

      expect(tags).toContain('gym');
    });

    it('extracts multi-word places', () => {
      const tags = extractMeaningfulTags('Meet at Oak Street Coffee');

      expect(tags).toContain('oak-street');
    });

    it('does not confuse people and places', () => {
      const tags = extractMeaningfulTags('Sarah went to the Office');

      expect(tags).toContain('sarah');
      expect(tags).toContain('office');

      // "sarah" and "office" should be distinct
      const unique = new Set(tags);
      expect(unique.size).toBe(tags.length);
    });
  });

  describe('Habit-specific handling', () => {
    it('converts "do yoga" to "yoga"', () => {
      const tags = extractMeaningfulTags('Do yoga every night');

      expect(tags).toContain('yoga');
      expect(tags).not.toContain('do');
      expect(tags).not.toContain('every');
    });

    it('converts "start running" to "running"', () => {
      const tags = extractMeaningfulTags('Start running more often');

      expect(tags).toContain('running');
      expect(tags).not.toContain('start');
    });

    it('never outputs habit meta words', () => {
      const tags = extractMeaningfulTags('Daily meditation habit routine practice');

      expect(tags).not.toContain('habit');
      expect(tags).not.toContain('routine');
      expect(tags).not.toContain('daily');
      expect(tags).not.toContain('practice');
      expect(tags).toContain('meditation');
    });
  });

  describe('List detection', () => {
    it('adds groceries tag for list items', () => {
      const tags = extractMeaningfulTags('- milk\n- eggs\n- bread', 'list');

      expect(tags).toContain('groceries');
      expect(tags).toContain('milk');
      expect(tags).toContain('eggs');
    });

    it('tags individual concrete items', () => {
      const tags = extractMeaningfulTags('- laptop\n- passport\n- tickets', 'list');

      expect(tags).toContain('laptop');
      expect(tags).toContain('passport');
      expect(tags).toContain('tickets');
    });
  });

  describe('Maximum 6 tags with prioritization', () => {
    it('limits output to 6 tags', () => {
      const tags = extractMeaningfulTags(
        'Sarah and John went to Oak Street Coffee to discuss the project budget presentation with the team',
      );

      expect(tags.length).toBeLessThanOrEqual(6);
    });

    it('prioritizes: people > places > topics > emotions', () => {
      const tags = extractMeaningfulTags(
        'Sarah mentioned the gym has great yoga classes and I feel calm',
        'journal',
      );

      // People should come first
      const sarahIndex = tags.indexOf('sarah');
      const gymIndex = tags.indexOf('gym');
      const calmIndex = tags.indexOf('calm');

      if (sarahIndex >= 0 && gymIndex >= 0) {
        expect(sarahIndex).toBeLessThan(gymIndex);
      }

      if (gymIndex >= 0 && calmIndex >= 0) {
        expect(gymIndex).toBeLessThan(calmIndex);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles empty input', () => {
      const tags = extractMeaningfulTags('');
      expect(tags).toEqual([]);
    });

    it('handles input with only excluded words', () => {
      const tags = extractMeaningfulTags('I want to think about going there');
      // May return empty or minimal tags
      expect(tags.length).toBeLessThanOrEqual(6);
    });

    it('strips emojis and special characters', () => {
      const tags = extractMeaningfulTags("Coffee ☕ at Sarah's place 🏠");

      expect(tags).toContain('coffee');
      expect(tags).toContain('sarah');
    });

    it('handles hyphenated places correctly', () => {
      const tags = extractMeaningfulTags('Going to Oak-Street');

      // Should normalize hyphens
      expect(tags.some((tag) => tag.includes('oak'))).toBe(true);
    });
  });
});
