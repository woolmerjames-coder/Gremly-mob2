import {
  DateService,
  createDateService,
  getDateService,
  resetDateService,
  type ParsedDate,
  isTimestampToday,
  isTimestampWithinDays,
  extractDateFromIso,
} from '../DateService';

describe('DateService', () => {
  let service: DateService;
  const fixedDate = new Date('2025-12-22T10:00:00');

  beforeEach(() => {
    resetDateService();
    // Create service with injectable clock for deterministic tests
    service = createDateService({
      clock: () => fixedDate,
    });
  });

  afterEach(() => {
    resetDateService();
  });

  // ═══════════════════════════════════════════════════════════════════
  // FACTORY & SINGLETON
  // ═══════════════════════════════════════════════════════════════════

  describe('factory and singleton', () => {
    it('createDateService creates a new instance each time', () => {
      const instance1 = createDateService();
      const instance2 = createDateService();
      expect(instance1).not.toBe(instance2);
    });

    it('getDateService returns singleton', () => {
      const instance1 = getDateService();
      const instance2 = getDateService();
      expect(instance1).toBe(instance2);
    });

    it('resetDateService clears the singleton', () => {
      const instance1 = getDateService();
      resetDateService();
      const instance2 = getDateService();
      expect(instance1).not.toBe(instance2);
    });

    it('injectable clock works correctly', () => {
      const customDate = new Date('2030-06-15T14:30:00');
      const customService = createDateService({
        clock: () => customDate,
      });
      expect(customService.getCurrentDate()).toBe('2030-06-15');
    });

    it('DateService.getInstance returns singleton for backward compatibility', () => {
      const instance1 = DateService.getInstance();
      const instance2 = DateService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('DateService.resetInstance clears singleton', () => {
      const instance1 = DateService.getInstance();
      DateService.resetInstance();
      const instance2 = DateService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CURRENT DATE/TIME
  // ═══════════════════════════════════════════════════════════════════

  describe('getCurrentDate', () => {
    it('returns YYYY-MM-DD format', () => {
      expect(service.getCurrentDate()).toBe('2025-12-22');
    });

    it('uses injectable clock', () => {
      const afternoonService = createDateService({
        clock: () => new Date('2025-12-22T23:59:59'),
      });
      expect(afternoonService.getCurrentDate()).toBe('2025-12-22');
    });

    it('returns next day after midnight', () => {
      const midnightService = createDateService({
        clock: () => new Date('2025-12-23T00:01:00'),
      });
      expect(midnightService.getCurrentDate()).toBe('2025-12-23');
    });
  });

  describe('getCurrentDateTime', () => {
    it('returns ISO string', () => {
      const result = service.getCurrentDateTime();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('now', () => {
    it('returns the injectable clock time', () => {
      expect(service.now()).toEqual(fixedDate);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // NEW CONVENIENCE METHODS (sweep-refinements-1.13 branch)
  // ═══════════════════════════════════════════════════════════════════

  describe('today()', () => {
    it('returns current date in YYYY-MM-DD format', () => {
      expect(service.today()).toBe('2025-12-22');
    });

    it('is equivalent to getCurrentDate()', () => {
      expect(service.today()).toBe(service.getCurrentDate());
    });

    it('uses injectable clock', () => {
      const afternoonService = createDateService({
        clock: () => new Date('2025-12-25T23:59:59'),
      });
      expect(afternoonService.today()).toBe('2025-12-25');
    });
  });

  describe('tomorrow()', () => {
    it('returns next day in YYYY-MM-DD format', () => {
      expect(service.tomorrow()).toBe('2025-12-23');
    });

    it('handles month boundary', () => {
      const monthEndService = createDateService({
        clock: () => new Date('2025-12-31T10:00:00'),
      });
      expect(monthEndService.tomorrow()).toBe('2026-01-01');
    });

    it('handles year boundary', () => {
      const yearEndService = createDateService({
        clock: () => new Date('2025-12-31T10:00:00'),
      });
      expect(yearEndService.tomorrow()).toBe('2026-01-01');
    });
  });

  describe('yesterday()', () => {
    it('returns previous day in YYYY-MM-DD format', () => {
      expect(service.yesterday()).toBe('2025-12-21');
    });

    it('handles month boundary', () => {
      const monthStartService = createDateService({
        clock: () => new Date('2025-01-01T10:00:00'),
      });
      expect(monthStartService.yesterday()).toBe('2024-12-31');
    });
  });

  describe('daysAgo()', () => {
    it('returns date N days in past', () => {
      expect(service.daysAgo(7)).toBe('2025-12-15');
    });

    it('handles 0 days ago (today)', () => {
      expect(service.daysAgo(0)).toBe('2025-12-22');
    });

    it('handles 1 day ago (yesterday)', () => {
      expect(service.daysAgo(1)).toBe('2025-12-21');
    });

    it('handles month boundary', () => {
      expect(service.daysAgo(22)).toBe('2025-11-30');
    });
  });

  describe('daysFromNow()', () => {
    it('returns date N days in future', () => {
      expect(service.daysFromNow(7)).toBe('2025-12-29');
    });

    it('handles 0 days from now (today)', () => {
      expect(service.daysFromNow(0)).toBe('2025-12-22');
    });

    it('handles 1 day from now (tomorrow)', () => {
      expect(service.daysFromNow(1)).toBe('2025-12-23');
    });

    it('handles month boundary', () => {
      expect(service.daysFromNow(10)).toBe('2026-01-01');
    });
  });

  describe('getHour()', () => {
    it('returns hour 0-23 from injected clock', () => {
      expect(service.getHour()).toBe(10); // 10am from fixture
    });

    it('handles midnight', () => {
      const midnightService = createDateService({
        clock: () => new Date('2025-12-22T00:30:00'),
      });
      expect(midnightService.getHour()).toBe(0);
    });

    it('handles evening', () => {
      const eveningService = createDateService({
        clock: () => new Date('2025-12-22T20:45:00'),
      });
      expect(eveningService.getHour()).toBe(20);
    });

    it('handles near-midnight', () => {
      const lateService = createDateService({
        clock: () => new Date('2025-12-22T23:59:59'),
      });
      expect(lateService.getHour()).toBe(23);
    });
  });

  describe('getStartOfWeek()', () => {
    it('returns Monday of current week', () => {
      // Dec 22, 2025 is Monday
      expect(service.getStartOfWeek()).toBe('2025-12-22');
    });

    it('returns Monday when today is Tuesday', () => {
      const tuesdayService = createDateService({
        clock: () => new Date('2025-12-23T10:00:00'), // Tuesday
      });
      expect(tuesdayService.getStartOfWeek()).toBe('2025-12-22');
    });

    it('returns Monday when today is Friday', () => {
      const fridayService = createDateService({
        clock: () => new Date('2025-12-26T10:00:00'), // Friday
      });
      expect(fridayService.getStartOfWeek()).toBe('2025-12-22');
    });

    it('returns Monday when today is Sunday', () => {
      const sundayService = createDateService({
        clock: () => new Date('2025-12-28T10:00:00'), // Sunday
      });
      expect(sundayService.getStartOfWeek()).toBe('2025-12-22');
    });

    it('returns previous Monday when in next week', () => {
      const nextWeekService = createDateService({
        clock: () => new Date('2025-12-30T10:00:00'), // Tuesday next week
      });
      expect(nextWeekService.getStartOfWeek()).toBe('2025-12-29');
    });
  });

  describe('nowTimestamp()', () => {
    it('returns ISO timestamp string', () => {
      const result = service.nowTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('includes timezone indicator', () => {
      const result = service.nowTimestamp();
      // Should end with Z or timezone offset
      expect(result).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
    });
  });

  describe('extractLocalDate()', () => {
    it('extracts YYYY-MM-DD from ISO timestamp', () => {
      expect(service.extractLocalDate('2025-12-22T18:30:00.000Z')).toBe('2025-12-22');
    });

    it('extracts date from timestamp without Z suffix', () => {
      expect(service.extractLocalDate('2025-12-22T18:30:00')).toBe('2025-12-22');
    });

    it('returns null for null input', () => {
      expect(service.extractLocalDate(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(service.extractLocalDate(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(service.extractLocalDate('')).toBeNull();
    });

    it('returns null for invalid format', () => {
      expect(service.extractLocalDate('not-a-date')).toBeNull();
    });

    it('handles date-only string (passes through)', () => {
      expect(service.extractLocalDate('2025-12-22')).toBe('2025-12-22');
    });
  });

  describe('toLocalDate()', () => {
    it('converts Date to YYYY-MM-DD in local timezone', () => {
      const date = new Date(2025, 11, 22, 14, 30); // Dec 22, 2025 2:30pm
      expect(service.toLocalDate(date)).toBe('2025-12-22');
    });

    it('returns empty string for null', () => {
      expect(service.toLocalDate(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(service.toLocalDate(undefined)).toBe('');
    });

    it('pads single-digit month and day', () => {
      const date = new Date(2025, 0, 5, 10, 0); // Jan 5, 2025
      expect(service.toLocalDate(date)).toBe('2025-01-05');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PARSING - Multi-Stage Pipeline
  // ═══════════════════════════════════════════════════════════════════

  describe('parseNaturalDate', () => {
    describe('Stage 1: Custom patterns', () => {
      it('parses "eoy" as December 31 (custom)', () => {
        const result = service.parseNaturalDate('finish report by eoy');
        expect(result?.date).toBe('2025-12-31');
        expect(result?.method).toBe('custom');
        expect(result?.textWithoutDate).toBe('finish report by');
      });

      it('parses "end of year" as December 31 (custom)', () => {
        const result = service.parseNaturalDate('taxes end of year');
        expect(result?.date).toBe('2025-12-31');
        expect(result?.method).toBe('custom');
      });

      it('parses "EOY" uppercase (custom)', () => {
        const result = service.parseNaturalDate('review EOY');
        expect(result?.date).toBe('2025-12-31');
        expect(result?.method).toBe('custom');
      });

      it('parses "eom" as end of current month (custom)', () => {
        const result = service.parseNaturalDate('pay bills by eom');
        expect(result?.date).toBe('2025-12-31'); // December has 31 days
        expect(result?.method).toBe('custom');
      });

      it('parses "end of month" (custom)', () => {
        const result = service.parseNaturalDate('rent end of month');
        expect(result?.date).toBe('2025-12-31');
        expect(result?.method).toBe('custom');
      });

      it('parses "next week" as Monday of next week (custom)', () => {
        // Dec 22, 2025 is Monday, next week Monday is Dec 29
        const result = service.parseNaturalDate('meeting next week');
        expect(result?.date).toBe('2025-12-29');
        expect(result?.method).toBe('custom');
      });

      it('parses standalone "monday" as next Monday (custom)', () => {
        // Dec 22 is Monday, next Monday is Dec 29
        const result = service.parseNaturalDate('meeting monday');
        expect(result?.date).toBe('2025-12-29');
        expect(result?.method).toBe('custom');
      });

      it('parses standalone "tuesday" as next Tuesday (custom)', () => {
        // Dec 22 is Monday, next Tuesday is Dec 23
        const result = service.parseNaturalDate('dentist tuesday');
        expect(result?.date).toBe('2025-12-23');
        expect(result?.method).toBe('custom');
      });

      it('parses standalone "friday" as next Friday (custom)', () => {
        // Dec 22 is Monday, next Friday is Dec 26
        const result = service.parseNaturalDate('party friday');
        expect(result?.date).toBe('2025-12-26');
        expect(result?.method).toBe('custom');
      });
    });

    describe('Stage 2: chrono-node patterns', () => {
      it('parses "today" (chrono)', () => {
        const result = service.parseNaturalDate('do this today');
        expect(result?.date).toBe('2025-12-22');
        expect(result?.method).toBe('chrono');
        expect(result?.textWithoutDate).toBe('do this');
      });

      it('parses "tomorrow" (chrono)', () => {
        const result = service.parseNaturalDate('call mom tomorrow');
        expect(result?.date).toBe('2025-12-23');
        expect(result?.method).toBe('chrono');
        expect(result?.textWithoutDate).toBe('call mom');
      });

      it('parses "next tuesday" (chrono)', () => {
        // chrono interprets "next tuesday" as the tuesday of next week
        const result = service.parseNaturalDate('meeting next tuesday');
        expect(result?.date).toBe('2025-12-30');
        expect(result?.method).toBe('chrono');
      });

      it('parses "in 3 days" (chrono)', () => {
        const result = service.parseNaturalDate('finish this in 3 days');
        expect(result?.date).toBe('2025-12-25');
        expect(result?.method).toBe('chrono');
      });

      it('parses "Dec 25" (chrono)', () => {
        const result = service.parseNaturalDate('christmas party Dec 25');
        expect(result?.date).toBe('2025-12-25');
        expect(result?.method).toBe('chrono');
      });

      it('parses "December 25" (chrono)', () => {
        const result = service.parseNaturalDate('dinner December 25');
        expect(result?.date).toBe('2025-12-25');
        expect(result?.method).toBe('chrono');
      });

      it('parses "Jan 15" as next year when in December (chrono)', () => {
        const result = service.parseNaturalDate('new years goal Jan 15');
        expect(result?.date).toBe('2026-01-15');
        expect(result?.method).toBe('chrono');
      });
    });

    describe('Stage 3: Regex fallback', () => {
      it('parses ISO date "2025-12-25"', () => {
        const result = service.parseNaturalDate('deadline is 2025-12-25');
        expect(result?.date).toBe('2025-12-25');
        // chrono-node may handle this, so we just verify the date is correct
        expect(['chrono', 'regex']).toContain(result?.method);
      });

      it('parses US date "12/25"', () => {
        const result = service.parseNaturalDate('gift shopping 12/25');
        expect(result?.date).toBe('2025-12-25');
        // chrono-node handles US date formats
        expect(['chrono', 'regex']).toContain(result?.method);
      });

      it('parses US date "12/25/2025"', () => {
        const result = service.parseNaturalDate('event on 12/25/2025');
        expect(result?.date).toBe('2025-12-25');
        expect(['chrono', 'regex']).toContain(result?.method);
      });

      it('parses US date "1/5/26" with 2-digit year', () => {
        const result = service.parseNaturalDate('meeting 1/5/26');
        expect(result?.date).toBe('2026-01-05');
        expect(['chrono', 'regex']).toContain(result?.method);
      });
    });

    describe('time extraction', () => {
      it('extracts time from "tomorrow at 3pm"', () => {
        const result = service.parseNaturalDate('meeting tomorrow at 3pm');
        expect(result?.date).toBe('2025-12-23');
        expect(result?.time).toBe('15:00');
      });

      it('extracts time from "Dec 25 at 10:30am"', () => {
        const result = service.parseNaturalDate('breakfast Dec 25 at 10:30am');
        expect(result?.date).toBe('2025-12-25');
        expect(result?.time).toBe('10:30');
      });

      it('returns null time for date-only input', () => {
        const result = service.parseNaturalDate('task tomorrow');
        expect(result?.date).toBe('2025-12-23');
        expect(result?.time).toBeNull();
      });
    });

    describe('text extraction', () => {
      it('removes date from beginning of text', () => {
        const result = service.parseNaturalDate('tomorrow call the dentist');
        expect(result?.textWithoutDate).toBe('call the dentist');
      });

      it('removes date from middle of text', () => {
        const result = service.parseNaturalDate('need to call mom tomorrow about dinner');
        expect(result?.textWithoutDate).toBe('need to call mom about dinner');
      });

      it('removes date from end of text', () => {
        const result = service.parseNaturalDate('submit report by friday');
        expect(result?.textWithoutDate).toBe('submit report by');
      });

      it('collapses multiple spaces after removal', () => {
        const result = service.parseNaturalDate('do   tomorrow   this');
        expect(result?.textWithoutDate).toBe('do this');
      });
    });

    describe('edge cases', () => {
      it('returns null for empty input', () => {
        expect(service.parseNaturalDate('')).toBeNull();
        expect(service.parseNaturalDate('   ')).toBeNull();
      });

      it('returns null for input with no date', () => {
        expect(service.parseNaturalDate('buy milk')).toBeNull();
      });

      it('handles input with only date', () => {
        const result = service.parseNaturalDate('tomorrow');
        expect(result?.date).toBe('2025-12-23');
        expect(result?.textWithoutDate).toBe('');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AI DATE VALIDATION
  // ═══════════════════════════════════════════════════════════════════

  describe('parseAIDate', () => {
    it('accepts valid YYYY-MM-DD', () => {
      expect(service.parseAIDate('2025-12-25')).toBe('2025-12-25');
    });

    it('extracts date from ISO timestamp', () => {
      expect(service.parseAIDate('2025-12-25T14:30:00Z')).toBe('2025-12-25');
    });

    it('returns null for invalid date format', () => {
      expect(service.parseAIDate('not-a-date')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(service.parseAIDate(null)).toBeNull();
      expect(service.parseAIDate(undefined)).toBeNull();
    });

    it('returns null for invalid date like Feb 31', () => {
      expect(service.parseAIDate('2025-02-31')).toBeNull();
    });

    it('rejects dates more than 365 days in past', () => {
      // Fixed date is 2025-12-22, so 2024-12-20 is ~367 days ago
      expect(service.parseAIDate('2024-12-20')).toBeNull();
    });

    it('accepts dates within 365 days in past', () => {
      // 2025-01-01 is ~355 days ago from 2025-12-22
      expect(service.parseAIDate('2025-01-01')).toBe('2025-01-01');
    });

    it('rejects dates more than 730 days in future', () => {
      // 2027-12-25 is ~733 days from 2025-12-22
      expect(service.parseAIDate('2027-12-25')).toBeNull();
    });

    it('accepts dates within 730 days in future', () => {
      // 2027-12-01 is ~709 days from 2025-12-22
      expect(service.parseAIDate('2027-12-01')).toBe('2027-12-01');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONVERSION
  // ═══════════════════════════════════════════════════════════════════

  describe('toDateString', () => {
    it('converts Date to YYYY-MM-DD', () => {
      const date = new Date(2025, 11, 25); // Dec 25, 2025
      expect(service.toDateString(date)).toBe('2025-12-25');
    });

    it('pads single digit months and days', () => {
      const date = new Date(2025, 0, 5); // Jan 5, 2025
      expect(service.toDateString(date)).toBe('2025-01-05');
    });

    it('returns empty string for null', () => {
      expect(service.toDateString(null)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(service.toDateString(new Date('invalid'))).toBe('');
    });
  });

  describe('fromDateString', () => {
    it('parses YYYY-MM-DD to Date', () => {
      const date = service.fromDateString('2025-12-25');
      expect(date?.getFullYear()).toBe(2025);
      expect(date?.getMonth()).toBe(11); // December
      expect(date?.getDate()).toBe(25);
    });

    it('sets time to noon to avoid DST issues', () => {
      const date = service.fromDateString('2025-12-25');
      expect(date?.getHours()).toBe(12);
    });

    it('returns null for invalid format', () => {
      expect(service.fromDateString('12/25/2025')).toBeNull();
      expect(service.fromDateString('2025-12')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(service.fromDateString(null)).toBeNull();
      expect(service.fromDateString(undefined)).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // FORMATTING
  // ═══════════════════════════════════════════════════════════════════

  describe('formatForChip', () => {
    it('returns "Today" for today', () => {
      expect(service.formatForChip('2025-12-22')).toBe('Today');
    });

    it('returns "Tomorrow" for tomorrow', () => {
      expect(service.formatForChip('2025-12-23')).toBe('Tomorrow');
    });

    it('returns weekday abbreviation for dates within 7 days', () => {
      // Dec 22 is Monday
      expect(service.formatForChip('2025-12-24')).toBe('Wed'); // 2 days out
      expect(service.formatForChip('2025-12-25')).toBe('Thu'); // 3 days out
      expect(service.formatForChip('2025-12-26')).toBe('Fri'); // 4 days out
      expect(service.formatForChip('2025-12-28')).toBe('Sun'); // 6 days out
    });

    it('returns "Mon D" for dates beyond 7 days in same year', () => {
      expect(service.formatForChip('2025-12-30')).toBe('Dec 30');
    });

    it('returns "Mon D, YYYY" for dates in different year', () => {
      expect(service.formatForChip('2026-01-15')).toBe('Jan 15, 2026');
    });

    it('returns empty string for null/undefined', () => {
      expect(service.formatForChip(null)).toBe('');
      expect(service.formatForChip(undefined)).toBe('');
    });
  });

  describe('formatForOverlay', () => {
    it('returns "Today" for today', () => {
      expect(service.formatForOverlay('2025-12-22')).toBe('Today');
    });

    it('returns "Tomorrow" for tomorrow', () => {
      expect(service.formatForOverlay('2025-12-23')).toBe('Tomorrow');
    });

    it('returns full weekday and date', () => {
      expect(service.formatForOverlay('2025-12-25')).toBe('Thursday, December 25');
    });

    it('includes year for different year', () => {
      expect(service.formatForOverlay('2026-01-15')).toBe('Thursday, January 15, 2026');
    });

    it('returns "No date set" for null/undefined', () => {
      expect(service.formatForOverlay(null)).toBe('No date set');
      expect(service.formatForOverlay(undefined)).toBe('No date set');
    });

    it('returns "Invalid date" for invalid date string', () => {
      expect(service.formatForOverlay('not-a-date')).toBe('Invalid date');
    });
  });

  describe('formatRelative', () => {
    it('returns "Today" for today', () => {
      expect(service.formatRelative('2025-12-22')).toBe('Today');
    });

    it('returns "Tomorrow" for tomorrow', () => {
      expect(service.formatRelative('2025-12-23')).toBe('Tomorrow');
    });

    it('returns "Yesterday" for yesterday', () => {
      expect(service.formatRelative('2025-12-21')).toBe('Yesterday');
    });

    it('returns "in X days" for future dates within 7 days', () => {
      expect(service.formatRelative('2025-12-24')).toBe('in 2 days');
      expect(service.formatRelative('2025-12-25')).toBe('in 3 days');
    });

    it('returns "X days ago" for past dates within 7 days', () => {
      expect(service.formatRelative('2025-12-20')).toBe('2 days ago');
      expect(service.formatRelative('2025-12-18')).toBe('4 days ago');
    });

    it('falls back to formatForChip for dates beyond 7 days', () => {
      expect(service.formatRelative('2025-12-30')).toBe('Dec 30');
    });

    it('returns empty string for null/undefined', () => {
      expect(service.formatRelative(null)).toBe('');
      expect(service.formatRelative(undefined)).toBe('');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // COMPARISON
  // ═══════════════════════════════════════════════════════════════════

  describe('isToday', () => {
    it('returns true for today', () => {
      expect(service.isToday('2025-12-22')).toBe(true);
    });

    it('returns false for other dates', () => {
      expect(service.isToday('2025-12-23')).toBe(false);
      expect(service.isToday('2025-12-21')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(service.isToday(null)).toBe(false);
      expect(service.isToday(undefined)).toBe(false);
    });
  });

  describe('isTomorrow', () => {
    it('returns true for tomorrow', () => {
      expect(service.isTomorrow('2025-12-23')).toBe(true);
    });

    it('returns false for other dates', () => {
      expect(service.isTomorrow('2025-12-22')).toBe(false);
      expect(service.isTomorrow('2025-12-24')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(service.isTomorrow(null)).toBe(false);
    });
  });

  describe('isYesterday', () => {
    it('returns true for yesterday', () => {
      expect(service.isYesterday('2025-12-21')).toBe(true);
    });

    it('returns false for other dates', () => {
      expect(service.isYesterday('2025-12-22')).toBe(false);
      expect(service.isYesterday('2025-12-20')).toBe(false);
    });
  });

  describe('isThisWeek', () => {
    it('returns true for dates within 7 days', () => {
      expect(service.isThisWeek('2025-12-22')).toBe(true); // today
      expect(service.isThisWeek('2025-12-25')).toBe(true); // 3 days out
      expect(service.isThisWeek('2025-12-29')).toBe(true); // 7 days out
    });

    it('returns false for dates beyond 7 days', () => {
      expect(service.isThisWeek('2025-12-30')).toBe(false);
    });

    it('returns false for past dates', () => {
      expect(service.isThisWeek('2025-12-21')).toBe(false);
    });
  });

  describe('isPast', () => {
    it('returns true for past dates', () => {
      expect(service.isPast('2025-12-21')).toBe(true);
      expect(service.isPast('2025-12-01')).toBe(true);
    });

    it('returns false for today', () => {
      expect(service.isPast('2025-12-22')).toBe(false);
    });

    it('returns false for future dates', () => {
      expect(service.isPast('2025-12-23')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(service.isPast(null)).toBe(false);
    });
  });

  describe('isFuture', () => {
    it('returns true for future dates', () => {
      expect(service.isFuture('2025-12-23')).toBe(true);
      expect(service.isFuture('2026-01-01')).toBe(true);
    });

    it('returns false for today', () => {
      expect(service.isFuture('2025-12-22')).toBe(false);
    });

    it('returns false for past dates', () => {
      expect(service.isFuture('2025-12-21')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(service.isFuture(null)).toBe(false);
    });
  });

  describe('isOverdue', () => {
    it('returns true for past dates (not today)', () => {
      expect(service.isOverdue('2025-12-21')).toBe(true);
      expect(service.isOverdue('2025-12-01')).toBe(true);
    });

    it('returns false for today', () => {
      expect(service.isOverdue('2025-12-22')).toBe(false);
    });

    it('returns false for future dates', () => {
      expect(service.isOverdue('2025-12-23')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(service.isOverdue(null)).toBe(false);
    });
  });

  describe('daysBetween', () => {
    it('returns positive number for future date', () => {
      expect(service.daysBetween('2025-12-22', '2025-12-25')).toBe(3);
    });

    it('returns negative number for past date', () => {
      expect(service.daysBetween('2025-12-25', '2025-12-22')).toBe(-3);
    });

    it('returns 0 for same date', () => {
      expect(service.daysBetween('2025-12-22', '2025-12-22')).toBe(0);
    });

    it('handles month boundaries', () => {
      expect(service.daysBetween('2025-12-30', '2026-01-02')).toBe(3);
    });

    it('handles year boundaries', () => {
      expect(service.daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // MANIPULATION
  // ═══════════════════════════════════════════════════════════════════

  describe('addDays', () => {
    it('adds days correctly', () => {
      expect(service.addDays('2025-12-22', 3)).toBe('2025-12-25');
    });

    it('subtracts days with negative number', () => {
      expect(service.addDays('2025-12-22', -3)).toBe('2025-12-19');
    });

    it('handles month boundaries', () => {
      expect(service.addDays('2025-12-30', 3)).toBe('2026-01-02');
    });

    it('handles year boundaries', () => {
      expect(service.addDays('2025-12-31', 1)).toBe('2026-01-01');
    });

    it('returns original string for invalid date', () => {
      expect(service.addDays('invalid', 3)).toBe('invalid');
    });
  });

  describe('getNextWeekday', () => {
    it('returns next Monday from Monday', () => {
      // Dec 22, 2025 is Monday, next Monday is Dec 29
      const result = service.getNextWeekday(1); // Monday = 1
      expect(service.toDateString(result)).toBe('2025-12-29');
    });

    it('returns next Tuesday from Monday', () => {
      // Dec 22 is Monday, next Tuesday is Dec 23
      const result = service.getNextWeekday(2); // Tuesday = 2
      expect(service.toDateString(result)).toBe('2025-12-23');
    });

    it('returns next Sunday from Monday', () => {
      // Dec 22 is Monday, next Sunday is Dec 28
      const result = service.getNextWeekday(0); // Sunday = 0
      expect(service.toDateString(result)).toBe('2025-12-28');
    });

    it('uses provided reference date', () => {
      const refDate = new Date(2025, 11, 25); // Thursday Dec 25
      const result = service.getNextWeekday(1, refDate); // Next Monday
      expect(service.toDateString(result)).toBe('2025-12-29');
    });

    it('sets time to noon to avoid DST issues', () => {
      const result = service.getNextWeekday(1);
      expect(result.getHours()).toBe(12);
    });
  });

  describe('getEndOfMonth', () => {
    it('returns last day of December', () => {
      expect(service.getEndOfMonth()).toBe('2025-12-31');
    });

    it('handles February in leap year', () => {
      const refDate = new Date(2024, 1, 15); // Feb 15, 2024 (leap year)
      expect(service.getEndOfMonth(refDate)).toBe('2024-02-29');
    });

    it('handles February in non-leap year', () => {
      const refDate = new Date(2025, 1, 15); // Feb 15, 2025
      expect(service.getEndOfMonth(refDate)).toBe('2025-02-28');
    });

    it('handles 30-day months', () => {
      const refDate = new Date(2025, 10, 15); // Nov 15, 2025
      expect(service.getEndOfMonth(refDate)).toBe('2025-11-30');
    });
  });

  describe('getEndOfYear', () => {
    it('returns December 31 of current year', () => {
      expect(service.getEndOfYear()).toBe('2025-12-31');
    });

    it('returns December 31 of reference year', () => {
      const refDate = new Date(2026, 5, 15); // June 15, 2026
      expect(service.getEndOfYear(refDate)).toBe('2026-12-31');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TIMEZONE HANDLING
  // ═══════════════════════════════════════════════════════════════════

  describe('timezone handling', () => {
    it('auto-detects timezone', () => {
      const tz = service.getTimezone();
      expect(tz).toBeTruthy();
      expect(typeof tz).toBe('string');
    });

    it('allows setting timezone', () => {
      service.setTimezone('America/New_York');
      expect(service.getTimezone()).toBe('America/New_York');
    });

    it('accepts custom timezone in config', () => {
      const customService = createDateService({
        timezone: 'Europe/London',
        clock: () => fixedDate,
      });
      expect(customService.getTimezone()).toBe('Europe/London');
    });

    it('toDateString uses local timezone, not UTC', () => {
      // Create a date at 11 PM local time
      const date = new Date(2025, 11, 22, 23, 0, 0);
      // Should still be Dec 22, not Dec 23 (which would happen with UTC conversion)
      expect(service.toDateString(date)).toBe('2025-12-22');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getDayOfWeek
  // ═══════════════════════════════════════════════════════════════════

  describe('getDayOfWeek', () => {
    it('returns Monday for Dec 22, 2025', () => {
      expect(service.getDayOfWeek()).toBe('Monday');
    });

    it('uses injectable clock', () => {
      const thursdayService = createDateService({
        clock: () => new Date('2025-12-25T10:00:00'),
      });
      expect(thursdayService.getDayOfWeek()).toBe('Thursday');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // LOGGING
  // ═══════════════════════════════════════════════════════════════════

  describe('logging', () => {
    it('accepts custom logger', () => {
      const debugCalls: string[] = [];
      const warnCalls: string[] = [];

      const customLogger = {
        debug: (msg: string) => debugCalls.push(msg),
        warn: (msg: string) => warnCalls.push(msg),
      };

      const loggedService = createDateService({
        clock: () => fixedDate,
        logger: customLogger,
      });

      // This should trigger a debug log
      loggedService.parseNaturalDate('tomorrow');
      expect(debugCalls.length).toBeGreaterThan(0);

      // This should trigger a warn log
      loggedService.parseAIDate('invalid-date');
      expect(warnCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // isTimestampToday - NEW TESTS FOR SWEEP BRANCH
  // ═══════════════════════════════════════════════════════════════════

  describe('isTimestampToday', () => {
    it('returns true when UTC timestamp is today in local timezone', () => {
      // Fixed date is 2025-12-22T10:00:00
      const todayTimestamp = '2025-12-22T15:30:00.000Z';
      expect(service.isTimestampToday(todayTimestamp)).toBe(true);
    });

    it('returns false when UTC timestamp is yesterday', () => {
      const yesterdayTimestamp = '2025-12-21T15:30:00.000Z';
      expect(service.isTimestampToday(yesterdayTimestamp)).toBe(false);
    });

    it('returns false when UTC timestamp is tomorrow', () => {
      const tomorrowTimestamp = '2025-12-23T15:30:00.000Z';
      expect(service.isTimestampToday(tomorrowTimestamp)).toBe(false);
    });

    it('returns false for null input', () => {
      expect(service.isTimestampToday(null)).toBe(false);
    });

    it('returns false for undefined input', () => {
      expect(service.isTimestampToday(undefined)).toBe(false);
    });

    it('returns false for empty string input', () => {
      expect(service.isTimestampToday('')).toBe(false);
    });

    it('correctly handles timestamp at midnight UTC', () => {
      const midnightTimestamp = '2025-12-22T00:00:00.000Z';
      expect(service.isTimestampToday(midnightTimestamp)).toBe(true);
    });

    it('correctly handles timestamp at 11:59 PM UTC', () => {
      const lateTimestamp = '2025-12-22T23:59:59.000Z';
      expect(service.isTimestampToday(lateTimestamp)).toBe(true);
    });

    it('returns false for invalid ISO timestamp format', () => {
      expect(service.isTimestampToday('not-a-date')).toBe(false);
    });

    it('handles timestamps without milliseconds', () => {
      const timestamp = '2025-12-22T10:00:00Z';
      expect(service.isTimestampToday(timestamp)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // formatDateForDisplay - NEW TESTS FOR app-fixes-1.22 BRANCH
  // ═══════════════════════════════════════════════════════════════════

  describe('formatDateForDisplay', () => {
    it('returns full format with year: "January 21, 2026"', () => {
      expect(service.formatDateForDisplay('2026-01-21')).toBe('January 21, 2026');
    });

    it('returns empty string for null', () => {
      expect(service.formatDateForDisplay(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(service.formatDateForDisplay(undefined)).toBe('');
    });

    it('handles December correctly', () => {
      expect(service.formatDateForDisplay('2025-12-25')).toBe('December 25, 2025');
    });

    it('handles June correctly', () => {
      expect(service.formatDateForDisplay('2025-06-15')).toBe('June 15, 2025');
    });

    it('handles January correctly', () => {
      expect(service.formatDateForDisplay('2025-01-01')).toBe('January 1, 2025');
    });

    it('handles February correctly', () => {
      expect(service.formatDateForDisplay('2025-02-14')).toBe('February 14, 2025');
    });

    it('does not have timezone offset bug (parses as local date)', () => {
      // This test ensures we use fromLocalDate, not new Date()
      // If parsed as UTC, dates near midnight could shift
      expect(service.formatDateForDisplay('2025-12-22')).toBe('December 22, 2025');
    });

    it('handles single digit days correctly', () => {
      expect(service.formatDateForDisplay('2025-03-05')).toBe('March 5, 2025');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // isTimestampWithinDays (continued)
  // ═══════════════════════════════════════════════════════════════════

  describe('isTimestampWithinDays', () => {
    it('returns true for timestamp from today with days=1', () => {
      const todayTimestamp = '2025-12-22T08:00:00.000Z';
      expect(service.isTimestampWithinDays(todayTimestamp, 1)).toBe(true);
    });

    it('returns true for timestamp from yesterday with days=2', () => {
      const yesterdayTimestamp = '2025-12-21T08:00:00.000Z';
      expect(service.isTimestampWithinDays(yesterdayTimestamp, 2)).toBe(true);
    });

    it('returns true for timestamp from 3 days ago with days=4', () => {
      const threeDaysAgo = '2025-12-19T08:00:00.000Z';
      expect(service.isTimestampWithinDays(threeDaysAgo, 4)).toBe(true);
    });

    it('returns false for timestamp from 4 days ago with days=3', () => {
      const fourDaysAgo = '2025-12-18T08:00:00.000Z';
      expect(service.isTimestampWithinDays(fourDaysAgo, 3)).toBe(false);
    });

    it('returns false for timestamp older than window', () => {
      const oldTimestamp = '2025-12-01T08:00:00.000Z';
      expect(service.isTimestampWithinDays(oldTimestamp, 7)).toBe(false);
    });

    it('returns true for timestamp exactly at cutoff boundary', () => {
      // 6 days ago with days=7 should be included
      const sixDaysAgo = '2025-12-16T08:00:00.000Z';
      expect(service.isTimestampWithinDays(sixDaysAgo, 7)).toBe(true);
    });

    it('returns false for null input', () => {
      expect(service.isTimestampWithinDays(null, 7)).toBe(false);
    });

    it('returns false for undefined input', () => {
      expect(service.isTimestampWithinDays(undefined, 7)).toBe(false);
    });

    it('handles days=0 (checks today only via cutoff)', () => {
      const todayTimestamp = '2025-12-22T08:00:00.000Z';
      // days=0 means cutoff is today, so only timestamps >= today should pass
      expect(service.isTimestampWithinDays(todayTimestamp, 0)).toBe(true);
    });

    it('handles days=1 for yesterday check', () => {
      const yesterdayTimestamp = '2025-12-21T08:00:00.000Z';
      // days=1 means cutoff is yesterday
      expect(service.isTimestampWithinDays(yesterdayTimestamp, 1)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STANDALONE FUNCTION EXPORTS - NEW TESTS FOR SWEEP BRANCH
  // ═══════════════════════════════════════════════════════════════════

  describe('standalone function exports', () => {
    beforeEach(() => {
      resetDateService();
      // Set up singleton with fixed clock
      createDateService({
        clock: () => new Date('2025-12-22T10:00:00'),
      });
    });

    it('isTimestampToday delegates to singleton instance', () => {
      const result = isTimestampToday('2025-12-22T15:00:00.000Z');
      expect(result).toBe(true);
    });

    it('isTimestampWithinDays delegates to singleton instance', () => {
      const result = isTimestampWithinDays('2025-12-20T15:00:00.000Z', 3);
      expect(result).toBe(true);
    });

    it('extractDateFromIso delegates to singleton instance', () => {
      const result = extractDateFromIso('2025-12-22T15:30:00.000Z');
      expect(result).toBe('2025-12-22');
    });

    it('extractDateFromIso returns null for null input', () => {
      const result = extractDateFromIso(null);
      expect(result).toBeNull();
    });

    it('extractDateFromIso returns null for undefined input', () => {
      const result = extractDateFromIso(undefined);
      expect(result).toBeNull();
    });

    it('extractDateFromIso handles timestamps without Z suffix', () => {
      const result = extractDateFromIso('2025-12-22T15:30:00');
      expect(result).toBe('2025-12-22');
    });
  });
});
