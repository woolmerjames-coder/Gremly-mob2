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

  describe('Multiple themes', () => {
    it('can add multiple theme tags if multiple patterns match', () => {
      const result = applyThemeTags('Work meeting, then gym workout', []);
      expect(result).toContain('#work');
      expect(result).toContain('#exercise');
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
      const result = applyThemeTags('Random unrelated text', []);
      expect(result).toEqual([]);
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
        expect(Array.isArray(rule.keywords)).toBe(true);
        expect(rule.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  // Phase 4B: Additive theme tags tests
  describe('Phase 4B: Additive theme tags', () => {
    describe('Exercise theme - specific + theme tags', () => {
      it('adds #exercise alongside #running (not replacing)', () => {
        const result = applyThemeTags('Start running every morning', ['#running']);
        expect(result).toContain('#running'); // Specific tag preserved
        expect(result).toContain('#exercise'); // Theme tag added
        expect(result.length).toBe(2);
      });

      it('adds #exercise alongside #yoga', () => {
        const result = applyThemeTags('Yoga before bed', ['#yoga']);
        expect(result).toContain('#yoga'); // Specific tag preserved
        expect(result).toContain('#exercise'); // Theme tag added
      });

      it('detects exercise from existing tag when no keyword in text', () => {
        const result = applyThemeTags('Daily routine', ['#swimming']);
        expect(result).toContain('#swimming'); // Specific tag preserved
        expect(result).toContain('#exercise'); // Theme detected from #swimming tag
      });

      it('detects exercise from tag containing keyword substring', () => {
        const result = applyThemeTags('Morning activity', ['#cycling']);
        expect(result).toContain('#cycling');
        expect(result).toContain('#exercise'); // cycling keyword in tag
      });
    });

    describe('Money theme - specific + theme tags', () => {
      it('adds #money alongside specific finance tags', () => {
        const result = applyThemeTags('Pay rent and utilities', ['#rent', '#utilities']);
        expect(result).toContain('#rent'); // Specific tags preserved
        expect(result).toContain('#utilities');
        expect(result).toContain('#money'); // Theme tag added
      });

      it('adds #money for bills text', () => {
        const result = applyThemeTags('Pay monthly bills', ['#bills']);
        expect(result).toContain('#bills');
        expect(result).toContain('#money');
      });

      it('adds #money from tag match even without text keyword', () => {
        const result = applyThemeTags('Monthly expenses', ['#salary']);
        expect(result).toContain('#salary');
        expect(result).toContain('#money'); // salary keyword in tag
      });
    });

    describe('Relationships and Sleep themes', () => {
      it('adds #relationships for partner/family keywords', () => {
        const result = applyThemeTags('Call mom about family dinner', ['#family']);
        expect(result).toContain('#family');
        expect(result).toContain('#relationships');
      });

      it('adds #sleep for bedtime/insomnia keywords', () => {
        const result = applyThemeTags('Struggling with insomnia again', ['#insomnia']);
        expect(result).toContain('#insomnia');
        expect(result).toContain('#sleep');
      });

      it('adds #sleep for tired/rest keywords', () => {
        const result = applyThemeTags('Feeling tired, need rest', []);
        expect(result).toContain('#sleep');
      });
    });

    describe('Preserves specific tags while adding themes', () => {
      it('never removes specific tags when adding theme', () => {
        const specific = ['#accountant', '#email', '#invoice', '#deadline'];
        const result = applyThemeTags('Email accountant about invoice deadline', specific);

        // All specific tags preserved
        expect(result).toContain('#accountant');
        expect(result).toContain('#email');
        expect(result).toContain('#invoice');
        expect(result).toContain('#deadline');

        // Theme tags added
        expect(result).toContain('#money'); // accountant, invoice
        expect(result).toContain('#work'); // deadline
      });

      it('works with mixed case tags', () => {
        const result = applyThemeTags('Daily workout routine', ['#Running', '#Yoga']);
        expect(result).toContain('#Running');
        expect(result).toContain('#Yoga');
        expect(result).toContain('#exercise'); // Theme added
      });
    });

    describe('Text and tag keyword detection', () => {
      it('detects theme from text keyword only', () => {
        const result = applyThemeTags('Need to start running', []);
        expect(result).toContain('#exercise');
      });

      it('detects theme from tag keyword only', () => {
        const result = applyThemeTags('Morning activity', ['#workout']);
        expect(result).toContain('#workout');
        expect(result).toContain('#exercise'); // From tag
      });

      it('detects theme from both text and tag keywords', () => {
        const result = applyThemeTags('Running and gym', ['#cardio']);
        expect(result).toContain('#cardio');
        expect(result).toContain('#exercise'); // From both text and tag
      });
    });
  });
});
