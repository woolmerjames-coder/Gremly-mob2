/**
 * HabitWeeklyRowV2 - Updated habit row with Gremly faces for completion indicators
 *
 * Shows habit name, metadata (streak/progress), rolling 7-day Gremly faces, and status.
 * Gremly faces are tappable to toggle completion.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../../ui';
import { Icon } from '../../design-system/Icon';
import { GremlyDot } from '../ui/GremlyDot';
import { BRAND } from '../../design/brand';

interface HabitWeeklyRowV2Props {
  habitId: string;
  name: string;

  // Metadata display (varies by cadence)
  metadataLabel: string; // "2/3 past 7d" or "🔥 12" or "2d ago"
  metadataIcon?: 'Flame' | 'Clock' | 'RefreshCw' | 'Calendar';

  // Status
  status: 'on_track' | 'needs_attention' | 'done_for_period';

  // Rolling 7 days data
  days: Array<{
    date: string; // ISO date "2024-12-15"
    dayLabel: string; // "M", "T", "W", etc.
    isToday: boolean;
    isCompleted: boolean;
    isFuture: boolean; // For days after today (greyed out differently)
  }>;

  // Interactions
  onToggleDay: (date: string, newState: boolean) => void;
  onPressRow: () => void;

  showDivider?: boolean;
}

const STATUS_CONFIG = {
  on_track: { label: 'On track', color: BRAND.colors.mossGreen },
  needs_attention: { label: 'Needs attention', color: BRAND.colors.goldenPear },
  done_for_period: { label: 'On track', color: BRAND.colors.mossGreen },
};

export function HabitWeeklyRowV2({
  habitId,
  name,
  metadataLabel,
  metadataIcon,
  status,
  days,
  onToggleDay,
  onPressRow,
  showDivider = false,
}: HabitWeeklyRowV2Props) {
  const statusConfig = STATUS_CONFIG[status];

  // Check if metadata includes flame emoji (streak display)
  const isFlameIcon = metadataIcon === 'Flame';

  return (
    <TouchableOpacity
      style={[styles.row, showDivider && styles.divider]}
      onPress={onPressRow}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${statusConfig.label}`}
    >
      {/* Accent bar */}
      <View style={styles.accentBar} />

      <View style={styles.content}>
        {/* Top row: Title + Metadata */}
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.metadataContainer}>
            {metadataIcon && (
              <Icon
                name={metadataIcon}
                size="xs"
                color={isFlameIcon ? BRAND.colors.goldenPear : BRAND.colors.inkMuted}
              />
            )}
            <Text style={[styles.metadataText, isFlameIcon && styles.metadataFlame]}>
              {metadataLabel}
            </Text>
          </View>
        </View>

        {/* Bottom row: Gremly faces + Status */}
        <View style={styles.gremlysRow}>
          <View style={styles.gremlysContainer}>
            {days.map((day) => (
              <GremlyDot
                key={day.date}
                isCompleted={day.isCompleted}
                isToday={day.isToday}
                isFuture={day.isFuture}
                onPress={() => onToggleDay(day.date, !day.isCompleted)}
                size={28}
              />
            ))}
          </View>
          <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 14, // More spacious
    paddingHorizontal: 4,
  },
  accentBar: {
    width: 4,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 2,
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: BRAND.colors.charcoalInk,
    flex: 1,
    marginRight: 8,
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
  },
  metadataFlame: {
    color: BRAND.colors.goldenPear,
  },
  gremlysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gremlysContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  statusLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
});
