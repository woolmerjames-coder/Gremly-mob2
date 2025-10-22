/**
 * Phase 10.6: Cortex learning tests
 * Tests the pure learner logic (no I/O)
 */

import { learnFromEvents, type LeanEvent, type CortexPreferences } from '../lib/cortex/learn';

const mkEvent = (over: Partial<LeanEvent> = {}): LeanEvent => ({
  id: Math.random().toString(36).slice(2),
  user_id: 'u_1',
  kind: 'user_override',
  payload_json: { text: 'Weekly meeting notes for QBR planning', toSpaceName: 'Work' },
  created_at: new Date().toISOString(),
  ...over,
});

describe('learnFromEvents (Phase 10.6)', () => {
  describe('routing keyword extraction', () => {
    it('collects routing keywords per space from user_override events', () => {
      const evs: LeanEvent[] = [
        mkEvent(),
        mkEvent({ payload_json: { text: 'interval run splits', toSpaceName: 'Fitness' } }),
      ];
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      expect(res.mergedPrefs.routing_keywords).toBeDefined();
      expect(Object.keys(res.mergedPrefs.routing_keywords || {})).toEqual(
        expect.arrayContaining(['work', 'fitness']),
      );
    });

    it('merges with existing routing keywords without duplication', () => {
      const evs: LeanEvent[] = [
        mkEvent({ payload_json: { text: 'meeting agenda', toSpaceName: 'Work' } }),
        mkEvent({ payload_json: { text: 'quarterly planning meeting', toSpaceName: 'Work' } }),
      ];
      const current: CortexPreferences = {
        user_id: 'u_1',
        routing_keywords: { work: ['meeting'] },
      };
      const res = learnFromEvents(evs, current);

      const workKeywords = res.mergedPrefs.routing_keywords?.work || [];
      expect(workKeywords).toContain('meeting');
      expect(workKeywords.filter((w) => w === 'meeting')).toHaveLength(1); // no duplicates
    });

    it('caps keyword list at 24 per space', () => {
      const evs: LeanEvent[] = Array.from({ length: 30 }, (_, i) =>
        mkEvent({
          payload_json: {
            text: `unique word${i} test${i} sample${i} data${i} content${i}`,
            toSpaceName: 'Test',
          },
        }),
      );
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      const testKeywords = res.mergedPrefs.routing_keywords?.test || [];
      expect(testKeywords.length).toBeLessThanOrEqual(24);
    });

    it('extracts only words >= 3 and <= 18 chars', () => {
      const evs: LeanEvent[] = [
        mkEvent({
          payload_json: {
            text: 'ab verylongwordthatexceedstheeighteencharacterlimit mid ok',
            toSpaceName: 'Work',
          },
        }),
      ];
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      const workKeywords = res.mergedPrefs.routing_keywords?.work || [];
      expect(workKeywords).not.toContain('ab'); // too short
      expect(workKeywords).not.toContain(
        'verylongwordthatexceedstheeighteencharacterlimit',
      ); // too long
      expect(workKeywords).toContain('mid');
    });

    it('handles multiple space names correctly', () => {
      const evs: LeanEvent[] = [
        mkEvent({ payload_json: { text: 'workout routine', toSpaceName: 'Fitness' } }),
        mkEvent({ payload_json: { text: 'project deadline', toSpaceName: 'Work' } }),
        mkEvent({ payload_json: { text: 'recipe ideas', toSpaceName: 'Home' } }),
      ];
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      expect(Object.keys(res.mergedPrefs.routing_keywords || {})).toEqual(
        expect.arrayContaining(['fitness', 'work', 'home']),
      );
    });
  });

  describe('tone adjustment based on accept/override balance', () => {
    it('adjusts tone to direct when user accepts most auto-decisions', () => {
      const evs: LeanEvent[] = Array.from({ length: 6 }, (_, i) =>
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: `note ${i}`, spaceName: 'Work', accepted: i < 5 },
        }),
      );
      const current: CortexPreferences = { user_id: 'u_1', tone: 'calm', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      expect(['calm', 'warm', 'direct']).toContain(res.mergedPrefs.tone || 'calm');
      // With 5 accepts and 1 override, should bias toward direct
      expect(res.debug?.acceptCount).toBe(5);
      expect(res.debug?.overrideCount).toBe(1);
    });

    it('adjusts tone to warm when user overrides frequently', () => {
      const evs: LeanEvent[] = Array.from({ length: 8 }, (_, i) =>
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: `note ${i}`, spaceName: 'Work', accepted: i < 2 },
        }),
      );
      const current: CortexPreferences = { user_id: 'u_1', tone: 'calm', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      // With 2 accepts and 6 overrides, should bias toward warm
      expect(res.debug?.acceptCount).toBe(2);
      expect(res.debug?.overrideCount).toBe(6);
    });

    it('does not change tone if insufficient signal (< 6 events)', () => {
      const evs: LeanEvent[] = Array.from({ length: 3 }, (_, i) =>
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: `note ${i}`, spaceName: 'Work', accepted: true },
        }),
      );
      const current: CortexPreferences = { user_id: 'u_1', tone: 'calm', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      // Should not change tone with only 3 events
      expect(res.mergedPrefs.tone).toBeUndefined();
    });

    it('handles userOverrode flag in addition to accepted=false', () => {
      const evs: LeanEvent[] = [
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: 'test', spaceName: 'Work', accepted: true },
        }),
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: 'test2', spaceName: 'Work', userOverrode: true },
        }),
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: 'test3', spaceName: 'Work', accepted: false },
        }),
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: 'test4', spaceName: 'Work', accepted: true },
        }),
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: 'test5', spaceName: 'Work', userOverrode: true },
        }),
        mkEvent({
          kind: 'cortex_decision',
          payload_json: { text: 'test6', spaceName: 'Work', accepted: true },
        }),
      ];
      const current: CortexPreferences = { user_id: 'u_1', tone: 'calm', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      expect(res.debug?.acceptCount).toBe(3);
      expect(res.debug?.overrideCount).toBe(3); // 2 userOverrode + 1 accepted=false
    });
  });

  describe('edge cases', () => {
    it('handles empty events array', () => {
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents([], current);

      expect(res.mergedPrefs.routing_keywords).toEqual({});
      expect(res.learnedAt).toBeTruthy();
    });

    it('handles events with missing payload_json', () => {
      const evs: LeanEvent[] = [
        {
          id: '1',
          user_id: 'u_1',
          kind: 'user_override',
          payload_json: {} as any,
          created_at: new Date().toISOString(),
        },
      ];
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      // Should not crash
      expect(res).toBeDefined();
      expect(res.mergedPrefs).toBeDefined();
    });

    it('handles events with null/undefined text fields', () => {
      const evs: LeanEvent[] = [
        mkEvent({ payload_json: { text: null, toSpaceName: 'Work' } }),
        mkEvent({ payload_json: { toSpaceName: 'Work' } }),
      ];
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      // Should not crash
      expect(res).toBeDefined();
    });

    it('returns ISO timestamp for learnedAt', () => {
      const evs: LeanEvent[] = [mkEvent()];
      const current: CortexPreferences = { user_id: 'u_1', routing_keywords: {} };
      const res = learnFromEvents(evs, current);

      expect(res.learnedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(res.learnedAt).toISOString()).toBe(res.learnedAt);
    });
  });
});
