/**
 * Date Module - Public API
 *
 * All date operations should import from this file:
 *   import { getDateService, useDateService } from '../date';
 *
 * Do NOT import from individual files directly.
 */

// Primary API - use these
export {
  DateService,
  createDateService,
  getDateService,
  resetDateService,
  dateService,
  nowTimestamp,
  type ParsedDate,
  type DateServiceConfig,
} from './DateService';

export { useDateService } from './useDateService';

// Formatting helper (uses DateService internally)
export { formatDue, type FormatDueOptions } from './formatDue';

// Deprecated - keeping for backward compatibility
// These now delegate to DateService internally
export {
  getTodayDayString,
  toDayString,
  parseDayString,
  computeDueDay,
  computeDueTime,
} from './computeDueDay';
