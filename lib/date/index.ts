/**
 * Date Module - Public API
 *
 * All date operations should go through this module.
 * Do not import from individual files.
 */

// Core service
export {
  DateService,
  createDateService,
  getDateService,
  resetDateService,
  dateService,
  type ParsedDate,
  type DateServiceConfig,
} from './DateService';

// React hook
export { useDateService } from './useDateService';

// Re-export legacy functions for backward compatibility during migration
// These will be deprecated once all code uses DateService directly
export { getTodayDayString, toDayString, parseDayString, computeDueDay } from './computeDueDay';
