import { format } from 'date-fns';
import { getDateService } from '../../../lib/date/DateService';

/**
 * Format habit frequency_json into human-readable string
 * Examples: "Daily", "3x per week", "Weekly", "2x per month"
 */
export function formatFrequencyLabel(frequencyJson: any): string {
  if (!frequencyJson) return '';

  const { type, count, unit } = frequencyJson;

  // Handle simple daily
  if (type === 'custom' && unit === 'day' && count === 1) {
    return 'Daily';
  }

  // Handle simple weekly
  if ((type === 'weekly' || (type === 'custom' && unit === 'week')) && count === 1) {
    return 'Weekly';
  }

  // Handle Nx per week
  if (type === 'custom' && unit === 'week' && count > 1) {
    return `${count}x per week`;
  }

  // Handle Nx per day (multiple times daily)
  if (type === 'custom' && unit === 'day' && count > 1) {
    return `${count}x per day`;
  }

  // Handle monthly
  if (type === 'custom' && unit === 'month') {
    return count === 1 ? 'Monthly' : `${count}x per month`;
  }

  // Fallback
  if (count && unit) {
    return `${count}x per ${unit}`;
  }

  return '';
}

/**
 * Format due date into human-readable relative string
 * Examples: "Today", "Tomorrow", "Dec 15", "Overdue"
 */
export function formatDueDateLabel(dueDate: string | null): string {
  if (!dueDate) return '';

  try {
    const date = new Date(dueDate);
    const ds = getDateService();
    // a due date is a day: compare it with the person's day
    const day = ds.extractLocalDate(dueDate);

    if (day && ds.isToday(day)) {
      return 'Today';
    }

    if (day && ds.isTomorrow(day)) {
      return 'Tomorrow';
    }

    // Check if overdue
    if (day ? day < ds.today() : date < ds.now()) {
      return 'Overdue';
    }

    // Show short date format for other dates
    return format(date, 'MMM d');
  } catch {
    return '';
  }
}
