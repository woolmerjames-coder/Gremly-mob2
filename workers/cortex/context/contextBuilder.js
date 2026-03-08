/**
 * Context Builder - Formats session context data into a prompt-ready string
 *
 * Takes raw query data and builds a concise, informative context block
 * that helps the AI understand the user's recent activity and state.
 *
 * Target: ~120 tokens (~500 chars)
 */

// ============================================================================
// DCO CONTEXT HEADER
// ============================================================================

/**
 * Build the DCO context header for injection into system prompt.
 * @param {Object|null} dcoData - DCO data from getDcoContext
 * @returns {string} Formatted context header, or empty string if no DCO
 */
export function buildDcoContextHeader(dcoData) {
  if (!dcoData || !dcoData.lifeMoment) return '';

  const parts = [`=== CURRENT LIFE CONTEXT (generated daily) ===`];
  parts.push(`Life moment: ${dcoData.lifeMoment}`);
  parts.push(`Tone: ${dcoData.tone}`);

  if (dcoData.todayFocus && dcoData.todayFocus.length > 0) {
    parts.push(`Today's focus: ${dcoData.todayFocus.join(', ')}`);
  }

  const people = (dcoData.namedAnchors || [])
    .filter((a) => a.type === 'person')
    .map((a) => a.label);
  if (people.length > 0) {
    parts.push(`Named people: ${people.join(', ')}`);
  }

  if (dcoData.activeToday) {
    const active = [];
    if (dcoData.activeToday.overdue_todos > 0)
      active.push(`${dcoData.activeToday.overdue_todos} overdue`);
    if (dcoData.activeToday.habit_streak_risk?.length > 0)
      active.push(`streak risk: ${dcoData.activeToday.habit_streak_risk.join(', ')}`);
    if (active.length > 0) parts.push(`Active today: ${active.join(', ')}`);
  }

  parts.push('');
  parts.push('Use this context to colour your responses naturally.');
  parts.push(
    'Reference it when clearly helpful and not intrusive — like a friend who knows their situation.',
  );
  if (dcoData.tone === 'relaxed') {
    parts.push('Tone is relaxed — avoid urgency framing.');
  }

  return parts.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build the session context string for injection into system prompt
 * @param {SessionContextData} data - Raw context data from sessionContext.js
 * @param {Object} options - Optional filtering
 * @param {string} options.entityType - 'todo' | 'habit' | 'note' - current entity type
 * @param {string} options.spaceId - Current space ID (for space chat)
 * @returns {string} Formatted context string
 */
export function buildSessionContextString(data, options = {}) {
  if (!data) return '';

  const parts = [];

  // 1. Today's drops
  const todayStr = formatTodaysDrops(data.todaysDrops);
  if (todayStr) parts.push(todayStr);

  // 2. Week summary
  const weekStr = formatWeekSummary(data.weekSummary);
  if (weekStr) parts.push(weekStr);

  // 3. Habit health (always include if there are habits)
  const habitStr = formatHabitHealth(data.habitHealth, options.entityType);
  if (habitStr) parts.push(habitStr);

  // 4. Upcoming milestones
  const milestoneStr = formatMilestones(data.upcomingMilestones);
  if (milestoneStr) parts.push(milestoneStr);

  // 5. Recent wins
  const winsStr = formatRecentWins(data.recentWins);
  if (winsStr) parts.push(winsStr);

  if (parts.length === 0) return '';

  // Combine with header
  let result = '=== RECENT ACTIVITY ===\n' + parts.join('\n');

  // Truncate if too long (hard limit ~600 chars / ~150 tokens)
  if (result.length > 600) {
    result = result.slice(0, 597) + '...';
  }

  return result;
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format today's drops into a single line
 * "Today: 3 items (Buy air purifier, Call dentist, journal—mood: overwhelmed)"
 */
function formatTodaysDrops(drops) {
  if (!drops || drops.length === 0) return null;

  const count = drops.length;

  // Format each drop
  const formatted = drops.slice(0, 4).map((d) => {
    if (d.type === 'journal' && d.mood && d.mood.length > 0) {
      const shortTitle = truncateTitle(d.title, 20);
      return `${shortTitle}—mood: ${d.mood.slice(0, 2).join(', ')}`;
    }
    return truncateTitle(d.title, 25);
  });

  let result = `Today: ${count} item${count !== 1 ? 's' : ''}`;

  if (formatted.length > 0) {
    result += ` (${formatted.join(', ')}`;
    if (drops.length > 4) {
      result += `, +${drops.length - 4} more`;
    }
    result += ')';
  }

  return result;
}

/**
 * Format week summary
 * "This week: 8/12 todos done, 2 stuck items"
 */
function formatWeekSummary(summary) {
  if (!summary) return null;

  const { createdWeek, completedWeek, stuckCount } = summary;

  // Skip if no activity
  if (createdWeek === 0 && completedWeek === 0) return null;

  let result = `This week: ${completedWeek}/${createdWeek} todos done`;

  if (stuckCount > 0) {
    result += `, ${stuckCount} stuck item${stuckCount !== 1 ? 's' : ''}`;
  }

  return result;
}

/**
 * Format habit health
 * "Habits: "Read" 5/7, "Stretch" 1/7 (struggling)"
 */
function formatHabitHealth(habits, entityType) {
  if (!habits || habits.length === 0) return null;

  // Show more detail if user is chatting about a habit
  const maxHabits = entityType === 'habit' ? 4 : 3;

  const formatted = habits.slice(0, maxHabits).map((h) => {
    const status = getHabitStatus(h.completionsThisWeek, h.frequency);
    let str = `"${truncateTitle(h.name, 15)}" ${h.completionsThisWeek}/7`;
    if (status === 'struggling') {
      str += ' (struggling)';
    } else if (status === 'strong') {
      str += ' (strong)';
    }
    return str;
  });

  if (formatted.length === 0) return null;

  return `Habits: ${formatted.join(', ')}`;
}

/**
 * Determine habit status based on completions
 */
function getHabitStatus(completions, frequency) {
  // For daily habits:
  // - 0-2 completions = struggling
  // - 3-5 = okay (no label)
  // - 6-7 = strong

  // Simplified: treat all as daily for now
  if (completions <= 2) return 'struggling';
  if (completions >= 6) return 'strong';
  return 'okay';
}

/**
 * Format upcoming milestones
 * "Upcoming: "Run 5K" in 12 days (Health Goals)"
 */
function formatMilestones(milestones) {
  if (!milestones || milestones.length === 0) return null;

  const formatted = milestones.slice(0, 2).map((m) => {
    const days = m.daysRemaining;
    const timeStr = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    return `"${truncateTitle(m.title, 20)}" ${timeStr} (${truncateTitle(m.spaceName, 15)})`;
  });

  return `Upcoming: ${formatted.join(', ')}`;
}

/**
 * Format recent wins
 * "Recent wins: Finished quarterly report, Booked flight"
 */
function formatRecentWins(wins) {
  if (!wins || wins.length === 0) return null;

  const formatted = wins.slice(0, 3).map((w) => truncateTitle(w.title, 25));

  return `Recent wins: ${formatted.join(', ')}`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Truncate title to max length, adding ellipsis if needed
 */
function truncateTitle(title, maxLength) {
  if (!title) return 'Untitled';
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1) + '…';
}

// ============================================================================
// TYPES (for documentation)
// ============================================================================

/**
 * @typedef {Object} SessionContextData
 * @property {Array<{title: string, type: string, mood?: string[], created_at: string}>} todaysDrops
 * @property {{createdWeek: number, completedWeek: number, stuckCount: number}} weekSummary
 * @property {Array<{name: string, frequency: string, completionsThisWeek: number, lastCheckedIn: string|null}>} habitHealth
 * @property {Array<{title: string, date: string, spaceName: string, daysRemaining: number}>} upcomingMilestones
 * @property {Array<{title: string, completed_at: string}>} recentWins
 * @property {string} queriedAt
 */
