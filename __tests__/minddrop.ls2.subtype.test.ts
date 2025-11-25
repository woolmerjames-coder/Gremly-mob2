/**
 * LS2: Log Subtype Stage A Integration Tests
 *
 * Verifies that Stage A correctly uses the LS1 classifier to determine
 * note subtypes and persists them to the database.
 *
 * Mapping:
 * - LS1 'journal' → note subtype 'journal'
 * - LS1 'idea' → note subtype 'idea'
 * - LS1 'general' → note subtype 'catchall'
 *
 * Run with: npm test -- minddrop.ls2.subtype
 */

import { buildCanonicalFromMindDrop } from '../lib/minddrop/buildCanonicalFromMindDrop';
import { classifyLogSubtype } from '../lib/cortex/classifyLogSubtype';
import { getEffectiveLogSubtype } from '../lib/logs/getEffectiveLogSubtype';

describe('LS2: Log Subtype Stage A Integration', () => {
  describe('buildCanonicalFromMindDrop - log subtype classification', () => {
    test('LS2.A: Journal log - strong first-person emotion', async () => {
      const input = "I'm feeling overwhelmed about work and a bit anxious about tomorrow.";

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('journal');
      expect(ls1Signal.journalConfidence).toBeGreaterThanOrEqual(70);

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('journal');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('journal');
      expect(canonical.body).toBe(input);
      expect(canonical.tags).toContain('#journal'); // Theme tag from applyThemeTags
    });

    test('LS2.B: Idea log - explicit idea marker', async () => {
      const input = 'App idea: offline shopping list that works on planes.';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('idea');
      expect(ls1Signal.ideaConfidence).toBeGreaterThanOrEqual(85);

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('idea');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('idea');
      expect(canonical.body).toBe(input);
      expect(canonical.tags).toContain('#idea'); // Theme tag from applyThemeTags
    });

    test('LS2.C: General log → catchall - factual reference', async () => {
      const input = "Sarah's coffee order: oat latte, extra hot, no foam.";

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('general');
      expect(ls1Signal.journalConfidence).toBeLessThan(60);
      expect(ls1Signal.ideaConfidence).toBeLessThan(60);

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('catchall');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('catchall');
      expect(canonical.body).toBe(input);
      expect(canonical.tags).toContain('#catchall'); // Theme tag from applyThemeTags
    });

    test('LS2.D: General log → catchall - plain task', async () => {
      const input = 'Email the client about the proposal';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('general');

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('catchall');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('catchall');
    });

    test('LS2.E: Conflict case → catchall - mixed journal+idea signals', async () => {
      const input = "I'm stressed but maybe we could redesign the schedule";

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('general'); // Conflict resolution
      expect(ls1Signal.journalConfidence).toBeGreaterThanOrEqual(60);
      expect(ls1Signal.ideaConfidence).toBeGreaterThanOrEqual(60);

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('catchall');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('catchall');
    });

    test('LS2.F: Short emotional statement → journal', async () => {
      const input = 'Exhausted.';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('journal');
      expect(ls1Signal.debug.textLength).toBeLessThan(50);
      expect(ls1Signal.debug.journalReasons).toContain('short_emotional_statement');

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('journal');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('journal');
    });

    test('LS2.G: Creative future language → idea', async () => {
      const input = 'What if we created a feature that would let users customize their dashboard?';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('idea');
      expect(ls1Signal.ideaConfidence).toBeGreaterThanOrEqual(70);

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('idea');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('idea');
    });

    test('LS2.H: Personal reflection with time marker → journal', async () => {
      const input = 'Today was exhausting';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('journal');
      expect(ls1Signal.journalConfidence).toBeGreaterThanOrEqual(70);
      expect(ls1Signal.debug.journalReasons).toContain('personal_reflection');

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('journal');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('journal');
    });

    test('LS2.I: Empty string → catchall fallback', async () => {
      const input = '';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('general');
      expect(ls1Signal.journalConfidence).toBe(0);
      expect(ls1Signal.ideaConfidence).toBe(0);

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('catchall');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('catchall');
    });
  });

  describe('LS2: Regression tests - deprecated subtypes never returned', () => {
    test('LS2.REGRESSION.A: Never returns deprecated "list" subtype', async () => {
      // Even if text looks like a list, subtype should NOT be 'list'
      const input = '- Buy milk\n- Buy bread\n- Buy eggs';

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.subtype).not.toBe('list');
      expect(['journal', 'idea', 'catchall', 'reference']).toContain(canonical.subtype);
      // List should be detected as an attribute instead
      expect(canonical.has_list).toBe(true);
    });

    test('LS2.REGRESSION.B: Never returns deprecated "plain" subtype', async () => {
      const input = 'Just a plain note';

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.subtype).not.toBe('plain');
      expect(['journal', 'idea', 'catchall', 'reference']).toContain(canonical.subtype);
    });

    test('LS2.REGRESSION.C: Never returns deprecated "person" subtype', async () => {
      const input = 'Sarah mentioned the budget';

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.subtype).not.toBe('person');
      expect(['journal', 'idea', 'catchall', 'reference']).toContain(canonical.subtype);
    });

    test('LS2.REGRESSION.D: Never returns "everything_else" subtype', async () => {
      const input = 'Random text';

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.subtype).not.toBe('everything_else');
      expect(['journal', 'idea', 'catchall', 'reference']).toContain(canonical.subtype);
    });

    test('LS2.REGRESSION.E: Subtype is always one of the allowed values', async () => {
      const testCases = [
        'I feel great today',
        'App idea: something cool',
        'The meeting was productive',
        'Random reference info',
        'Just thinking',
      ];

      for (const input of testCases) {
        const canonical = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText: input,
        });

        expect(['journal', 'idea', 'catchall', 'reference', null]).toContain(canonical.subtype);
      }
    });
  });

  describe('LS2: Sacred examples from master spec (Phase 1)', () => {
    test('LS2.SACRED.A: "Feeling overwhelmed about work" → journal', async () => {
      const input = 'Feeling overwhelmed about work';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('journal');

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('journal');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('journal');
      expect(canonical.body).toBe(input);
    });

    test('LS2.SACRED.B: "App idea: mood tracking for pets" → idea', async () => {
      const input = 'App idea: mood tracking for pets';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('idea');

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('idea');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('idea');
      expect(canonical.body).toBe(input);
    });

    test('LS2.SACRED.C: "Coffee shop closes at 5pm" → general/catchall', async () => {
      const input = 'Coffee shop closes at 5pm';

      // Verify LS1 classification
      const ls1Signal = classifyLogSubtype(input);
      expect(ls1Signal.subtype).toBe('general');

      // Verify mapping to note subtype
      const noteSubtype = getEffectiveLogSubtype(input);
      expect(noteSubtype).toBe('catchall');

      // Verify Stage A canonical output
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical.canonicalType).toBe('log');
      expect(canonical.subtype).toBe('catchall');
      expect(canonical.body).toBe(input);
    });
  });

  describe('LS2: Determinism verification', () => {
    test('LS2.DETERMINISM: Same input produces same subtype', async () => {
      const input = "I'm feeling stressed about the deadline";

      const canonical1 = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      const canonical2 = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      const canonical3 = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: input,
      });

      expect(canonical1.subtype).toBe(canonical2.subtype);
      expect(canonical2.subtype).toBe(canonical3.subtype);
      expect(canonical1.subtype).toBe('journal');
    });
  });

  describe('LS2: Debug signal verification', () => {
    test('LS2.DEBUG: Signal includes confidence scores and reasons', () => {
      const input = "I'm feeling overwhelmed about work";

      const signal = classifyLogSubtype(input);

      expect(signal).toHaveProperty('journalConfidence');
      expect(signal).toHaveProperty('ideaConfidence');
      expect(signal).toHaveProperty('subtype');
      expect(signal).toHaveProperty('debug');
      expect(signal.debug).toHaveProperty('journalReasons');
      expect(signal.debug).toHaveProperty('ideaReasons');
      expect(signal.debug).toHaveProperty('textLength');

      expect(signal.journalConfidence).toBeGreaterThanOrEqual(0);
      expect(signal.journalConfidence).toBeLessThanOrEqual(100);
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(0);
      expect(signal.ideaConfidence).toBeLessThanOrEqual(100);
    });
  });
});
