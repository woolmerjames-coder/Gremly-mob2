import React, { useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarDays, Check, Calendar } from 'lucide-react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { lightTokens } from '../../design/tokens';
import type { WeekDay } from '../../lib/store/weekGridSelectors';

const HEAT = lightTokens.colors.sweepHeat;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WeekGridSchedulerProps = {
  days: WeekDay[];
  selectedDate: string | null;
  pickedDateLabel?: string | null;
  onSelectDay: (date: string) => void;
  onRequestDatePicker: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function heatTint(count: number): string {
  if (count === 0) return HEAT.none;
  if (count <= 2) return HEAT.low;
  if (count <= 4) return HEAT.med;
  return HEAT.high;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WeekGridScheduler({
  days,
  selectedDate,
  pickedDateLabel,
  onSelectDay,
  onRequestDatePicker,
}: WeekGridSchedulerProps) {
  const triggerLight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <View style={styles.grid}>
      {days.map((day) => {
        const isSelected = day.date === selectedDate;
        const total = day.todoCount + day.eventCount;
        const isHeavy = total > 4;
        const capacityColor =
          isHeavy && !isSelected
            ? HEAT.heavyText
            : isSelected
              ? BRAND.colors.mossGreen
              : BRAND.colors.inkMuted;

        return (
          <Pressable
            key={day.date}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: isSelected ? BRAND.colors.sageMist : heatTint(total) },
              isSelected && styles.cellSelected,
              day.isToday && !isSelected && styles.cellToday,
              pressed && styles.cellPressed,
            ]}
            onPress={() => {
              triggerLight();
              onSelectDay(day.date);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${day.dow} ${day.dayNum}, ${day.todoCount} todos, ${day.eventCount} events`}
            accessibilityState={{ selected: isSelected }}
          >
            {/* Top row: dow + dayNum + tag */}
            <View style={styles.topRow}>
              <Text style={[styles.dow, isSelected && styles.dowSelected]}>
                {day.dow.toUpperCase()}
              </Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{day.dayNum}</Text>
              {day.tag ? (
                <Text style={[styles.tag, isSelected && styles.tagSelected]}>{day.tag}</Text>
              ) : null}
            </View>

            {/* Capacity line — breakdown of todos + events on one line */}
            <View style={styles.capacityRow}>
              {total === 0 ? (
                <Text
                  style={[styles.capacity, isSelected && styles.capacitySelected]}
                  numberOfLines={1}
                >
                  nothing yet
                </Text>
              ) : (
                <>
                  {day.todoCount > 0 && (
                    <>
                      <Check size={11} strokeWidth={2.5} color={capacityColor} />
                      <Text
                        style={[
                          styles.capacity,
                          isHeavy && !isSelected && styles.capacityHeavy,
                          isSelected && styles.capacitySelected,
                        ]}
                        numberOfLines={1}
                      >
                        {day.todoCount}
                      </Text>
                    </>
                  )}
                  {day.todoCount > 0 && day.eventCount > 0 && (
                    <Text
                      style={[
                        styles.capacity,
                        isHeavy && !isSelected && styles.capacityHeavy,
                        isSelected && styles.capacitySelected,
                      ]}
                    >
                      {'·'}
                    </Text>
                  )}
                  {day.eventCount > 0 && (
                    <>
                      <Calendar size={11} strokeWidth={2} color={capacityColor} />
                      <Text
                        style={[
                          styles.capacity,
                          isHeavy && !isSelected && styles.capacityHeavy,
                          isSelected && styles.capacitySelected,
                        ]}
                        numberOfLines={1}
                      >
                        {day.eventCount}
                      </Text>
                    </>
                  )}
                </>
              )}
            </View>
          </Pressable>
        );
      })}

      {/* 8th cell — Pick a date */}
      <Pressable
        style={({ pressed }) => [
          styles.cell,
          styles.cellPick,
          pickedDateLabel ? styles.cellSelected : null,
          pressed && styles.cellPressed,
        ]}
        onPress={onRequestDatePicker}
        accessibilityRole="button"
        accessibilityLabel="Pick a date"
      >
        <CalendarDays size={16} strokeWidth={1.8} color={BRAND.colors.mossGreen} />
        <Text style={styles.pickLabel}>{pickedDateLabel ?? 'Pick a date'}</Text>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },

  cell: {
    width: '48%',
    minHeight: 56,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'transparent',
  },

  cellSelected: {
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 1.5,
  },

  cellToday: {
    borderColor: HEAT.todayRing,
    borderWidth: 1.5,
  },

  cellPressed: {
    opacity: 0.82,
  },

  cellPick: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: BRAND.colors.sageMist,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  dow: {
    fontSize: 11.5,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    letterSpacing: 0.6,
    fontFamily: 'Inter-Medium',
  },

  dowSelected: {
    color: BRAND.colors.mossGreen,
  },

  dayNum: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    fontFamily: 'PlusJakartaSans-Bold',
    lineHeight: 22,
  },

  dayNumSelected: {
    color: BRAND.colors.mossGreen,
  },

  tag: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-Medium',
    marginLeft: 'auto',
  },

  tagSelected: {
    color: BRAND.colors.mossGreen,
  },

  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },

  capacity: {
    fontSize: 11,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
  },

  capacityHeavy: {
    color: HEAT.heavyText,
    fontWeight: '600',
  },

  capacitySelected: {
    color: BRAND.colors.mossGreen,
  },

  pickLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-Medium',
  },
});
