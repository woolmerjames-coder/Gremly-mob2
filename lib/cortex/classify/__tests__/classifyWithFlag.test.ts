/**
 * Integration tests for classifyWithFlag
 *
 * Tests feature flag routing between V1 and V2 classifiers.
 * Note: V2-enabled tests use classifyV2 directly since Jest doesn't support
 * dynamic imports without experimental-vm-modules.
 */

import { classifyWithFlag, isV2Enabled, isShadowEnabled } from '../classifyWithFlag';
import { classifyV2 } from '../classifyV2';

// Mock the feature flags - default to shadow mode (V2 disabled, shadow enabled)
jest.mock('../../../env', () => ({
  FF_CLASSIFY_V2: false,
  FF_CLASSIFY_V2_SHADOW: true,
}));

describe('classifyWithFlag', () => {
  describe('when V2 is disabled (shadow mode)', () => {
    it('returns V1 result when provided', () => {
      const result = classifyWithFlag({
        text: 'Call mom',
        v1Result: {
          type: 'todo',
          confidence: 0.9,
          mode: 'auto',
        },
      });

      expect(result.classifier).toBe('v1');
      expect(result.type).toBe('todo');
    });

    it('falls back to V2 if no V1 result', () => {
      const result = classifyWithFlag({
        text: 'Call mom',
      });

      expect(result.classifier).toBe('v2');
    });

    it('maps V1 mode "ask" to showChips true', () => {
      const result = classifyWithFlag({
        text: 'Should probably call mom',
        v1Result: {
          type: 'unsorted',
          confidence: 0.5,
          mode: 'ask',
        },
      });

      expect(result.classifier).toBe('v1');
      expect(result.showChips).toBe(true);
      expect(result.mode).toBe('chips');
    });

    it('maps V1 type "unsorted" to "log"', () => {
      const result = classifyWithFlag({
        text: 'Random thought',
        v1Result: {
          type: 'unsorted',
          confidence: 0.6,
          mode: 'keep',
        },
      });

      expect(result.type).toBe('log');
    });

    it('maps V1 mode "keep" to "default"', () => {
      const result = classifyWithFlag({
        text: 'Just a note',
        v1Result: {
          type: 'log',
          confidence: 0.7,
          mode: 'keep',
        },
      });

      expect(result.mode).toBe('default');
    });
  });

  describe('output format', () => {
    it('includes showChips flag', () => {
      const result = classifyWithFlag({
        text: 'Should probably book dentist',
      });

      expect(result).toHaveProperty('showChips');
    });

    it('includes chipOptions when mode is chips', () => {
      const result = classifyWithFlag({
        text: 'Should probably book dentist',
      });

      if (result.mode === 'chips') {
        expect(result.chipOptions).toBeDefined();
        expect(result.chipOptions?.length).toBeGreaterThan(0);
      }
    });

    it('includes classifier source', () => {
      const result = classifyWithFlag({
        text: 'Call mom',
        v1Result: {
          type: 'todo',
          confidence: 0.9,
          mode: 'auto',
        },
      });

      expect(result).toHaveProperty('classifier');
      expect(['v1', 'v2']).toContain(result.classifier);
    });

    it('includes confidence', () => {
      const result = classifyWithFlag({
        text: 'Call mom',
        v1Result: {
          type: 'todo',
          confidence: 0.85,
          mode: 'auto',
        },
      });

      expect(result.confidence).toBe(0.85);
    });
  });

  describe('helper functions', () => {
    it('isV2Enabled returns false when FF_CLASSIFY_V2 is off', () => {
      expect(isV2Enabled()).toBe(false);
    });

    it('isShadowEnabled returns true when V2 off and shadow on', () => {
      expect(isShadowEnabled()).toBe(true);
    });
  });
});

// Test V2 classifier behavior directly (simulates V2 enabled mode)
// This approach avoids Jest dynamic import issues while still testing V2 behavior
describe('classifyV2 behavior (V2 enabled simulation)', () => {
  it('classifies "Call mom" as todo with high confidence', () => {
    const result = classifyV2('Call mom');

    expect(result.type).toBe('todo');
    expect(result.mode).toBe('auto');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('returns chips mode for hedged input', () => {
    const result = classifyV2('Should probably book dentist');

    expect(result.mode).toBe('chips');
    expect(result.chipOptions).toBeDefined();
    expect(result.chipOptions?.length).toBeGreaterThan(0);
  });

  it('returns auto mode for explicit todo prefix', () => {
    const result = classifyV2('Todo: call mom tomorrow');

    expect(result.type).toBe('todo');
    expect(result.mode).toBe('auto');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('returns habit for frequency patterns', () => {
    const result = classifyV2('Meditate every morning');

    expect(result.type).toBe('habit');
    expect(result.mode).toBe('auto');
  });

  it('returns journal for emotional content', () => {
    const result = classifyV2('Feeling overwhelmed today');

    expect(result.type).toBe('log');
    expect(result.subtype).toBe('journal');
  });

  it('returns idea for what-if questions', () => {
    const result = classifyV2('What if we added dark mode?');

    expect(result.type).toBe('log');
    expect(result.subtype).toBe('idea');
  });

  it('includes layer and reason in result', () => {
    const result = classifyV2('Call mom');

    expect(result).toHaveProperty('layer');
    expect(result).toHaveProperty('reason');
    expect(typeof result.layer).toBe('number');
    expect(typeof result.reason).toBe('string');
  });
});

// Test output mapping consistency
describe('output mapping', () => {
  it('V1 auto mode maps to auto', () => {
    const result = classifyWithFlag({
      text: 'Test',
      v1Result: { type: 'todo', confidence: 0.9, mode: 'auto' },
    });

    expect(result.mode).toBe('auto');
  });

  it('V1 ask mode maps to chips', () => {
    const result = classifyWithFlag({
      text: 'Test',
      v1Result: { type: 'todo', confidence: 0.6, mode: 'ask' },
    });

    expect(result.mode).toBe('chips');
    expect(result.showChips).toBe(true);
  });

  it('V1 keep mode maps to default', () => {
    const result = classifyWithFlag({
      text: 'Test',
      v1Result: { type: 'log', confidence: 0.7, mode: 'keep' },
    });

    expect(result.mode).toBe('default');
  });

  it('V1 subtype is preserved', () => {
    const result = classifyWithFlag({
      text: 'Test',
      v1Result: { type: 'log', subtype: 'journal', confidence: 0.8, mode: 'auto' },
    });

    expect(result.subtype).toBe('journal');
  });
});
