/**
 * Phase 10.4: Tone-aware explanations tests
 * Phase 11.7+: Updated for new Gremly brand voice
 * Verifies that explain functions produce appropriately varied output based on tone
 */

import {
  explainAddedToList,
  explainCreated,
  explainFiledToSpace,
  explainAmbiguous,
  type Tone,
} from '../lib/cortex/explain';

describe('Tone-aware explanations (Phase 10.4, 11.7+)', () => {
  describe('explainAddedToList', () => {
    it('should use calm tone (brief with contextual emoji)', () => {
      const result = explainAddedToList('Shopping', 'calm');
      expect(result).toContain('Added');
      expect(result).toContain('🛒'); // Contextual emoji for shopping
    });

    it('should use warm tone (friendly with emoji)', () => {
      const result = explainAddedToList('Shopping', 'warm');
      expect(result).toContain('Added');
      expect(result).toMatch(/[🛒💫]/u); // Should have contextual emoji
    });

    it('should use direct tone (super brief)', () => {
      const result = explainAddedToList('Shopping', 'direct');
      expect(result).toBe('Added');
    });
  });

  describe('explainCreated', () => {
    it('should use calm tone for todo', () => {
      const result = explainCreated('todo', 'calm');
      expect(result).toBe('All sorted.');
    });

    it('should use warm tone for todo (varied responses)', () => {
      const result = explainCreated('todo', 'warm');
      expect(['Got it ✓', 'All sorted', 'Done and dusted']).toContain(result);
    });

    it('should use direct tone for todo', () => {
      const result = explainCreated('todo', 'direct');
      expect(result).toBe('Done.');
    });

    it('should use warm tone for habit (varied responses with emoji)', () => {
      const result = explainCreated('habit', 'warm');
      expect([
        'On it 🎯',
        "Nice work — that's one less thing buzzing around your brain.",
        'Habit locked in',
      ]).toContain(result);
    });

    it('should use warm tone for note (varied responses with emoji)', () => {
      const result = explainCreated('note', 'warm');
      expect(['Captured 📝', "Saved. It's not going anywhere.", 'Got it']).toContain(result);
    });
  });

  describe('explainFiledToSpace', () => {
    it('should use calm tone (brief, clear)', () => {
      const result = explainFiledToSpace('Work', 'calm');
      expect(result).toBe('Filed to Work.');
    });

    it('should use calm tone without hints (no hint text)', () => {
      const result = explainFiledToSpace('Work', 'calm', ['you mentioned project']);
      expect(result).toBe('Filed to Work.');
    });

    it('should use warm tone (brief with emoji)', () => {
      const result = explainFiledToSpace('Fitness', 'warm');
      expect(result).toBe('Filed to Fitness 💫');
    });

    it('should use warm tone ignoring hints (Gremly style)', () => {
      const result = explainFiledToSpace('Fitness', 'warm', ['running keywords']);
      expect(result).toBe('Filed to Fitness 💫');
    });

    it('should use direct tone', () => {
      const result = explainFiledToSpace('Work', 'direct');
      expect(result).toBe('Filed: Work');
    });

    it('should use direct tone ignoring hints', () => {
      const result = explainFiledToSpace('Work', 'direct', ['project keyword']);
      expect(result).toBe('Filed: Work');
    });
  });

  describe('explainAmbiguous', () => {
    it('should use calm tone with suggestions (brief)', () => {
      const result = explainAmbiguous('calm', ['Idea 1', 'Idea 2']);
      expect(result).toBe('Some options:');
    });

    it('should use warm tone with suggestions (friendly)', () => {
      const result = explainAmbiguous('warm', ['Idea 1']);
      expect(result).toBe('A few options here:');
    });

    it('should use calm tone without suggestions', () => {
      const result = explainAmbiguous('calm');
      expect(result).toBe('Break that down for me?');
    });

    it('should use warm tone without suggestions', () => {
      const result = explainAmbiguous('warm');
      expect(result).toBe('Tell me more?');
    });

    it('should use direct tone', () => {
      const result = explainAmbiguous('direct');
      expect(result).toBe('Clarify?');
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
          // Warm tone should be friendly (may have emojis)
          expect(listExplain.length).toBeGreaterThan(3);
        } else if (tone === 'direct') {
          // Direct tone should be very brief
          expect(listExplain.length).toBeLessThan(20);
        }
      });
    });
  });
});
