/**
 * Contextual Summary Generation for Chat Confirmations
 * Phase 11.7+: Creates meaningful summaries by looking at conversation context
 */

/**
 * Extract activity from current text
 */
export function extractActivity(text: string): string | null {
  // Direct activity mentions
  const patterns = [
    /(?:habit for|want to start|begin|trying to)\s+([^,.]+?)(?:\s+more|\s+regularly)?/i,
    /(?:track|log|do|practice)\s+(?:my\s+)?([^,.]+?)(?:\s+habit|\s+routine)?/i,
    /([^,.]+?)\s+(?:habit|routine|practice)/i,
    /(?:start|begin)\s+([^,.]+?)(?:\s+more|\s+again)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let activity = match[1]
        .trim()
        .replace(/^(a|an|the|my)\s+/i, '')
        .replace(/\s+(more|regularly|daily|weekly|habit|routine)$/i, '');

      // Convert gerunds to base form
      if (activity.endsWith('ing')) {
        activity = activity.replace(/ing$/, '').replace(/nn$/, 'n').replace(/mm$/, 'm');
      }

      // Filter out non-activities
      if (!['it', 'this', 'that', 'habit'].includes(activity.toLowerCase())) {
        // Capitalize first letter
        return activity.charAt(0).toUpperCase() + activity.slice(1);
      }
    }
  }

  return null;
}

/**
 * Look back in conversation for the actual activity
 */
export function extractActivityFromContext(currentText: string, recentMessages?: string[]): string {
  if (!recentMessages || recentMessages.length === 0) {
    return 'New habit';
  }

  // Common activity keywords to look for
  const activityWords = [
    'running',
    'run',
    'jog',
    'jogging',
    'exercise',
    'exercising',
    'workout',
    'working out',
    'meditate',
    'meditation',
    'meditating',
    'read',
    'reading',
    'write',
    'writing',
    'walk',
    'walking',
    'gym',
    'yoga',
    'study',
    'studying',
    'practice',
    'practicing',
    'swim',
    'swimming',
    'bike',
    'biking',
    'cycling',
    'stretch',
    'stretching',
    'journal',
    'journaling',
    'code',
    'coding',
    'draw',
    'drawing',
    'paint',
    'painting',
    'cook',
    'cooking',
    'clean',
    'cleaning',
    'sleep',
    'water',
    'drink',
  ];

  // Check last 5 messages for activity mentions
  for (const message of recentMessages.slice(-5).reverse()) {
    const lowerMessage = message.toLowerCase();

    // First try to extract activity from this message using patterns
    const extractedActivity = extractActivity(message);
    if (extractedActivity && extractedActivity !== 'New habit') {
      return extractedActivity;
    }

    // Then check for activity keywords
    for (const activity of activityWords) {
      if (lowerMessage.includes(activity)) {
        // Found the activity! Clean it up and capitalize
        let cleaned = activity;
        if (activity.endsWith('ing')) {
          // Convert gerund to base form: "running" -> "Run"
          cleaned = activity.replace(/ing$/, '').replace(/nn$/, 'n').replace(/mm$/, 'm');
        }
        // Capitalize first letter
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }

    // Also check for "I want to X more" patterns
    const wantPattern =
      /(?:i want to|i'd like to|trying to|planning to)\s+(\w+(?:\s+\w+)?)\s+(?:more|regularly|often)/i;
    const match = message.match(wantPattern);
    if (match) {
      return match[1].trim();
    }
  }

  return 'New habit';
}

/**
 * Extract frequency from text
 */
export function extractFrequency(text: string): string {
  const patterns = {
    daily: /\b(every day|daily|each day)\b/i,
    weekly: /\b(\d+)\s*times?\s*(?:per|a)\s*week\b/i,
    monthly: /\b(\d+)\s*times?\s*(?:per|a)\s*month\b/i,
    custom: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|weekday)/i,
  };

  // Check for specific patterns
  if (patterns.daily.test(text)) return 'Daily';

  const weeklyMatch = text.match(patterns.weekly);
  if (weeklyMatch) return `${weeklyMatch[1]}x/week`;

  const monthlyMatch = text.match(patterns.monthly);
  if (monthlyMatch) return `${monthlyMatch[1]}x/month`;

  if (patterns.custom.test(text)) {
    const days = text.match(/\b(mon|tue|wed|thu|fri|sat|sun)/gi);
    if (days && days.length > 0) return `${days.length} days`;
  }

  return 'Daily'; // Default
}

/**
 * Create context-aware summary for toast confirmations
 */
export function createToastSummary(
  text: string,
  type: string,
  conversationContext?: string[],
): string {
  if (type === 'habit') {
    // First, look for the activity in current message
    let activity = extractActivity(text);

    // If not found or too vague, check conversation context
    if (!activity || activity === 'habit' || activity === 'it') {
      activity = extractActivityFromContext(text, conversationContext);
    }

    // Extract frequency
    const frequency = extractFrequency(text);

    // Build readable summary
    if (activity && frequency && activity !== 'New habit') {
      return `${activity} - ${frequency}`;
    } else if (activity && activity !== 'New habit') {
      return `${activity} - Daily`;
    } else {
      return frequency || 'New habit';
    }
  }

  if (type === 'todo') {
    // For todos, just clean up the text
    return text.trim().substring(0, 50);
  }

  if (type === 'note') {
    // For notes, just clean up the text
    return text.trim().substring(0, 50);
  }

  // Default: return cleaned text
  return text.trim().substring(0, 50);
}

/**
 * Get activity name for actual habit creation
 * This is stored in metadata and used when creating the habit
 */
export function getActivityName(text: string, conversationContext?: string[]): string {
  let activity = extractActivity(text);

  if (!activity || activity === 'habit' || activity === 'it') {
    activity = extractActivityFromContext(text, conversationContext);
  }

  return activity || text.trim();
}
