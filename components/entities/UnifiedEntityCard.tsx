/**
 * UnifiedEntityCard - Shared card component for entity display
 *
 * This component provides a consistent card layout for todos, habits, logs, and lists
 * across both the Today page and Spaces. It extracts the base styling from NowFocusRow
 * and SpaceItemRow to create a reusable component.
 *
 * Layout:
 * - Left accent bar (colored by entity type)
 * - Title text with optional strikethrough for completed items
 * - Type chip (optional) + subtitle line
 * - Right side: checkbox (todos), progress bar (habits), or chevron (logs/lists)
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Habit, Todo, Note } from '../../lib/types';

// =============================================================================
// TYPES
// =============================================================================

/** Entity types that can be displayed in the card */
export type EntityType = 'todo' | 'habit' | 'log' | 'list';

/** Unified entity record - can be any of the supported types */
export type UnifiedEntityRecord =
  | (Todo & { entityType: 'todo' })
  | (Habit & { entityType: 'habit' })
  | (Note & { entityType: 'log' | 'list' });

/** Props for the UnifiedEntityCard component */
export interface UnifiedEntityCardProps {
  /** The entity to display */
  entity: UnifiedEntityRecord;
  /** Handler for when the card is pressed */
  onPress: () => void;
  /** Handler for toggling completion (todos/habits only) */
  onToggleComplete?: () => void;
  /** Whether to show the checkbox (true for todos, false for logs/lists) */
  showCheckbox?: boolean;
  /** Whether to show the progress bar (true for habits) */
  showProgressBar?: boolean;
  /** Whether to show the type chip */
  showTypeChip?: boolean;
  /** Whether this is the first item (hides top divider) */
  isFirst?: boolean;
  /** Whether the item is completed */
  completed?: boolean;
  /** Progress data for habits */
  habitProgress?: { done: number; target: number };
  /** Handler for logging habit progress */
  onLogProgress?: () => void;
  /** Optional subtitle text */
  subtitle?: string;
  /** Test ID for testing */
  testID?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Accent colors for each entity type - matches NowFocusRow */
const ACCENT_COLORS: Record<EntityType, string> = {
  todo: '#4A7FBF', // Soft blue
  habit: '#2E5540', // Moss Green
  log: '#9CA6E0', // Periwinkle Smoke
  list: '#E0C47A', // Golden Pear
};

/** Type chip background colors - matches NowTypeChip */
const TYPE_CHIP_BG: Record<EntityType, string> = {
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

/** Brand colors */
const BRAND = {
  mossGreen: '#2E5540',
  charcoalInk: '#1A1A1A',
  inkSubtle: '#666666',
  surface: '#FFFFFF',
  linenCream: '#FDF8F3',
};

/** Divider color */
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the title from an entity record
 */
function getEntityTitle(entity: UnifiedEntityRecord): string {
  if (entity.entityType === 'todo' || entity.entityType === 'habit') {
    return entity.name || (entity as Todo).title || 'Untitled';
  }
  return (entity as Note).title || 'Untitled';
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
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `${diffDays} days`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function UnifiedEntityCard({
  entity,
  onPress,
  onToggleComplete,
  showCheckbox = true,
  showProgressBar = true,
  showTypeChip = true,
  isFirst = false,
  completed = false,
  habitProgress,
  onLogProgress,
  subtitle,
  testID,
}: UnifiedEntityCardProps) {
  const entityType = entity.entityType;
  const accentColor = ACCENT_COLORS[entityType];
  const chipBg = TYPE_CHIP_BG[entityType];
  const typeLabel = TYPE_LABELS[entityType];
  const title = getEntityTitle(entity);

  // Build subtitle if not provided
  const displaySubtitle =
    subtitle ??
    (() => {
      if (entityType === 'todo') {
        const todo = entity as Todo;
        return formatDueDate(todo.due_day);
      }
      if (entityType === 'habit' && habitProgress) {
        return `${habitProgress.done}/${habitProgress.target} this week`;
      }
      return '';
    })();

  return (
    <View style={styles.wrapper}>
      {/* Top divider - only show if not first item */}
      {!isFirst && <View style={styles.divider} />}

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel}: ${title}`}
      >
        {/* Left accent bar */}
        <View style={styles.accentContainer}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        </View>

        {/* Content area */}
        <View style={styles.content}>
          {/* Title row */}
          <Text numberOfLines={1} style={[styles.title, completed && styles.titleCompleted]}>
            {title}
          </Text>

          {/* Meta row - type chip and subtitle */}
          <View style={styles.metaRow}>
            {showTypeChip && (
              <View
                style={[styles.typeChip, { backgroundColor: chipBg }]}
                testID={testID ? `${testID}-chip` : undefined}
              >
                <Text style={styles.typeChipText}>{typeLabel}</Text>
              </View>
            )}
            {displaySubtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {displaySubtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Right side action - Checkbox for todos */}
        {entityType === 'todo' && showCheckbox && onToggleComplete && (
          <Pressable
            onPress={onToggleComplete}
            style={styles.checkboxContainer}
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

        {/* Right side action - Progress bar for habits */}
        {entityType === 'habit' && showProgressBar && habitProgress && (
          <View style={styles.habitRight}>
            {onLogProgress && (
              <Pressable
                onPress={onLogProgress}
                style={styles.habitLogButton}
                testID={testID ? `${testID}-log` : undefined}
                accessibilityRole="button"
                accessibilityLabel={`Log progress for ${title}`}
              >
                <Text style={styles.habitLogIcon}>+</Text>
              </Pressable>
            )}
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (habitProgress.done / habitProgress.target) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* Right side action - Chevron for logs/lists */}
        {(entityType === 'log' || entityType === 'list') && <Text style={styles.chevron}>›</Text>}
      </Pressable>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: BRAND.linenCream,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 20,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 4,
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
    height: 36,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: BRAND.charcoalInk,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  typeChip: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.inkSubtle,
    lineHeight: 13,
  },
  subtitle: {
    marginLeft: 6,
    fontSize: 11,
    lineHeight: 13,
    color: BRAND.inkSubtle,
  },
  // Checkbox styles
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
    borderColor: BRAND.inkSubtle,
    backgroundColor: BRAND.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: BRAND.mossGreen,
    borderColor: BRAND.mossGreen,
  },
  checkmark: {
    color: BRAND.surface,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  // Habit progress styles
  habitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  habitLogButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND.mossGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  habitLogIcon: {
    color: BRAND.surface,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 16,
  },
  progressBar: {
    width: 60,
    height: 6,
    backgroundColor: 'rgba(46, 85, 64, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND.mossGreen,
    borderRadius: 3,
  },
  // Chevron for logs/lists
  chevron: {
    fontSize: 20,
    color: BRAND.inkSubtle,
    marginLeft: 8,
    marginRight: 8,
  },
});

export default UnifiedEntityCard;
