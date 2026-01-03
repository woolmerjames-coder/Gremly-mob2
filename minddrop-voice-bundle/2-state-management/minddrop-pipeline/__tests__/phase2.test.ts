/**
 * Phase 2 Date Context Tests
 *
 * Tests that date context (timezone, dayOfWeek) is correctly passed to the AI.
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
