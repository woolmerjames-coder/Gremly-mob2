/**
 * DateService - Best-in-class centralized date handling for Gremly
 *
 * This is the SINGLE SOURCE OF TRUTH for all date operations in the app.
 * All components should use this service instead of direct Date manipulation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CRITICAL TIMEZONE BUG - READ THIS FIRST
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The #1 cause of date bugs in JavaScript: using toISOString() to get "today's date"
 *
 * ❌ WRONG - This is a timezone bug:
 *    new Date().toISOString().split('T')[0]
 *
 *    Why? toISOString() converts to UTC first. At 6pm in San Francisco (UTC-8),
 *    the UTC time is already 2am THE NEXT DAY. So this returns tomorrow's date!
 *
 * ✅ CORRECT - Use DateService methods:
 *    dateService.today()           // "2025-01-14" in user's local timezone
 *    dateService.toLocalDate(date) // Convert Date to local YYYY-MM-DD
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BRANDED TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * We use branded types to prevent mixing up date strings:
 * - LocalDateString: "YYYY-MM-DD" in user's local timezone (for due_day, etc.)
 * - UtcTimestamp: Full ISO string in UTC (for created_at, updated_at, etc.)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Factory pattern with createDateService() for testability
 * - Injectable clock via config.clock for reliable testing
 * - Injectable timezone via config.timezone
 * - Singleton getter getDateService() for production use
 *
 * NLP Parsing Pipeline:
 * - Stage 1: Custom patterns (EOY, end of year, end of month, standalone weekdays)
 * - Stage 2: chrono-node for standard patterns (tomorrow, next tuesday, Dec 25)
 * - Stage 3: Regex fallback for ISO dates and US dates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * // Get today's date
 * const today = dateService.today();  // "2025-01-14"
 *
 * // Get tomorrow's date
 * const tmrw = dateService.tomorrow();  // "2025-01-15"
 *
 * // Convert Date object to local date string
 * const localDate = dateService.toLocalDate(someDate);
 *
 * // Parse from YYYY-MM-DD string
 * const date = dateService.fromLocalDate("2025-01-14");
 *
 * // Get current UTC timestamp for database
 * const timestamp = dateService.nowTimestamp();  // "2025-01-14T18:30:00.000Z"
 *
 * // Check if something is due today
 * if (dateService.isToday(todo.due_day)) { ... }
 */

import * as chrono from 'chrono-node';

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A date string in "YYYY-MM-DD" format representing a LOCAL date.
 * This is NOT a UTC date - it represents the date in the user's timezone.
 *
 * Use for: due_day, completed_day, start_date, end_date, etc.
 *
 * @example "2025-01-14" - January 14th, 2025 in local timezone
 */
export type LocalDateString = string & { readonly __brand: 'LocalDateString' };

/**
 * A full ISO 8601 timestamp string in UTC.
 * This is what JavaScript's toISOString() produces.
 *
 * Use for: created_at, updated_at, resurface_at, etc.
 *
 * @example "2025-01-14T18:30:00.000Z" - Always in UTC (Z suffix)
 */
export type UtcTimestamp = string & { readonly __brand: 'UtcTimestamp' };

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ParsedDate {
  date: string; // YYYY-MM-DD (LocalDateString)
  time: string | null; // HH:mm if specified
  confidence: number; // 0-1
  originalText: string; // The matched text
  textWithoutDate: string; // Input with date portion removed
  method: 'custom' | 'chrono' | 'regex'; // Which parser found it
}

export interface DateServiceLogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
}

export interface DateServiceConfig {
  timezone?: string; // e.g., 'America/Los_Angeles'
  clock?: () => Date; // Injectable clock for testing
  logger?: DateServiceLogger; // Optional logger
}

// Default logger - only logs in __DEV__
const defaultLogger: DateServiceLogger = {
  debug: (message: string, data?: Record<string, unknown>) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[DateService] ${message}`, data || '');
    }
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`[DateService] ${message}`, data || '');
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATE SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class DateService {
  private timezone: string;
  private clock: () => Date;
  private logger: DateServiceLogger;

  constructor(config?: DateServiceConfig) {
    // Auto-detect timezone if not provided
    this.timezone = config?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Default clock is Date.now
    this.clock = config?.clock || (() => new Date());
    // Default logger
    this.logger = config?.logger || defaultLogger;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SINGLETON ACCESS (for backward compatibility)
  // ═══════════════════════════════════════════════════════════════════

  static getInstance(): DateService {
    return getDateService();
  }

  static resetInstance(): void {
    resetDateService();
  }

  // ═══════════════════════════════════════════════════════════════════
  // TIMEZONE & CLOCK
  // ═══════════════════════════════════════════════════════════════════

  getTimezone(): string {
    return this.timezone;
  }

  setTimezone(tz: string): void {
    this.timezone = tz;
  }

  /**
   * Get the current time from the injectable clock.
   * Use this instead of new Date() for testability.
   */
  now(): Date {
    return this.clock();
  }

  getDayOfWeek(): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.now().getDay()];
  }

  // ═══════════════════════════════════════════════════════════════════
  // CURRENT DATE/TIME - Primary Methods
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get today's date as YYYY-MM-DD in user's local timezone.
   * This is the canonical way to get "today" for all date comparisons.
   *
   * ⚠️ DO NOT use `new Date().toISOString().split('T')[0]` - that's a timezone bug!
   *
   * @returns LocalDateString - Today's date in local timezone
   *
   * @example
   * const today = dateService.today(); // "2025-01-14"
   */
  today(): string {
    return this.toLocalDate(this.now());
  }

  /**
   * Get tomorrow's date as YYYY-MM-DD in user's local timezone.
   *
   * @returns LocalDateString - Tomorrow's date
   *
   * @example
   * const tmrw = dateService.tomorrow(); // "2025-01-15"
   */
  tomorrow(): string {
    return this.addDays(this.today(), 1);
  }

  /**
   * Get yesterday's date as YYYY-MM-DD in user's local timezone.
   *
   * @returns LocalDateString - Yesterday's date
   *
   * @example
   * const yest = dateService.yesterday(); // "2025-01-13"
   */
  yesterday(): string {
    return this.addDays(this.today(), -1);
  }

  /**
   * Get the date N days ago as YYYY-MM-DD.
   *
   * @param n - Number of days ago
   * @returns LocalDateString
   *
   * @example
   * const weekAgo = dateService.daysAgo(7); // "2025-01-07"
   */
  daysAgo(n: number): string {
    return this.addDays(this.today(), -n);
  }

  /**
   * Get the date N days from now as YYYY-MM-DD.
   *
   * @param n - Number of days from now
   * @returns LocalDateString
   *
   * @example
   * const nextWeek = dateService.daysFromNow(7); // "2025-01-21"
   */
  daysFromNow(n: number): string {
    return this.addDays(this.today(), n);
  }

  /**
   * Get the current hour (0-23) in local timezone.
   * Useful for time-of-day checks (morning, evening, etc.)
   *
   * @returns Hour number 0-23
   *
   * @example
   * if (dateService.getHour() >= 18) {
   *   // It's evening, show "good evening" greeting
   * }
   */
  getHour(): number {
    return this.now().getHours();
  }

  /**
   * Get the start of the current week (Monday) as YYYY-MM-DD.
   *
   * @returns LocalDateString - Monday of current week
   *
   * @example
   * const weekStart = dateService.getStartOfWeek(); // "2025-01-13" (if today is Wed Jan 15)
   */
  getStartOfWeek(): string {
    const now = this.now();
    const day = now.getDay();
    // Convert Sunday (0) to 7 for easier calculation
    const dayOfWeek = day === 0 ? 7 : day;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek - 1));
    monday.setHours(12, 0, 0, 0);
    return this.toLocalDate(monday);
  }

  /**
   * Get current datetime as full ISO string in UTC.
   * Use this for database timestamps (created_at, updated_at, etc.)
   *
   * @returns UtcTimestamp - Current time in ISO format
   *
   * @example
   * const timestamp = dateService.nowTimestamp(); // "2025-01-14T18:30:00.000Z"
   */
  nowTimestamp(): string {
    return this.now().toISOString();
  }

  // ═══════════════════════════════════════════════════════════════════
  // CURRENT DATE/TIME - Deprecated Aliases (for backward compatibility)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * @deprecated Use today() instead
   */
  getCurrentDate(): string {
    return this.today();
  }

  /**
   * @deprecated Use nowTimestamp() instead
   */
  getCurrentDateTime(): string {
    return this.nowTimestamp();
  }

  // ═══════════════════════════════════════════════════════════════════
  // PARSING - Multi-Stage Pipeline
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Parse natural language date input using multi-stage pipeline.
   *
   * Stage 1: Custom patterns (EOY, end of year, end of month, standalone weekdays)
   * Stage 2: chrono-node for standard patterns (tomorrow, next tuesday, Dec 25)
   * Stage 3: Regex fallback for ISO dates (2025-12-25) and US dates (12/25)
   *
   * @param input - Natural language string (e.g., "do this by monday")
   * @param referenceDate - Reference date for relative parsing (defaults to now)
   * @returns ParsedDate or null if no date found
   */
  parseNaturalDate(input: string, referenceDate?: Date): ParsedDate | null {
    if (!input || !input.trim()) return null;

    const ref = referenceDate || this.now();
    const text = input.trim();

    // Stage 1: Custom patterns
    const customResult = this.parseCustomPatterns(text, ref);
    if (customResult) {
      this.logger.debug('Parsed with custom pattern', {
        input: text,
        result: customResult.date,
        pattern: customResult.originalText,
      });
      return customResult;
    }

    // Stage 2: chrono-node
    const chronoResult = this.parseWithChrono(text, ref);
    if (chronoResult) {
      this.logger.debug('Parsed with chrono-node', {
        input: text,
        result: chronoResult.date,
        matched: chronoResult.originalText,
      });
      return chronoResult;
    }

    // Stage 3: Regex fallback for explicit date formats
    const regexResult = this.parseWithRegex(text, ref);
    if (regexResult) {
      this.logger.debug('Parsed with regex fallback', {
        input: text,
        result: regexResult.date,
        matched: regexResult.originalText,
      });
      return regexResult;
    }

    return null;
  }

  /**
   * Stage 1: Custom patterns that chrono doesn't handle well
   */
  private parseCustomPatterns(text: string, ref: Date): ParsedDate | null {
    const lower = text.toLowerCase();

    // EOY / end of year
    const eoyMatch = lower.match(/\b(eoy|end of year)\b/i);
    if (eoyMatch) {
      const eoy = new Date(ref.getFullYear(), 11, 31); // Dec 31
      return {
        date: this.toDateString(eoy),
        time: null,
        confidence: 0.9,
        originalText: eoyMatch[0],
        textWithoutDate: this.removeFromText(text, eoyMatch[0]),
        method: 'custom',
      };
    }

    // EOM / end of month
    const eomMatch = lower.match(/\b(eom|end of month)\b/i);
    if (eomMatch) {
      const eom = new Date(ref.getFullYear(), ref.getMonth() + 1, 0); // Last day of month
      return {
        date: this.toDateString(eom),
        time: null,
        confidence: 0.9,
        originalText: eomMatch[0],
        textWithoutDate: this.removeFromText(text, eomMatch[0]),
        method: 'custom',
      };
    }

    // "next week" -> Monday of next week
    const nextWeekMatch = lower.match(/\bnext week\b/i);
    if (nextWeekMatch) {
      const nextMonday = this.getNextWeekday(1, ref); // 1 = Monday
      return {
        date: this.toDateString(nextMonday),
        time: null,
        confidence: 0.88,
        originalText: nextWeekMatch[0],
        textWithoutDate: this.removeFromText(text, nextWeekMatch[0]),
        method: 'custom',
      };
    }

    // Standalone weekday (without "next" prefix) - means next occurrence
    // Must check that "next" doesn't precede it
    const weekdayMatch = lower.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    );
    if (weekdayMatch) {
      const matchIndex = weekdayMatch.index ?? 0;
      const textBefore = lower.slice(0, matchIndex);
      // Only use custom handler if "next" is NOT right before the weekday
      if (!/next\s*$/i.test(textBefore)) {
        const weekdayMap: Record<string, number> = {
          sunday: 0,
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
        };
        const targetDay = weekdayMap[weekdayMatch[0].toLowerCase()];
        const nextOccurrence = this.getNextWeekday(targetDay, ref);
        return {
          date: this.toDateString(nextOccurrence),
          time: null,
          confidence: 0.85,
          originalText: weekdayMatch[0],
          textWithoutDate: this.removeFromText(text, weekdayMatch[0]),
          method: 'custom',
        };
      }
    }

    return null;
  }

  /**
   * Stage 2: chrono-node for standard patterns
   */
  private parseWithChrono(text: string, ref: Date): ParsedDate | null {
    const results = chrono.parse(text, ref, { forwardDate: true });

    if (results.length === 0) return null;

    const result = results[0];
    const parsedDate = result.start.date();

    // Extract time if explicitly specified
    const hasTime = result.start.isCertain('hour');
    const time = hasTime
      ? `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`
      : null;

    // Calculate confidence based on what chrono found
    let confidence = 0.8;
    if (result.start.isCertain('day')) confidence += 0.1;
    if (result.start.isCertain('month')) confidence += 0.05;
    if (hasTime) confidence += 0.05;

    return {
      date: this.toDateString(parsedDate),
      time,
      confidence: Math.min(confidence, 1),
      originalText: result.text,
      textWithoutDate: text.replace(result.text, '').replace(/\s+/g, ' ').trim(),
      method: 'chrono',
    };
  }

  /**
   * Stage 3: Regex fallback for explicit date formats
   */
  private parseWithRegex(text: string, ref: Date): ParsedDate | null {
    // ISO format: YYYY-MM-DD
    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      const [matched, year, month, day] = isoMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
      if (!isNaN(date.getTime())) {
        return {
          date: this.toDateString(date),
          time: null,
          confidence: 0.95,
          originalText: matched,
          textWithoutDate: this.removeFromText(text, matched),
          method: 'regex',
        };
      }
    }

    // US format: M/D or M/D/YY or M/D/YYYY
    const usMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (usMatch) {
      const [matched, month, day, yearRaw] = usMatch;
      let year = ref.getFullYear();
      if (yearRaw) {
        year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw) : parseInt(yearRaw);
      }
      const date = new Date(year, parseInt(month) - 1, parseInt(day), 12, 0, 0);
      if (!isNaN(date.getTime())) {
        return {
          date: this.toDateString(date),
          time: null,
          confidence: 0.9,
          originalText: matched,
          textWithoutDate: this.removeFromText(text, matched),
          method: 'regex',
        };
      }
    }

    return null;
  }

  /**
   * Validate and normalize a date string from AI extraction.
   * Returns YYYY-MM-DD or null if invalid.
   *
   * Validation rules:
   * - Must be valid date format
   * - Cannot be more than 365 days in the past
   * - Cannot be more than 730 days in the future
   */
  parseAIDate(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;

    let normalizedDate: string | null = null;

    // Already in correct format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      normalizedDate = this.isValidDate(dateStr) ? dateStr : null;
    }
    // Has time component - extract date part
    else if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
      const datePart = dateStr.split('T')[0];
      normalizedDate = this.isValidDate(datePart) ? datePart : null;
    }
    // Try to parse as date
    else {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        normalizedDate = this.toDateString(parsed);
      }
    }

    if (!normalizedDate) {
      this.logger.warn('AI date validation failed: invalid format', { dateStr });
      return null;
    }

    // Validate date range
    const today = this.getCurrentDate();
    const daysDiff = this.daysBetween(today, normalizedDate);

    if (daysDiff < -365) {
      this.logger.warn('AI date validation failed: too far in past', {
        dateStr: normalizedDate,
        daysDiff,
      });
      return null;
    }

    if (daysDiff > 730) {
      this.logger.warn('AI date validation failed: too far in future', {
        dateStr: normalizedDate,
        daysDiff,
      });
      return null;
    }

    return normalizedDate;
  }

  /**
   * Extract YYYY-MM-DD date from an ISO datetime string without range validation.
   * Use this for general date extraction (not AI responses).
   *
   * Handles:
   * - Already in YYYY-MM-DD format: returns as-is
   * - ISO datetime with 'T': extracts date portion
   * - UTC midnight pattern: extracts date without timezone shift
   */
  extractDateFromIso(isoDate: string | null | undefined): string | null {
    if (!isoDate || typeof isoDate !== 'string') return null;

    // Already in correct format
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return isoDate;
    }

    // Check for UTC midnight pattern to avoid timezone shift
    const utcMidnightMatch = isoDate.match(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?(?:Z|\+00:00)$/);
    if (utcMidnightMatch) {
      return utcMidnightMatch[1];
    }

    // Parse as date and extract local date
    try {
      const dateObj = new Date(isoDate);
      if (isNaN(dateObj.getTime())) return null;
      return this.toLocalDate(dateObj);
    } catch {
      return null;
    }
  }

  /**
   * Extract the local date (YYYY-MM-DD) from a UTC timestamp.
   * This is the primary method - extractDateFromIso is a deprecated alias.
   *
   * IMPORTANT: This converts the UTC timestamp to local timezone first,
   * so "2025-01-15T02:00:00Z" becomes "2025-01-14" in SF (UTC-8).
   *
   * @param isoTimestamp - UTC timestamp or YYYY-MM-DD string
   * @returns LocalDateString or null if invalid
   *
   * @example
   * extractLocalDate("2025-01-15T02:00:00Z") // "2025-01-14" in SF
   * extractLocalDate("2025-01-14")            // "2025-01-14" (unchanged)
   */
  extractLocalDate(isoTimestamp: string | null | undefined): string | null {
    return this.extractDateFromIso(isoTimestamp);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONVERSION - Primary Methods
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Convert Date object to YYYY-MM-DD string in LOCAL timezone.
   *
   * ⚠️ IMPORTANT: This does NOT use toISOString() which would convert to UTC.
   * That's the #1 timezone bug - at 6pm in SF, toISOString() returns tomorrow!
   *
   * @param date - Date object to convert
   * @returns LocalDateString in format "YYYY-MM-DD"
   *
   * @example
   * // At 6pm on Jan 14 in San Francisco:
   * toLocalDate(new Date())           // "2025-01-14" ✅ correct
   * new Date().toISOString().split('T')[0]  // "2025-01-15" ❌ WRONG (UTC)
   */
  toLocalDate(date: Date | null | undefined): string {
    if (!date || isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse YYYY-MM-DD string to Date object.
   * Sets time to noon to avoid DST edge cases.
   *
   * @param dateStr - LocalDateString in format "YYYY-MM-DD"
   * @returns Date object set to noon, or null if invalid
   *
   * @example
   * fromLocalDate("2025-01-14") // Date object for Jan 14, 2025 at 12:00pm
   */
  fromLocalDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);

    // Set to noon to avoid DST edge cases
    const date = new Date(year, month, day, 12, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONVERSION - Deprecated Aliases (for backward compatibility)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * @deprecated Use toLocalDate() instead
   */
  toDateString(date: Date | null | undefined): string {
    return this.toLocalDate(date);
  }

  /**
   * @deprecated Use fromLocalDate() instead
   */
  fromDateString(dateStr: string | null | undefined): Date | null {
    return this.fromLocalDate(dateStr);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORMATTING
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Format for UI chips (short): "Today", "Tomorrow", "Mon", "Dec 23"
   */
  formatForChip(dateStr: string | null | undefined): string {
    if (!dateStr) return '';

    if (this.isToday(dateStr)) return 'Today';
    if (this.isTomorrow(dateStr)) return 'Tomorrow';

    const date = this.fromLocalDate(dateStr);
    if (!date) return '';

    const days = this.daysBetween(this.today(), dateStr);

    // Within 7 days - show weekday
    if (days > 0 && days <= 7) {
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return weekdays[date.getDay()];
    }

    // Otherwise show "Mon D" or "Mon D, YYYY" if different year
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = months[date.getMonth()];
    const dayNum = date.getDate();
    const year = date.getFullYear();
    const currentYear = this.now().getFullYear();

    if (year !== currentYear) {
      return `${month} ${dayNum}, ${year}`;
    }
    return `${month} ${dayNum}`;
  }

  /**
   * Format for full display: "January 21, 2026"
   * Always includes year for clarity.
   *
   * ⚠️ IMPORTANT: This parses the YYYY-MM-DD string without timezone conversion.
   * Using new Date(dateStr) would parse as UTC, causing timezone bugs!
   */
  formatDateForDisplay(dateStr: string | null | undefined): string {
    if (!dateStr) return '';

    const date = this.fromLocalDate(dateStr);
    if (!date) return '';

    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const month = months[date.getMonth()];
    const dayNum = date.getDate();
    const year = date.getFullYear();

    return `${month} ${dayNum}, ${year}`;
  }

  /**
   * Format for overlay display (full): "Monday, December 23"
   */
  formatForOverlay(dateStr: string | null | undefined): string {
    if (!dateStr) return 'No date set';

    if (this.isToday(dateStr)) return 'Today';
    if (this.isTomorrow(dateStr)) return 'Tomorrow';

    const date = this.fromDateString(dateStr);
    if (!date) return 'Invalid date';

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const weekday = weekdays[date.getDay()];
    const month = months[date.getMonth()];
    const dayNum = date.getDate();
    const year = date.getFullYear();
    const currentYear = this.now().getFullYear();

    if (year !== currentYear) {
      return `${weekday}, ${month} ${dayNum}, ${year}`;
    }
    return `${weekday}, ${month} ${dayNum}`;
  }

  /**
   * Format relative: "Tomorrow", "in 3 days", "2 days ago"
   */
  formatRelative(dateStr: string | null | undefined): string {
    if (!dateStr) return '';

    if (this.isToday(dateStr)) return 'Today';
    if (this.isTomorrow(dateStr)) return 'Tomorrow';

    const days = this.daysBetween(this.getCurrentDate(), dateStr);

    if (days === -1) return 'Yesterday';
    if (days > 0 && days <= 7) return `in ${days} days`;
    if (days < 0 && days >= -7) return `${Math.abs(days)} days ago`;

    return this.formatForChip(dateStr);
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPARISON
  // ═══════════════════════════════════════════════════════════════════

  isToday(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    return dateStr === this.getCurrentDate();
  }

  isTomorrow(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const tomorrow = this.addDays(this.getCurrentDate(), 1);
    return dateStr === tomorrow;
  }

  isYesterday(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const yesterday = this.addDays(this.getCurrentDate(), -1);
    return dateStr === yesterday;
  }

  isThisWeek(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const days = this.daysBetween(this.getCurrentDate(), dateStr);
    return days >= 0 && days <= 7;
  }

  isPast(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    return dateStr < this.getCurrentDate();
  }

  isFuture(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    return dateStr > this.getCurrentDate();
  }

  /**
   * Check if a date is overdue (past and not today)
   */
  isOverdue(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    return this.isPast(dateStr) && !this.isToday(dateStr);
  }

  /**
   * Check if a UTC ISO timestamp falls on today in local timezone.
   * Use this for comparing database timestamps (stored in UTC) against today.
   *
   * @param isoTimestamp - UTC timestamp like "2026-01-05T05:00:00.000Z"
   * @returns true if the timestamp is today in local time
   */
  isTimestampToday(isoTimestamp: string | null | undefined): boolean {
    const localDay = this.extractDateFromIso(isoTimestamp);
    return this.isToday(localDay);
  }

  /**
   * Check if a UTC ISO timestamp is within the last N days (in local timezone).
   *
   * @param isoTimestamp - UTC timestamp from database
   * @param days - Number of days to look back (inclusive of today)
   * @returns true if timestamp is within the window
   */
  isTimestampWithinDays(isoTimestamp: string | null | undefined, days: number): boolean {
    const localDay = this.extractDateFromIso(isoTimestamp);
    if (!localDay) return false;
    const cutoff = this.addDays(this.getCurrentDate(), -days);
    return localDay >= cutoff;
  }

  /**
   * Calculate days between two dates (positive if date2 > date1)
   */
  daysBetween(date1: string, date2: string): number {
    const d1 = this.fromDateString(date1);
    const d2 = this.fromDateString(date2);
    if (!d1 || !d2) return 0;

    const diffMs = d2.getTime() - d1.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  // ═══════════════════════════════════════════════════════════════════
  // MANIPULATION
  // ═══════════════════════════════════════════════════════════════════

  addDays(dateStr: string, days: number): string {
    const date = this.fromDateString(dateStr);
    if (!date) return dateStr;
    date.setDate(date.getDate() + days);
    return this.toDateString(date);
  }

  /**
   * Get next occurrence of a weekday (0=Sunday, 1=Monday, etc.)
   * Always returns the NEXT occurrence, even if today is that weekday.
   */
  getNextWeekday(weekday: number, from?: Date): Date {
    // Create a new Date to avoid mutating the input or clock
    const date = from ? new Date(from.getTime()) : new Date(this.now().getTime());
    const currentDay = date.getDay();
    let daysUntil = weekday - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // Always get NEXT occurrence
    date.setDate(date.getDate() + daysUntil);
    // Set to noon to avoid DST issues
    date.setHours(12, 0, 0, 0);
    return date;
  }

  getEndOfMonth(referenceDate?: Date): string {
    const ref = referenceDate || this.now();
    const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12, 0, 0);
    return this.toDateString(lastDay);
  }

  getEndOfYear(referenceDate?: Date): string {
    const ref = referenceDate || this.now();
    return `${ref.getFullYear()}-12-31`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private isValidDate(dateStr: string): boolean {
    const date = this.fromDateString(dateStr);
    if (!date) return false;
    // Check the date didn't overflow (e.g., Feb 31 -> Mar 3)
    return this.toDateString(date) === dateStr;
  }

  private removeFromText(text: string, toRemove: string): string {
    return text.replace(new RegExp(toRemove, 'i'), '').replace(/\s+/g, ' ').trim();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

// Singleton instance
let instance: DateService | null = null;

/**
 * Factory function to create a new DateService instance.
 * Use this in tests to inject a custom clock or timezone.
 * Also sets the singleton instance so getDateService() returns this instance.
 *
 * @example
 * const service = createDateService({
 *   clock: () => new Date('2025-12-22T10:00:00'),
 *   timezone: 'America/Los_Angeles',
 * });
 */
export function createDateService(config?: DateServiceConfig): DateService {
  instance = new DateService(config);
  return instance;
}

/**
 * Get the singleton DateService instance.
 * Creates one if it doesn't exist.
 */
export function getDateService(): DateService {
  if (!instance) {
    instance = new DateService();
  }
  return instance;
}

/**
 * Reset the singleton instance.
 * Use this in tests to ensure a fresh instance.
 */
export function resetDateService(): void {
  instance = null;
}

// Convenience export for the singleton
export const dateService = getDateService();

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION EXPORTS - Primary API
// ═══════════════════════════════════════════════════════════════════════════════

// New preferred function names
export const today = () => getDateService().today();
export const tomorrow = () => getDateService().tomorrow();
export const yesterday = () => getDateService().yesterday();
export const daysAgo = (n: number) => getDateService().daysAgo(n);
export const daysFromNow = (n: number) => getDateService().daysFromNow(n);
export const nowTimestamp = () => getDateService().nowTimestamp();
export const getHour = () => getDateService().getHour();
export const getStartOfWeek = () => getDateService().getStartOfWeek();
export const toLocalDate = (date: Date | null | undefined) => getDateService().toLocalDate(date);
export const fromLocalDate = (dateStr: string | null | undefined) =>
  getDateService().fromLocalDate(dateStr);
export const extractLocalDate = (iso: string | null | undefined) =>
  getDateService().extractLocalDate(iso);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION EXPORTS - Deprecated Aliases (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

/** @deprecated Use today() instead */
export const getCurrentDate = () => getDateService().getCurrentDate();

/** @deprecated Use nowTimestamp() instead */
export const getCurrentDateTime = () => getDateService().getCurrentDateTime();

/** @deprecated Use toLocalDate() instead */
export const toDateString = (date: Date | null | undefined) => getDateService().toDateString(date);

/** @deprecated Use fromLocalDate() instead */
export const fromDateString = (dateStr: string | null | undefined) =>
  getDateService().fromDateString(dateStr);

/** @deprecated Use extractLocalDate() instead */
export const extractDateFromIso = (iso: string | null | undefined) =>
  getDateService().extractDateFromIso(iso);

// Other exports (not renamed)
export const parseNaturalDate = (input: string, ref?: Date) =>
  getDateService().parseNaturalDate(input, ref);
export const formatForChip = (dateStr: string | null | undefined) =>
  getDateService().formatForChip(dateStr);
export const formatForOverlay = (dateStr: string | null | undefined) =>
  getDateService().formatForOverlay(dateStr);
export const isTimestampToday = (iso: string | null | undefined) =>
  getDateService().isTimestampToday(iso);
export const isTimestampWithinDays = (iso: string | null | undefined, days: number) =>
  getDateService().isTimestampWithinDays(iso, days);
