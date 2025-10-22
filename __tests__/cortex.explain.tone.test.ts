/**
 * Phase 10.4: Tone-aware explanations tests
 * Verifies that explain functions produce appropriately varied output based on tone
 */

import {
  explainAddedToList,
  explainCreated,
  explainFiledToSpace,
  explainAmbiguous,
  type Tone,
} from '../lib/cortex/explain';

describe('Tone-aware explanations (Phase 10.4)', () => {
  describe('explainAddedToList', () => {
    it('should use calm tone (neutral, no emoji)', () => {
      const result = explainAddedToList('Shopping', 'calm');
      expect(result).toBe('Added to Shopping.');
      expect(result).not.toContain('🛒');
      expect(result).not.toContain('💫');
    });

    it('should use warm tone (friendly with emoji)', () => {
      const result = explainAddedToList('Shopping', 'warm');
      expect(result).toContain('Added to Shopping');
      expect(result).toMatch(/[🛒💫]/u); // Should have some emoji
    });

    it('should use direct tone (brief, no fluff)', () => {
      const result = explainAddedToList('Shopping', 'direct');
      expect(result).toBe('Shopping: added');
      expect(result).not.toContain('.');
      expect(result).not.toContain('🛒');
    });
  });

  describe('explainCreated', () => {
    it('should use calm tone for todo', () => {
      const result = explainCreated('todo', 'calm');
      expect(result).toBe('Todo created.');
    });

    it('should use warm tone for todo', () => {
      const result = explainCreated('todo', 'warm');
      expect(result).toContain('Todo created');
      expect(result).toContain('✓');
    });

    it('should use direct tone for todo', () => {
      const result = explainCreated('todo', 'direct');
      expect(result).toBe('Todo created');
      expect(result).not.toContain('.');
    });

    it('should use warm tone for habit with emoji', () => {
      const result = explainCreated('habit', 'warm');
      expect(result).toContain('Habit created');
      expect(result).toContain('🎯');
    });

    it('should use warm tone for note with emoji', () => {
      const result = explainCreated('note', 'warm');
      expect(result).toContain('Note created');
      expect(result).toContain('📝');
    });
  });

  describe('explainFiledToSpace', () => {
    it('should use calm tone', () => {
      const result = explainFiledToSpace('Work', 'calm');
      expect(result).toBe('Filed to Work.');
    });

    it('should use calm tone with hints', () => {
      const result = explainFiledToSpace('Work', 'calm', ['you mentioned project']);
      expect(result).toBe('Filed to Work (you mentioned project).');
    });

    it('should use warm tone', () => {
      const result = explainFiledToSpace('Fitness', 'warm');
      expect(result).toContain('Popped this into Fitness for you');
      expect(result).toContain('💫');
    });

    it('should use warm tone with hints', () => {
      const result = explainFiledToSpace('Fitness', 'warm', ['running keywords']);
      expect(result).toContain('Popped this into Fitness for you 💫');
      expect(result).toContain('(running keywords)');
    });

    it('should use direct tone', () => {
      const result = explainFiledToSpace('Work', 'direct');
      expect(result).toBe('Filed: Work');
    });

    it('should use direct tone with hints', () => {
      const result = explainFiledToSpace('Work', 'direct', ['project keyword']);
      expect(result).toBe('Filed: Work (project keyword)');
    });
  });

  describe('explainAmbiguous', () => {
    it('should use calm tone with suggestions', () => {
      const result = explainAmbiguous('calm', ['Idea 1', 'Idea 2']);
      expect(result).toContain('Unclear');
      expect(result).toContain('suggestions');
    });

    it('should use warm tone with suggestions', () => {
      const result = explainAmbiguous('warm', ['Idea 1']);
      expect(result).toContain('Not quite sure');
      expect(result).toContain('ideas');
    });

    it('should use direct tone', () => {
      const result = explainAmbiguous('direct');
      expect(result).toBe('Need clarification');
    });
  });

  describe('tone consistency', () => {
    const tones: Tone[] = ['calm', 'warm', 'direct'];

    tones.forEach((tone) => {
      it(`should produce distinct outputs for ${tone} tone across functions`, () => {
        const listExplain = explainAddedToList('Shopping', tone);
        const createExplain = explainCreated('todo', tone);
        const fileExplain = explainFiledToSpace('Work', tone);

        // All should be strings
        expect(typeof listExplain).toBe('string');
        expect(typeof createExplain).toBe('string');
        expect(typeof fileExplain).toBe('string');

        // All should be non-empty
        expect(listExplain.length).toBeGreaterThan(0);
        expect(createExplain.length).toBeGreaterThan(0);
        expect(fileExplain.length).toBeGreaterThan(0);

        if (tone === 'warm') {
          // Warm tone should have emojis
          expect(listExplain.match(/[🛒💫]/u)).toBeTruthy();
        } else if (tone === 'direct') {
          // Direct tone should be brief and no trailing period
          expect(listExplain).not.toMatch(/\.$/);
        }
      });
    });
  });
});
