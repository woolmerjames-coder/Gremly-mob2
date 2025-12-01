/**
 * Options for formatDue function
 */
export interface FormatDueOptions {
  /** YYYY-MM-DD format date string - canonical, timezone-safe */
  dueDay?: string | null;
  /** ISO 8601 timestamp - fallback if dueDay not available */
  dueIso?: string | null;
  /** HH:mm format time string - optional specific time */
  dueTime?: string | null;
}

/**
 * Formats due date for human-friendly display.
 *
 * IMPORTANT: Prefers `dueDay` (YYYY-MM-DD) over `dueIso` to avoid timezone issues.
 * When `dueIso` is a UTC midnight timestamp (e.g., "2025-11-26T00:00:00+00:00"),
 * converting to local time can shift to the previous day. Using `dueDay` directly
 * avoids this problem.
 *
 * @param optionsOrDueIso - Either FormatDueOptions object or legacy ISO string
 * @returns Human-friendly due date string like "due Today", "due Tomorrow", "due Mon", "due Jan 5"
 */
export function formatDue(optionsOrDueIso?: FormatDueOptions | string | null): string {
  // Handle legacy signature: formatDue(dueIso)
  let dueDay: string | null | undefined;
  let dueIso: string | null | undefined;
  let dueTime: string | null | undefined;

  if (typeof optionsOrDueIso === 'string') {
    // Legacy: passed a string directly
    dueIso = optionsOrDueIso;
  } else if (optionsOrDueIso && typeof optionsOrDueIso === 'object') {
    // New: passed options object
    dueDay = optionsOrDueIso.dueDay;
    dueIso = optionsOrDueIso.dueIso;
    dueTime = optionsOrDueIso.dueTime;
  }

  // If we have neither, return default
  if (!dueDay && !dueIso) return 'no deadline yet';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let dueYear: number;
  let dueMonth: number; // 0-indexed
  let dueDate: number;
  let hasTime = false;
  let timeStr = '';

  // PREFER dueDay (YYYY-MM-DD) to avoid timezone issues
  if (dueDay && /^\d{4}-\d{2}-\d{2}$/.test(dueDay)) {
    // Parse YYYY-MM-DD directly without timezone conversion
    const [yearStr, monthStr, dayStr] = dueDay.split('-');
    dueYear = parseInt(yearStr, 10);
    dueMonth = parseInt(monthStr, 10) - 1; // Convert to 0-indexed
    dueDate = parseInt(dayStr, 10);

    // Check for time from dueTime field (skip midnight 00:00)
    if (dueTime && /^\d{2}:\d{2}$/.test(dueTime) && dueTime !== '00:00') {
      hasTime = true;
      timeStr = ` @ ${dueTime}`;
    }
  } else if (dueIso) {
    // Fallback: parse ISO timestamp (may have timezone issues with UTC midnight)
    const due = new Date(dueIso);
    dueYear = due.getFullYear();
    dueMonth = due.getMonth();
    dueDate = due.getDate();

    // Check if time is specified (not midnight or 00:00)
    hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
    timeStr = hasTime
      ? ` @ ${due.getHours().toString().padStart(2, '0')}:${due.getMinutes().toString().padStart(2, '0')}`
      : '';
  } else {
    return 'no deadline yet';
  }

  // Calculate difference in days
  const dueStart = new Date(dueYear, dueMonth, dueDate);
  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Today
  if (diffDays === 0) {
    return `due Today${timeStr}`;
  }

  // Tomorrow
  if (diffDays === 1) {
    return `due Tomorrow${timeStr}`;
  }

  // Within next 7 days - show weekday short (Mon, Tue, Wed, etc.)
  if (diffDays > 1 && diffDays <= 7) {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = weekdays[dueStart.getDay()];
    return `due ${weekday}${timeStr}`;
  }

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

  // Beyond 7 days but within same month - show "Mon DD"
  if (diffDays > 7 && dueMonth === now.getMonth() && dueYear === now.getFullYear()) {
    const month = months[dueMonth];
    return `due ${month} ${dueDate}${timeStr}`;
  }

  // Beyond same month - show "Mon DD"
  const month = months[dueMonth];
  return `due ${month} ${dueDate}${timeStr}`;
}
