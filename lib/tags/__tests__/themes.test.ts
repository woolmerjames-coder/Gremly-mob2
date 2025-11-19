/**
 * Tests for theme tag enrichment
 */

import { applyThemeTags, THEME_RULES } from '../themes';

describe('applyThemeTags', () => {
  describe('Exercise theme', () => {
    it('adds #exercise tag for running text', () => {
      const result = applyThemeTags('Start running every morning', ['#morning']);
      expect(result).toContain('#exercise');
      expect(result).toContain('#morning');
    });

    it('adds #exercise tag for gym text', () => {
      const result = applyThemeTags('Hit the gym after work', ['#work']);
      expect(result).toContain('#exercise');
    });

    it('adds #exercise tag for yoga text', () => {
      const result = applyThemeTags('Morning yoga session', []);
      expect(result).toContain('#exercise');
    });

    it('adds #exercise tag for cardio text', () => {
      const result = applyThemeTags('30 minutes of cardio', []);
      expect(result).toContain('#exercise');
    });

    it('does not duplicate #exercise if already present', () => {
      const result = applyThemeTags('Start running every morning', ['#exercise', '#morning']);
      const exerciseCount = result.filter((tag) => tag === '#exercise').length;
      expect(exerciseCount).toBe(1);
    });

    it('is case-insensitive when checking for duplicates', () => {
      const result = applyThemeTags('Start running every morning', ['#Exercise', '#morning']);
      const exerciseCount = result.filter((tag) => tag.toLowerCase() === '#exercise').length;
      expect(exerciseCount).toBe(1);
    });
  });

  describe('Work theme', () => {
    it('adds #work tag for meeting text', () => {
      const result = applyThemeTags('Schedule client meeting for Thursday', ['#thursday']);
      expect(result).toContain('#work');
    });

    it('adds #work tag for deadline text', () => {
      const result = applyThemeTags('Project deadline next week', ['#project']);
      expect(result).toContain('#work');
    });

    it('adds #work tag for presentation text', () => {
      const result = applyThemeTags('Finish work presentation for client', ['#client']);
      expect(result).toContain('#work');
    });

    it('does not duplicate #work if already present', () => {
      const result = applyThemeTags('Meeting with boss tomorrow', ['#work', '#boss']);
      const workCount = result.filter((tag) => tag === '#work').length;
      expect(workCount).toBe(1);
    });
  });

  describe('Health theme', () => {
    it('adds #health tag for dentist text', () => {
      const result = applyThemeTags('Book dentist appointment', ['#appointment', '#dentist']);
      expect(result).toContain('#health');
    });

    it('adds #health tag for doctor text', () => {
      const result = applyThemeTags('See doctor about knee pain', ['#doctor']);
      expect(result).toContain('#health');
    });

    it('adds #health tag for therapy text', () => {
      const result = applyThemeTags('Therapy session at 3pm', []);
      expect(result).toContain('#health');
    });

    it('adds #health tag for meds text', () => {
      const result = applyThemeTags('Pick up meds from pharmacy', ['#pharmacy']);
      expect(result).toContain('#health');
    });

    it('does not duplicate #health if already present', () => {
      const result = applyThemeTags('Doctor appointment', ['#health']);
      const healthCount = result.filter((tag) => tag === '#health').length;
      expect(healthCount).toBe(1);
    });
  });

  describe('Finance theme', () => {
    it('adds #finance tag for tax text', () => {
      const result = applyThemeTags('File taxes before April 15', ['#april']);
      expect(result).toContain('#finance');
    });

    it('adds #finance tag for budget text', () => {
      const result = applyThemeTags('Review monthly budget', []);
      expect(result).toContain('#finance');
    });

    it('adds #finance tag for bill text', () => {
      const result = applyThemeTags('Pay electricity bill', []);
      expect(result).toContain('#finance');
    });

    it('adds #finance tag for accountant text', () => {
      const result = applyThemeTags('Email accountant about invoice', ['#email', '#accountant']);
      expect(result).toContain('#finance');
    });
  });

  describe('Home theme', () => {
    it('adds #home tag for cleaning text', () => {
      const result = applyThemeTags('Clean the kitchen', []);
      expect(result).toContain('#home');
    });

    it('adds #home tag for grocery text', () => {
      const result = applyThemeTags('Buy groceries for the week', []);
      expect(result).toContain('#home');
    });

    it('adds #home tag for laundry text', () => {
      const result = applyThemeTags('Do laundry this weekend', ['#weekend']);
      expect(result).toContain('#home');
    });

    it('adds #home tag for repair text', () => {
      const result = applyThemeTags('Need to repair the broken dishwasher', []);
      expect(result).toContain('#home');
    });
  });

  describe('Multiple themes', () => {
    it('can add multiple theme tags if multiple patterns match', () => {
      const result = applyThemeTags('Work from home today, need to clean office', []);
      expect(result).toContain('#work');
      expect(result).toContain('#home');
    });

    it('adds theme tags on top of existing tags', () => {
      const result = applyThemeTags('Morning run before work meeting', ['#morning', '#meeting']);
      expect(result).toContain('#morning');
      expect(result).toContain('#meeting');
      expect(result).toContain('#exercise');
      expect(result).toContain('#work');
      expect(result.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Edge cases', () => {
    it('handles empty text', () => {
      const result = applyThemeTags('', ['#existing']);
      expect(result).toEqual(['#existing']);
    });

    it('handles empty tags', () => {
      const result = applyThemeTags('Start running', []);
      expect(result).toContain('#exercise');
    });

    it('handles null/empty input gracefully', () => {
      const result = applyThemeTags('', []);
      expect(result).toEqual([]);
    });

    it('preserves all existing tags', () => {
      const existingTags = ['#foo', '#bar', '#baz'];
      const result = applyThemeTags('Some random text', existingTags);
      expect(result).toContain('#foo');
      expect(result).toContain('#bar');
      expect(result).toContain('#baz');
    });

    it('does not add theme if no patterns match', () => {
      const result = applyThemeTags('Buy groceries', []);
      expect(result).toContain('#home'); // groceries matches home theme
    });

    it('is case-insensitive for pattern matching', () => {
      const result = applyThemeTags('RUNNING IN THE MORNING', []);
      expect(result).toContain('#exercise');
    });
  });

  describe('THEME_RULES', () => {
    it('exports THEME_RULES for testing', () => {
      expect(THEME_RULES).toBeDefined();
      expect(Array.isArray(THEME_RULES)).toBe(true);
    });

    it('has at least 5 theme rules', () => {
      expect(THEME_RULES.length).toBeGreaterThanOrEqual(5);
    });

    it('each rule has theme and patterns', () => {
      THEME_RULES.forEach((rule) => {
        expect(rule.theme).toBeDefined();
        expect(rule.theme).toMatch(/^#/);
        expect(Array.isArray(rule.patterns)).toBe(true);
        expect(rule.patterns.length).toBeGreaterThan(0);
      });
    });
  });
});
