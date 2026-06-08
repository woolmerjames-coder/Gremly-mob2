/**
 * SweepHabitsCheckInStep -- "Check in on habits" spoke (v7-1).
 *
 * A per-habit card deck for the weekly sweep hub. One card per active habit,
 * swipeable / next-prev. Shows a 7-day row with tappable toggle per cell
 * (past + today only). Window is cadence-aware:
 *   daily    → rolling 7 days ending today
 *   weekly / monthly → Mon-Sun calendar week
 * Derived entirely from habitProgress in the store.
 * No AI, no feeding gauge.
 */

import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Flame, ChevronLeft, ChevronRight, Check, Circle } from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useHabitCardStats } from '../../../lib/habits/habitCardStats';
import type { HabitCardStats } from '../../../lib/habits/habitCardStats';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

export interface SweepHabitsCheckInStepProps {
  onFinish: () => void;
}

export function SweepHabitsCheckInStep({ onFinish }: SweepHabitsCheckInStepProps) {
  const habits = useGremlyStore((s) => s.habits.filter((h) => !h.archived));
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);

  const cards = useHabitCardStats(habits);

  const [index, setIndex] = useState(0);

  const card = cards[index] as HabitCardStats | undefined;

  const handleToggleDay = useCallback(
    async (date: string, isCompleted: boolean) => {
      if (!card) return;
      if (isCompleted) {
        await removeHabitCompletionForDate(card.id, date);
      } else {
        await logHabitCompletionForDate(card.id, date);
      }
    },
    [card, logHabitCompletionForDate, removeHabitCompletionForDate],
  );

  const handlePrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    if (index < cards.length - 1) {
      setIndex(index + 1);
    } else {
      onFinish();
    }
  }, [index, cards.length, onFinish]);

  if (cards.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No habits to review</Text>
        <Text style={styles.emptyBody}>Add habits to start tracking them week by week.</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onFinish} activeOpacity={0.8}>
          <Text style={styles.doneBtnText}>Back to hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!card) return null;

  const isLast = index === cards.length - 1;
  const statusColor =
    card.status === 'done_for_week'
      ? BRAND.colors.mossGreen
      : card.status === 'needs_attention'
        ? '#C07A3A'
        : BRAND.colors.charcoalInk;

  const statusLabel =
    card.status === 'done_for_week'
      ? 'Done for the week'
      : card.status === 'needs_attention'
        ? 'Needs attention'
        : 'On track';

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressRow}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.progressDot, i === index && styles.progressDotActive]} />
        ))}
      </View>

      {/* Card */}
      <View style={styles.card}>
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.habitName}>{card.name}</Text>
            <View style={styles.chipRow}>
              <View style={styles.freqChip}>
                <Text style={styles.freqChipText}>{card.frequencyLabel}</Text>
              </View>
              <View style={[styles.statusChip, { borderColor: statusColor }]}>
                <Text style={[styles.statusChipText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>
          </View>
          {card.streak.count > 0 && (
            <View style={styles.streakBlock}>
              <Flame size={14} strokeWidth={2} color="#E06B3F" />
              <Text style={styles.streakCount}>{card.streak.count}</Text>
              <Text style={styles.streakUnit}>
                {card.streak.unit === 'week' ? 'wk' : 'day'}
                {card.streak.count !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Week progress */}
        <View style={styles.weekProgress}>
          <Text style={styles.weekProgressText}>
            <Text style={styles.weekProgressHits}>{card.weekHits}</Text>
            <Text style={styles.weekProgressOf}> / {card.weekTarget} this week</Text>
          </Text>
        </View>

        {/* Day row */}
        <View style={styles.dayRow}>
          {card.days.map((day) => {
            const tappable = !day.isFuture && day.isScheduled;
            return (
              <TouchableOpacity
                key={day.date}
                style={[
                  styles.dayCell,
                  day.isToday && styles.dayCellToday,
                  day.isCompleted && styles.dayCellCompleted,
                  (!day.isScheduled || day.isFuture) && styles.dayCellDisabled,
                ]}
                onPress={() => tappable && handleToggleDay(day.date, day.isCompleted)}
                activeOpacity={tappable ? 0.7 : 1}
                accessibilityRole="checkbox"
                accessibilityLabel={`${day.dayLabel} ${day.date}${day.isCompleted ? ' completed' : ''}`}
                accessibilityState={{ checked: day.isCompleted, disabled: !tappable }}
              >
                <Text
                  style={[
                    styles.dayCellLabel,
                    day.isCompleted && styles.dayCellLabelCompleted,
                    (!day.isScheduled || day.isFuture) && styles.dayCellLabelDisabled,
                  ]}
                >
                  {day.dayLabel}
                </Text>
                <View style={styles.dayCellIndicator}>
                  {day.isCompleted ? (
                    <Check size={12} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                  ) : tappable ? (
                    <Circle size={12} strokeWidth={1.5} color="rgba(34,34,34,0.25)" />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, index === 0 && styles.navBtnDisabled]}
          onPress={handlePrev}
          disabled={index === 0}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Previous habit"
        >
          <ChevronLeft
            size={20}
            strokeWidth={2}
            color={index === 0 ? BRAND.colors.inkMuted : BRAND.colors.charcoalInk}
          />
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={styles.navCounter}>
            {index + 1} of {cards.length}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnNext]}
          onPress={handleNext}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Done' : 'Next habit'}
        >
          {isLast ? (
            <Text style={styles.navBtnNextText}>Done</Text>
          ) : (
            <ChevronRight size={20} strokeWidth={2} color={BRAND.colors.mossGreen} />
          )}
        </TouchableOpacity>
      </View>

      {/* Skip / finish early */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={onFinish} activeOpacity={0.7}>
          <Text style={styles.skipBtnText}>Finish early</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 16,
  },

  // Progress dots
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 24,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(34,34,34,0.15)',
  },
  progressDotActive: {
    backgroundColor: BRAND.colors.mossGreen,
    width: 18,
  },

  // Card
  card: {
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderRadius: BRAND.radius['2xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardHeaderLeft: { flex: 1, marginRight: 12 },
  habitName: {
    fontSize: 20,
    fontFamily: SERIF,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
    lineHeight: 26,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  freqChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(191,216,192,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.60)',
  },
  freqChipText: { fontSize: 12, fontWeight: '500', color: BRAND.colors.mossGreen },
  statusChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  statusChipText: { fontSize: 12, fontWeight: '500' },
  streakBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(224,107,63,0.10)',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(224,107,63,0.25)',
  },
  streakCount: { fontSize: 14, fontWeight: '700', color: '#E06B3F' },
  streakUnit: { fontSize: 12, fontWeight: '400', color: '#E06B3F' },

  // Week progress
  weekProgress: { marginBottom: 16 },
  weekProgressText: { fontSize: 14 },
  weekProgressHits: { fontSize: 20, fontWeight: '700', color: BRAND.colors.charcoalInk },
  weekProgressOf: { fontSize: 14, fontWeight: '400', color: 'rgba(34,34,34,0.55)' },

  // Day row
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(34,34,34,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 4,
  },
  dayCellToday: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: 'rgba(191,216,192,0.15)',
  },
  dayCellCompleted: {
    backgroundColor: 'rgba(191,216,192,0.30)',
    borderColor: 'rgba(191,216,192,0.60)',
  },
  dayCellDisabled: { opacity: 0.35 },
  dayCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 0.3,
  },
  dayCellLabelCompleted: { color: BRAND.colors.mossGreen },
  dayCellLabelDisabled: { color: BRAND.colors.inkMuted },
  dayCellIndicator: { height: 16, alignItems: 'center', justifyContent: 'center' },

  // Navigation
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,34,34,0.06)',
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnNext: {
    backgroundColor: BRAND.colors.sageMist,
    minWidth: 72,
    borderRadius: BRAND.radius.xl,
    paddingHorizontal: 16,
  },
  navBtnNextText: { fontSize: 15, fontWeight: '600', color: BRAND.colors.mossGreen },
  navCenter: { flex: 1, alignItems: 'center' },
  navCounter: { fontSize: 13, fontWeight: '500', color: BRAND.colors.inkMuted },

  // Skip
  skipBtn: { alignItems: 'center', paddingVertical: 10 },
  skipBtnText: { fontSize: 14, fontWeight: '500', color: BRAND.colors.inkMuted },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
    backgroundColor: BRAND.colors.linenCream,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: SERIF,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(34,34,34,0.55)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  doneBtn: {
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  doneBtnText: { fontSize: 16, fontWeight: '600', color: BRAND.colors.mossGreen },
});
