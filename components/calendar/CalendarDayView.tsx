/**
 * CalendarDayView - Shows all items for a selected date
 *
 * Displays todos, habits, and journals in a timeline format.
 * Groups by: Timed items, then untimed items.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { CheckCircle2, Circle, Activity, BookOpen, Clock, MapPin } from 'lucide-react-native';
import { colors, radii, spacing, shadows } from '../../theme/tokens';
import { getDateService } from '../../lib/date';
import { useCalendarItemsForDate, type CalendarItem } from '../../lib/store/calendarSelectors';

interface CalendarDayViewProps {
  selectedDate: string; // YYYY-MM-DD
  onItemPress: (item: CalendarItem) => void;
}

// Theme color mapping for space badges
const themeColors: Record<string, string> = {
  deepTeal: colors.deepTeal,
  mint: colors.mint,
  cream: '#D4C5A9',
  periwinkle: colors.periwinkle,
};

export default function CalendarDayView({ selectedDate, onItemPress }: CalendarDayViewProps) {
  const dateService = getDateService();
  const items = useCalendarItemsForDate(selectedDate);

  // Split into timed and untimed
  const timedItems = items.filter((i) => i.time !== null);
  const untimedItems = items.filter((i) => i.time === null);

  // Format the header date
  const headerDate = dateService.formatForOverlay(selectedDate);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.headerDate}>{headerDate}</Text>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>Nothing scheduled</Text>
          <Text style={styles.emptySubtext}>Drop something in Mind Drop to add it here</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerDate}>{headerDate}</Text>

      {/* Timed items */}
      {timedItems.length > 0 && (
        <View style={styles.section}>
          {timedItems.map((item) => (
            <CalendarItemRow key={item.id} item={item} onPress={() => onItemPress(item)} />
          ))}
        </View>
      )}

      {/* Untimed items */}
      {untimedItems.length > 0 && (
        <View style={styles.section}>
          {timedItems.length > 0 && <Text style={styles.sectionLabel}>No specific time</Text>}
          {untimedItems.map((item) => (
            <CalendarItemRow key={item.id} item={item} onPress={() => onItemPress(item)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CALENDAR ITEM ROW
// ═══════════════════════════════════════════════════════════════════

function CalendarItemRow({ item, onPress }: { item: CalendarItem; onPress: () => void }) {
  // Icon based on type and completion state
  const renderIcon = () => {
    if (item.type === 'todo') {
      if (item.isCompleted) {
        return <CheckCircle2 size={20} color={colors.success} />;
      }
      if (item.isOverdue) {
        return <Circle size={20} color={colors.warning} />;
      }
      return <Circle size={20} color={colors.deepTeal} />;
    }
    if (item.type === 'habit') {
      return <Activity size={20} color={item.isCompleted ? colors.success : colors.periwinkle} />;
    }
    if (item.type === 'journal') {
      return <BookOpen size={20} color={colors.gray600} />;
    }
    return <Circle size={20} color={colors.gray400} />;
  };

  // Format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  const spaceColor = item.space?.theme
    ? themeColors[item.space.theme] || colors.deepTeal
    : colors.deepTeal;

  return (
    <TouchableOpacity style={[styles.itemRow, shadows.card]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.itemIcon}>{renderIcon()}</View>

      <View style={styles.itemContent}>
        {/* Time badge */}
        {item.time && (
          <View style={styles.timeBadge}>
            <Clock size={10} color={colors.gray600} />
            <Text style={styles.timeText}>{formatTime(item.time)}</Text>
          </View>
        )}

        {/* Title */}
        <Text
          style={[styles.itemTitle, item.isCompleted && styles.itemTitleCompleted]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        {/* Space badge */}
        {item.space && (
          <View style={[styles.spaceBadge, { backgroundColor: spaceColor + '20' }]}>
            <MapPin size={10} color={spaceColor} />
            <Text style={[styles.spaceText, { color: spaceColor }]}>{item.space.name}</Text>
          </View>
        )}

        {/* Tags (show first 2) */}
        {item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.slice(0, 2).map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {item.tags.length > 2 && <Text style={styles.tagMore}>+{item.tags.length - 2}</Text>}
          </View>
        )}
      </View>

      {/* Type indicator */}
      <View style={styles.typeIndicator}>
        <Text style={styles.typeText}>
          {item.type === 'todo' ? 'To-Do' : item.type === 'habit' ? 'Habit' : 'Journal'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  headerDate: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.deepTeal,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray600,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.md,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray600,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.gray400,
    textAlign: 'center',
  },
  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemIcon: {
    marginRight: spacing.sm,
    paddingTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray600,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 4,
  },
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.gray400,
  },
  spaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  spaceText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  tagChip: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  tagText: {
    fontSize: 10,
    color: colors.gray600,
    fontWeight: '500',
  },
  tagMore: {
    fontSize: 10,
    color: colors.gray400,
  },
  typeIndicator: {
    paddingLeft: spacing.sm,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gray400,
    textTransform: 'uppercase',
  },
});
