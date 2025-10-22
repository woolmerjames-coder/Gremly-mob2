/**
 * Phase 10.2: Cortex Preferences tests (memory-backed, no DB)
 */

import { MemoryRepo } from '../lib/repo/memory';

describe('MemoryRepo - Cortex Preferences (Phase 10.2)', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user-123');
  });

  describe('getCortexPrefs', () => {
    it('should return null initially when no preferences set', async () => {
      // Act
      const prefs = await repo.getCortexPrefs('u_123');

      // Assert
      expect(prefs).toBeNull();
    });

    it('should return preferences after they are set', async () => {
      // Arrange: Set preferences
      await repo.setCortexPrefs('u_123', { tone: 'warm' });

      // Act: Get preferences
      const prefs = await repo.getCortexPrefs('u_123');

      // Assert
      expect(prefs).not.toBeNull();
      expect(prefs?.owner_id).toBe('u_123');
      expect(prefs?.tone).toBe('warm');
    });
  });

  describe('setCortexPrefs', () => {
    it('should create preferences with partial fields', async () => {
      // Act: Set initial preferences
      const prefs = await repo.setCortexPrefs('u_123', {
        tone: 'warm',
        brevity: 'short',
      });

      // Assert: Preferences created with correct fields
      expect(prefs.owner_id).toBe('u_123');
      expect(prefs.tone).toBe('warm');
      expect(prefs.brevity).toBe('short');
      expect(prefs.updated_at).toBeDefined();
    });

    it('should merge partial updates with existing preferences', async () => {
      // Arrange: Set initial preferences
      await repo.setCortexPrefs('u_123', {
        tone: 'warm',
        brevity: 'short',
      });

      // Act: Update only encouragement
      const updated = await repo.setCortexPrefs('u_123', {
        encouragement: 'high',
      });

      // Assert: Previous fields preserved, new field added
      expect(updated.tone).toBe('warm');
      expect(updated.brevity).toBe('short');
      expect(updated.encouragement).toBe('high');
      expect(updated.updated_at).toBeDefined();
    });

    it('should overwrite fields on subsequent updates', async () => {
      // Arrange: Set initial tone
      await repo.setCortexPrefs('u_123', { tone: 'warm' });

      // Act: Update tone
      const updated = await repo.setCortexPrefs('u_123', { tone: 'calm' });

      // Assert: Tone changed
      expect(updated.tone).toBe('calm');
    });

    it('should handle all preference fields', async () => {
      // Act: Set all fields
      const prefs = await repo.setCortexPrefs('u_123', {
        tone: 'direct',
        brevity: 'detailed',
        encouragement: 'medium',
        morning_preview: '08:00:00',
        evening_review: '20:00:00',
        dnd: { start: '22:00', end: '07:00', days: ['Mon', 'Tue', 'Wed'] },
      });

      // Assert: All fields set
      expect(prefs.tone).toBe('direct');
      expect(prefs.brevity).toBe('detailed');
      expect(prefs.encouragement).toBe('medium');
      expect(prefs.morning_preview).toBe('08:00:00');
      expect(prefs.evening_review).toBe('20:00:00');
      expect(prefs.dnd).toEqual({ start: '22:00', end: '07:00', days: ['Mon', 'Tue', 'Wed'] });
      expect(prefs.updated_at).toBeDefined();
    });

    it('should update updated_at timestamp on each change', async () => {
      // Arrange: Set initial preferences
      const initial = await repo.setCortexPrefs('u_123', { tone: 'warm' });
      const initialTime = initial.updated_at;

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Act: Update preferences
      const updated = await repo.setCortexPrefs('u_123', { brevity: 'short' });

      // Assert: updated_at changed
      expect(updated.updated_at).toBeDefined();
      expect(updated.updated_at).not.toBe(initialTime);
    });

    it('should handle multiple users independently', async () => {
      // Arrange: Set preferences for two users
      await repo.setCortexPrefs('u_123', { tone: 'warm' });
      await repo.setCortexPrefs('u_456', { tone: 'calm' });

      // Act: Get preferences for each user
      const prefs1 = await repo.getCortexPrefs('u_123');
      const prefs2 = await repo.getCortexPrefs('u_456');

      // Assert: Each user has their own preferences
      expect(prefs1?.tone).toBe('warm');
      expect(prefs2?.tone).toBe('calm');
    });

    it('should handle null values in partial updates', async () => {
      // Arrange: Set initial preferences
      await repo.setCortexPrefs('u_123', {
        tone: 'warm',
        morning_preview: '08:00:00',
      });

      // Act: Clear morning_preview
      const updated = await repo.setCortexPrefs('u_123', {
        morning_preview: null,
      });

      // Assert: Field cleared but others preserved
      expect(updated.tone).toBe('warm');
      expect(updated.morning_preview).toBeNull();
    });
  });

  describe('preferences integration', () => {
    it('should support full upsert workflow', async () => {
      // Act: Initial check (should be null)
      const initial = await repo.getCortexPrefs('u_123');
      expect(initial).toBeNull();

      // Act: Set preferences
      const created = await repo.setCortexPrefs('u_123', {
        tone: 'warm',
        brevity: 'short',
      });
      expect(created.tone).toBe('warm');

      // Act: Get preferences
      const retrieved = await repo.getCortexPrefs('u_123');
      expect(retrieved?.tone).toBe('warm');
      expect(retrieved?.brevity).toBe('short');

      // Act: Update preferences
      const updated = await repo.setCortexPrefs('u_123', {
        encouragement: 'high',
      });
      expect(updated.tone).toBe('warm'); // Preserved
      expect(updated.encouragement).toBe('high'); // Added

      // Act: Final get
      const final = await repo.getCortexPrefs('u_123');
      expect(final?.tone).toBe('warm');
      expect(final?.brevity).toBe('short');
      expect(final?.encouragement).toBe('high');
    });
  });
});
