/**
 * EntityCard - Shared card component for entity display
 *
 * This component provides a consistent card layout for todos, habits, logs, and lists
 * across both the Today page and Spaces. Matches NowFocusRow styling exactly.
 *
 * Layout:
 * - Left accent bar (colored by entity type)
 * - Title text with optional strikethrough for completed items
 * - Type pill (optional) + subtitle line
 * - Right side: checkbox (todos/habits), or chevron (logs/lists)
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import type { Habit, Todo, Note } from '../../lib/types';

// =============================================================================
// TYPES
// =============================================================================

/** Entity types that can be displayed in the card */
export type EntityType = 'todo' | 'habit' | 'log' | 'list';

/** Base entity record shape */
export interface EntityRecord {
  id: string;
  name?: string;
  title?: string;
  due_day?: string | null;
  completed_at?: string | null;
  subtype?: string | null;
  body?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

/** Props for the EntityCard component */
export interface EntityCardProps {
  /** The entity record to display */
  record: EntityRecord;
  /** The type of entity */
  type: EntityType;
  /** Handler for when the card is pressed */
  onPress: () => void;
  /** Handler for toggling completion (todos/habits only) */
  onToggleComplete?: () => void;
  /** Whether to show the checkbox */
  showCheckbox?: boolean;
  /** Whether to show the type pill */
  showTypePill?: boolean;
  /** Whether this is the first item (hides top divider) */
  isFirst?: boolean;
  /** Whether the item is completed */
  completed?: boolean;
  /** Progress data for habits */
  habitProgress?: { done: number; target: number };
  /** Handler for logging habit progress */
  onLogProgress?: () => void;
  /** Optional subtitle override */
  subtitle?: string;
  /** Test ID for testing */
  testID?: string;
  /** Optional container style override */
  containerStyle?: ViewStyle;
  /** Day-by-day completion flags for habits (7 booleans, Mon-Sun) */
  habitDayFlags?: boolean[];
  /** Relative time label for logs (e.g., "Today", "Yest", "Dec 5") */
  timeLabel?: string;
  /** Topic tag for logs (e.g., "Plan", "Reflection") */
  topicTag?: string;
  /** List progress for lists */
  listProgress?: { done: number; total: number };
}

// =============================================================================
// CONSTANTS - Match NowFocusRow exactly
// =============================================================================

/** Accent colors for each entity type - matches NowFocusRow */
const ACCENT_COLORS: Record<EntityType, string> = {
  todo: '#4A7FBF', // Soft blue matching Todo chip
  habit: '#2E5540', // Moss Green
  log: '#9CA6E0', // Periwinkle Smoke
  list: '#E0C47A', // Golden Pear
};

/** Type pill background colors - matches NowTypeChip */
const TYPE_PILL_BG: Record<EntityType, string> = {
  todo: '#E6F0FF', // Light blue
  habit: '#EAF7ED', // Light green
  log: '#F0F0FA', // Light periwinkle
  list: '#FDF5E6', // Light golden
};

/** Type labels for display */
const TYPE_LABELS: Record<EntityType, string> = {
  todo: 'Todo',
  habit: 'Habit',
  log: 'Log',
  list: 'List',
};

/** Brand colors - matching NowFocusRow */
const COLORS = {
  mossGreen: '#2E5540',
  charcoalInk: '#1A1A1A',
  inkSubtle: '#666666',
  surface: '#FFFFFF',
  background: '#FDF8F3', // Linen cream - matches Today page
  divider: 'rgba(0, 0, 0, 0.08)',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the title from an entity record
 */
function getEntityTitle(record: EntityRecord): string {
  return record.name || record.title || 'Untitled';
}

/**
 * Format a due date for display
 */
function formatDueDate(dueDay?: string | null): string {
  if (!dueDay) return '';
  try {
    const date = new Date(dueDay + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = date.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due: Today';
    if (diffDays === 1) return 'Due: Tomorrow';
    if (diffDays < 7) {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `Due: ${dayName}`;
    }
    return `Due: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } catch {
    return '';
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** 7-dot week strip showing daily habit completion */
function HabitWeekStrip({ dayFlags, accentColor }: { dayFlags: boolean[]; accentColor: string }) {
  return (
    <View style={habitStripStyles.container}>
      {dayFlags.map((done, index) => (
        <View
          key={index}
          style={[
            habitStripStyles.dot,
            done ? { backgroundColor: accentColor } : { backgroundColor: '#E5E5E5' },
          ]}
        />
      ))}
    </View>
  );
}

const habitStripStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});

/** Horizontal progress bar for lists */
function ListProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  return (
    <View style={listProgressStyles.container}>
      <View style={listProgressStyles.barTrack}>
        <View style={[listProgressStyles.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={listProgressStyles.label}>
        {done}/{total}
      </Text>
    </View>
  );
}

const listProgressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  barTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(224, 196, 122, 0.25)', // Golden Pear at 25%
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 80,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#E0C47A', // Golden Pear
    borderRadius: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
  },
});

// =============================================================================
// COMPONENT
// =============================================================================

export function EntityCard({
  record,
  type,
  onPress,
  onToggleComplete,
  showCheckbox = true,
  showTypePill = true,
  isFirst = false,
  completed = false,
  habitProgress,
  onLogProgress,
  subtitle,
  testID,
  containerStyle,
  habitDayFlags,
  timeLabel,
  topicTag,
  listProgress,
}: EntityCardProps) {
  const accentColor = ACCENT_COLORS[type];
  const pillBg = TYPE_PILL_BG[type];
  const typeLabel = TYPE_LABELS[type];
  const title = getEntityTitle(record);

  // Build subtitle if not provided
  const displaySubtitle =
    subtitle ??
    (() => {
      if (type === 'todo') {
        return formatDueDate(record.due_day);
      }
      if (type === 'habit' && habitProgress) {
        return `${habitProgress.done}/${habitProgress.target} this week`;
      }
      if (type === 'log' && record.body) {
        // Show first ~50 chars of body as preview
        const preview = String(record.body).replace(/\n/g, ' ').trim();
        return preview.length > 50 ? preview.slice(0, 50) + '...' : preview;
      }
      return '';
    })();

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {/* Top divider - only show if not first item */}
      {!isFirst && <View style={styles.divider} />}

      {/* Card row - horizontal layout with card pressable and action button as siblings */}
      <View style={styles.cardRow}>
        {/* Main card pressable - covers accent bar and text content */}
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={`${typeLabel}: ${title}`}
        >
          {/* Left accent bar */}
          <View style={styles.accentContainer}>
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          </View>

          {/* Text block */}
          <View style={styles.textContainer}>
            {/* Title row */}
            <Text numberOfLines={1} style={[styles.title, completed && styles.titleCompleted]}>
              {title}
            </Text>

            {/* Meta row - type pill and subtitle */}
            <View style={styles.metaRow}>
              {showTypePill && (
                <View
                  style={[styles.typePill, { backgroundColor: pillBg }]}
                  testID={testID ? `${testID}-pill` : undefined}
                >
                  <Text style={styles.typePillText}>{typeLabel}</Text>
                </View>
              )}
              {type === 'list' && listProgress && (
                <ListProgressBar done={listProgress.done} total={listProgress.total} />
              )}
              {type === 'habit' && habitDayFlags ? (
                <View style={styles.habitMetaRow}>
                  <HabitWeekStrip dayFlags={habitDayFlags} accentColor={accentColor} />
                  {habitProgress && (
                    <Text style={styles.habitFraction}>
                      {habitProgress.done}/{habitProgress.target} this week
                    </Text>
                  )}
                </View>
              ) : displaySubtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {displaySubtitle}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        {/* Right side action - Checkbox for todos (sibling to card pressable) */}
        {type === 'todo' && showCheckbox && onToggleComplete && (
          <Pressable
            onPress={() => {
              console.log('[EntityCard] Checkbox pressed');
              onToggleComplete();
            }}
            style={styles.checkboxContainer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={testID ? `${testID}-checkbox` : undefined}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: completed }}
            accessibilityLabel={`Mark ${title} as complete`}
          >
            <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
              {completed && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </Pressable>
        )}

        {/* Right side action - Log button for habits (sibling to card pressable) */}
        {type === 'habit' && showCheckbox && onLogProgress && (
          <Pressable
            onPress={() => {
              console.log('[EntityCard] Habit + pressed');
              onLogProgress();
            }}
            style={styles.habitLogContainer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={testID ? `${testID}-log` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Log progress for ${title}`}
          >
            <View style={styles.habitLogButton}>
              <Text style={styles.habitLogIcon}>+</Text>
            </View>
          </Pressable>
        )}

        {/* Right side action - Chevron for logs/lists */}
        {(type === 'log' || type === 'list') && (
          <View style={styles.chevronContainer}>
            <Text style={styles.chevron}>›</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// STYLES - Match NowFocusRow exactly
// =============================================================================

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 20,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  cardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 18,
  },
  pressed: {
    opacity: 0.7,
  },
  accentContainer: {
    width: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  accentBar: {
    width: 3,
    height: 44,
    borderRadius: 4,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  typePill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.inkSubtle,
    lineHeight: 13,
  },
  subtitle: {
    marginLeft: 6,
    fontSize: 11,
    lineHeight: 13,
    color: COLORS.inkSubtle,
  },
  habitMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  habitFraction: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.inkSubtle,
  },
  // Checkbox styles - match NowFocusRow exactly
  checkboxContainer: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.inkSubtle,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.mossGreen,
    borderColor: COLORS.mossGreen,
  },
  checkmark: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  // Habit log button styles
  habitLogContainer: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  habitLogButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.mossGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  habitLogIcon: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 16,
  },
  // Chevron for logs/lists
  chevronContainer: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 22,
    color: COLORS.inkSubtle,
  },
});

export default EntityCard;
