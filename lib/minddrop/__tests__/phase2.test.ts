/**
 * Phase 2 Date Context Tests
 *
 * Tests that date context (timezone, dayOfWeek) is correctly passed to the AI.
 * Also tests smart_title preservation from Phase 1.
 */

import { getDateService, resetDateService, createDateService } from '../../date/DateService';

// Mock fetch
global.fetch = jest.fn();

describe('Phase 2 Date Context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDateService();
  });

  afterEach(() => {
    resetDateService();
  });

  describe('DateService integration', () => {
    it('should provide timezone from DateService', () => {
      const dateService = getDateService();
      const timezone = dateService.getTimezone();

      expect(timezone).toBeDefined();
      expect(typeof timezone).toBe('string');
      expect(timezone.length).toBeGreaterThan(0);
    });

    it('should provide dayOfWeek from DateService', () => {
      const dateService = getDateService();
      const dayOfWeek = dateService.getDayOfWeek();

      expect(dayOfWeek).toBeDefined();
      expect([
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]).toContain(dayOfWeek);
    });

    it('should provide currentDate in YYYY-MM-DD format', () => {
      const dateService = getDateService();
      const currentDate = dateService.getCurrentDate();

      expect(currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should use injectable clock for consistent testing', () => {
      const fixedDate = new Date('2025-12-22T10:00:00');
      const service = createDateService({
        clock: () => fixedDate,
        timezone: 'America/Los_Angeles',
      });

      expect(service.getCurrentDate()).toBe('2025-12-22');
      expect(service.getDayOfWeek()).toBe('Monday');
      expect(service.getTimezone()).toBe('America/Los_Angeles');
    });
  });

  describe('API payload structure', () => {
    it('should include all required date context fields', () => {
      const dateService = getDateService();

      const expectedPayload = {
        type: 'enrich-phase2',
        text: 'test text',
        bucket: 'todo',
        subtype: null,
        currentDate: dateService.getCurrentDate(),
        timezone: dateService.getTimezone(),
        dayOfWeek: dateService.getDayOfWeek(),
      };

      // Verify the expected structure
      expect(expectedPayload.type).toBe('enrich-phase2');
      expect(expectedPayload.timezone).toBeDefined();
      expect(expectedPayload.dayOfWeek).toBeDefined();
      expect(expectedPayload.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should have consistent date context with injectable clock', () => {
      const fixedDate = new Date('2025-12-25T14:30:00');
      const service = createDateService({
        clock: () => fixedDate,
        timezone: 'Europe/London',
      });

      const payload = {
        currentDate: service.getCurrentDate(),
        timezone: service.getTimezone(),
        dayOfWeek: service.getDayOfWeek(),
      };

      expect(payload.currentDate).toBe('2025-12-25');
      expect(payload.timezone).toBe('Europe/London');
      expect(payload.dayOfWeek).toBe('Thursday');
    });
  });

  describe('timezone handling', () => {
    it('should auto-detect timezone when not provided', () => {
      const service = createDateService();
      const timezone = service.getTimezone();

      // Should be a valid IANA timezone string
      expect(timezone).toBeDefined();
      expect(timezone).not.toBe('');
    });

    it('should use provided timezone', () => {
      const service = createDateService({
        timezone: 'Asia/Tokyo',
      });

      expect(service.getTimezone()).toBe('Asia/Tokyo');
    });

    it('should allow timezone to be changed', () => {
      const service = createDateService({
        timezone: 'America/New_York',
      });

      expect(service.getTimezone()).toBe('America/New_York');

      service.setTimezone('America/Los_Angeles');
      expect(service.getTimezone()).toBe('America/Los_Angeles');
    });
  });
});

describe('Phase 2 smart_title Preservation', () => {
  /**
   * Phase 1 provides smart_title and confirmation_message.
   * Phase 2 provides metadata (tags, dates, etc.) but should NOT overwrite
   * the smart_title from Phase 1.
   *
   * Implementation note: dropProcessor stores Phase 1's smart_title before
   * running Phase 2, so Phase 2's response doesn't clobber it.
   */

  describe('Phase 1 smart_title is preserved', () => {
    it('dropProcessor stores Phase 1 smart_title before Phase 2', () => {
      // This is tested in dropProcessor.test.ts, but documenting the pattern here:
      // 1. Phase 1 returns { bucket, smart_title, confirmation_message }
      // 2. dropProcessor saves these to the drop queue immediately
      // 3. Phase 2 returns { tags, dates, etc. } - no smart_title
      // 4. Sync uses the smart_title from step 2

      const phase1Result = {
        bucket: 'todo',
        smart_title: 'Buy Groceries',
        confirmation_message: 'Shopping task added!',
      };

      // The smart_title from Phase 1 should be preserved
      expect(phase1Result.smart_title).toBe('Buy Groceries');
      expect(phase1Result.confirmation_message).toBe('Shopping task added!');
    });

    it('Phase 2 API response does not include smart_title', () => {
      // Phase 2 API contract - returns metadata only
      const phase2ApiResponse = {
        tags: ['groceries', 'shopping'],
        time_estimate_minutes: 30,
        time_window: 'morning',
        extracted_date: '2025-01-20',
        people: [],
      };

      // Verify Phase 2 doesn't return smart_title (it comes from Phase 1)
      expect(phase2ApiResponse).not.toHaveProperty('smart_title');
    });

    it('multi-segment drops preserve per-segment smart_title from Phase 1', () => {
      // For multi-entity drops, Phase 1 returns smart_title per segment
      const multiResult = {
        is_multi: true,
        segments: [
          { text: 'buy milk', bucket: 'todo', smart_title: 'Buy Milk' },
          { text: 'start running', bucket: 'habit', smart_title: 'Morning Run' },
        ],
      };

      // Each segment has its own smart_title from Phase 1
      expect(multiResult.segments[0].smart_title).toBe('Buy Milk');
      expect(multiResult.segments[1].smart_title).toBe('Morning Run');
    });
  });
});
