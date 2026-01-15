/**
 * Get a human-readable relative time string from a date
 * @param dateString - ISO date string or Date object
 * @returns Relative time string like "Just now", "5m ago", "2h ago", "Yesterday", etc.
 */
export function getRelativeTime(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older, show date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
