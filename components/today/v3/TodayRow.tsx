import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import CircleCheckButton from './CircleCheckButton';
import { Flame, RotateCcw, RefreshCw, Calendar } from 'lucide-react-native';

type Lane = 'habit' | 'todo';

type Props = {
  id: string;
  lane: Lane;
  title: string;
  dueTime?: string | null;
  habitProgress?: { done: number; target: number } | null;
  // Habit metadata for inline display
  habitMetadata?: {
    icon: 'Flame' | 'RotateCcw' | 'RefreshCw' | 'Calendar';
    label: string;
    periodLabel?: string;
    frequencyLabel?: string;
  } | null;
  onComplete: (id: string) => Promise<void> | void;
  testID?: string;
  onPress?: (id: string) => void;
};

const IconMap = {
  Flame,
  RotateCcw,
  RefreshCw,
  Calendar,
} as const;

export default function TodayRow({
  id,
  lane,
  title,
  dueTime,
  habitProgress,
  habitMetadata,
  onComplete,
  testID,
  onPress,
}: Props) {
  const isHabit = lane === 'habit';
  const bg = isHabit ? BRAND.colors.sageMist : BRAND.colors.linenCream;
  const border = isHabit ? 'transparent' : 'rgba(46,85,64,0.2)';

  const MetadataIcon = habitMetadata ? IconMap[habitMetadata.icon] : null;

  return (
    <Pressable
      onPress={onPress ? () => onPress(id) : undefined}
      accessibilityHint={onPress ? 'Opens item details' : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.92 : 1 },
      ]}
      testID={testID ?? `row-${lane}-${id}`}
      accessibilityLabel={`${title}. ${isHabit ? 'Habit' : 'Task'}`}
    >
      <Box row style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={styles.title} numberOfLines={1}>
            {title}
          </Text>

          {/* Chip row: Habit tag + frequency */}
          {isHabit && (
            <View style={styles.chipRow}>
              <View style={styles.habitChipContainer}>
                <Text style={styles.habitChipText}>Habit</Text>
              </View>
              {habitMetadata?.frequencyLabel && (
                <Text style={styles.frequencyLabel}>· {habitMetadata.frequencyLabel}</Text>
              )}
            </View>
          )}

          {/* Metadata row: icon + label (no frequency, no dot) */}
          {isHabit && habitMetadata && MetadataIcon && (
            <View style={styles.metadataRow}>
              <MetadataIcon
                size={12}
                color={
                  habitMetadata.icon === 'Flame' ? BRAND.colors.goldenPear : BRAND.colors.inkMuted
                }
              />
              <Text style={styles.metadataText}>
                {habitMetadata.label}
                {habitMetadata.periodLabel && ` ${habitMetadata.periodLabel}`}
              </Text>
            </View>
          )}

          {isHabit && habitProgress && !habitMetadata ? (
            <Text variant="subtle" style={styles.subtle} numberOfLines={1}>
              Today: {Math.min(habitProgress.done, habitProgress.target)} /{' '}
              {Math.max(1, habitProgress.target)}
            </Text>
          ) : null}

          {!isHabit && dueTime ? (
            <Text variant="subtle" style={styles.subtle} numberOfLines={1}>
              Due: {dueTime}
            </Text>
          ) : null}
        </View>

        <CircleCheckButton
          ariaLabel={isHabit ? 'Add a habit check-in' : 'Mark task complete'}
          onPress={() => onComplete(id)}
        />
      </Box>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...BRAND.elevation.one,
  },
  title: { fontWeight: '600', color: BRAND.colors.charcoalInk, fontSize: 14 },
  subtle: { color: BRAND.colors.inkMuted, fontSize: 12 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  habitChipContainer: {
    backgroundColor: 'rgba(46,85,64,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  habitChipText: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
  },
  frequencyLabel: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Medium',
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metadataText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
  },
});
