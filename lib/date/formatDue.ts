/**
 * Formats due date for human-friendly display
 * @param dueIso - ISO 8601 timestamp string
 * @returns Human-friendly due date string like "due Today", "due Tomorrow", "due Mon", "due Jan 5"
 */
export function formatDue(dueIso?: string | null): string {
  if (!dueIso) return 'no deadline yet';

  const due = new Date(dueIso);
  const now = new Date();

  // Normalize to start of day for date comparisons
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Check if time is specified (not midnight or 00:00)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  const timeStr = hasTime
    ? ` @ ${due.getHours().toString().padStart(2, '0')}:${due.getMinutes().toString().padStart(2, '0')}`
    : '';

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
    const weekday = weekdays[due.getDay()];
    return `due ${weekday}${timeStr}`;
  }

  // Beyond 7 days but within same month - show "Mon DD"
  if (
    diffDays > 7 &&
    due.getMonth() === now.getMonth() &&
    due.getFullYear() === now.getFullYear()
  ) {
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
    const month = months[due.getMonth()];
    const day = due.getDate();
    return `due ${month} ${day}${timeStr}`;
  }

  // Beyond same month - show "Mon DD"
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
  const month = months[due.getMonth()];
  const day = due.getDate();
  return `due ${month} ${day}${timeStr}`;
}
