/**
 * SweepHabitsCheckInStep -- "Check in on habits" spoke (v7-1/v7-2).
 *
 * Per-habit card deck. Rolling 7-day window ending today for all cadences.
 * Hero header with 3 stats (7d, streak, 30d%). Tap-to-fix day row.
 * Persistent frequency-change banner per habit (session state).
 * No AI, no gauge side-effects.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Flame, ChevronLeft, ChevronRight, Check, Circle, Pencil } from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useHabitCardStats } from '../../../lib/habits/habitCardStats';
import type { HabitCardStats } from '../../../lib/habits/habitCardStats';
import {
  computeFrequencyRecommendation,
  getFrequencyDisplayLabel,
} from '../../../lib/habits/habitFrequencyRecommendation';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

// Per-habit applied frequency changes (persists for the session)
interface AppliedChange {
  from: number;
  to: number;
  label: string;
}

export interface SweepHabitsCheckInStepProps {
  onFinish: () => void;
}

export function SweepHabitsCheckInStep({ onFinish }: SweepHabitsCheckInStepProps) {
  const allHabits = useGremlyStore((s) => s.habits);
  const habits = useMemo(() => allHabits.filter((h) => !h.archived), [allHabits]);
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const updateHabit = useGremlyStore((s) => s.updateHabit);

  const cards = useHabitCardStats(habits);

  const [index, setIndex] = useState(0);
  // Session-persistent frequency-change confirmations keyed by habitId
  const [appliedChanges, setAppliedChanges] = useState<Record<string, AppliedChange>>({});

  const card = cards[index] as HabitCardStats | undefined;
  const currentHabit = habits[index];

  const rec = useMemo(
    () => (currentHabit ? computeFrequencyRecommendation(currentHabit, habitProgress) : null),
    [currentHabit, habitProgress],
  );

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

  const handleChipPress = useCallback(
    async (n: number) => {
      if (!card || !rec) return;
      const label = getFrequencyDisplayLabel(rec.cadence, n) ?? `${n}x`;
      await updateHabit(card.id, { cadence: rec.cadence, target_per_period: n });
      setAppliedChanges((prev) => ({
        ...prev,
        [card.id]: { from: rec.currentTarget, to: n, label },
      }));
    },
    [card, rec, updateHabit],
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
  const appliedChange = appliedChanges[card.id];

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
        {/* ── Hero header ── */}
        <View style={styles.heroHeader}>
          {/* Cadence pill */}
          <View style={styles.cadencePill}>
            <Text style={styles.cadencePillText}>{card.cadence.toUpperCase()}</Text>
          </View>

          {/* Habit name */}
          <Text style={styles.heroName} numberOfLines={2}>
            {card.name}
          </Text>

          {/* Three stats row */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>
                {card.weekHits}
                <Text style={styles.heroStatDenom}> / {card.weekTarget}</Text>
              </Text>
              <Text style={styles.heroStatLabel}>this week</Text>
            </View>

            <View style={styles.heroStatDivider} />

            <View style={styles.heroStat}>
              {card.streak.count > 0 ? (
                <>
                  <View style={styles.heroStatNumRow}>
                    <Flame size={13} strokeWidth={2} color="rgba(255,255,255,0.80)" />
                    <Text style={styles.heroStatNum}>
                      {card.streak.count}
                      <Text style={styles.heroStatUnit}>
                        {' '}
                        {card.streak.unit === 'week' ? 'wk' : 'day'}
                        {card.streak.count !== 1 ? 's' : ''}
                      </Text>
                    </Text>
                  </View>
                  <Text style={styles.heroStatLabel}>streak</Text>
                </>
              ) : (
                <>
                  <Text style={styles.heroStatNum}>--</Text>
                  <Text style={styles.heroStatLabel}>streak</Text>
                </>
              )}
            </View>

            <View style={styles.heroStatDivider} />

            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>
                {card.pct30}
                <Text style={styles.heroStatUnit}>%</Text>
              </Text>
              <Text style={styles.heroStatLabel}>last 30d</Text>
            </View>
          </View>
        </View>

        {/* ── Card body ── */}
        <View style={styles.cardBody}>
          {/* This week row header */}
          <View style={styles.weekRowHeader}>
            <Text style={styles.weekRowLabel}>This week</Text>
            <View style={styles.tapToFix}>
              <Pencil size={11} strokeWidth={2} color={BRAND.colors.inkMuted} />
              <Text style={styles.tapToFixText}>tap to fix</Text>
            </View>
          </View>

          {/* Day row — all 7 cells tappable (rolling window, no future) */}
          <View style={styles.dayRow}>
            {card.days.map((day) => (
              <TouchableOpacity
                key={day.date}
                style={[
                  styles.dayCell,
                  day.isCompleted && styles.dayCellCompleted,
                  day.isToday && !day.isCompleted && styles.dayCellToday,
                  day.isToday && day.isCompleted && styles.dayCellTodayCompleted,
                  !day.isCompleted && !day.isToday && styles.dayCellMissed,
                ]}
                onPress={() => handleToggleDay(day.date, day.isCompleted)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityLabel={`${day.dayLabel} ${day.date}${day.isCompleted ? ' completed' : ''}`}
                accessibilityState={{ checked: day.isCompleted }}
              >
                <Text
                  style={[
                    styles.dayCellLabel,
                    day.isCompleted && styles.dayCellLabelCompleted,
                    day.isToday && !day.isCompleted && styles.dayCellLabelToday,
                  ]}
                >
                  {day.dayLabel}
                </Text>
                <View style={styles.dayCellIndicator}>
                  {day.isCompleted ? (
                    <Check size={12} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                  ) : (
                    <Circle size={12} strokeWidth={1.5} color="rgba(34,34,34,0.20)" />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.tapHint}>Did one you forgot to mark? Tap to add it.</Text>

          {/* Frequency recommendation (conditional — hides once change applied) */}
          {rec?.show && !appliedChange && (
            <View style={styles.recBlock}>
              <Text style={styles.recSentence}>{rec.sentence}</Text>
              <View style={styles.recChipRow}>
                {rec.chips.map((n) => {
                  const label = getFrequencyDisplayLabel(rec.cadence, n) ?? `${n}x`;
                  const isActive = n === rec.currentTarget;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.recChip, isActive && styles.recChipActive]}
                      onPress={() => !isActive && handleChipPress(n)}
                      activeOpacity={isActive ? 1 : 0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Set frequency to ${label}`}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text style={[styles.recChipText, isActive && styles.recChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.recCaption}>Selecting a chip updates this habit.</Text>
            </View>
          )}

          {/* Applied change banner — persistent for the session */}
          {appliedChange && (
            <View style={styles.appliedBanner}>
              <Check size={13} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
              <Text style={styles.appliedBannerText}>
                Frequency updated to {appliedChange.label}
              </Text>
            </View>
          )}
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

      {/* Finish early */}
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
    paddingTop: 28,
    paddingBottom: 16,
  },

  // Progress dots
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
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

  // ── Card shell ─────────────────────────────────────────────────────────────
  card: {
    borderRadius: BRAND.radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },

  // ── Hero header ────────────────────────────────────────────────────────────
  heroHeader: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  cadencePill: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 10,
  },
  cadencePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.2,
  },
  heroName: {
    fontSize: 22,
    fontFamily: SERIF,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 28,
    marginBottom: 16,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  heroStatNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  heroStatDenom: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.70)',
  },
  heroStatUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.75)',
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
    textAlign: 'center',
  },
  heroStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.20)',
    marginHorizontal: 4,
  },

  // ── Card body ──────────────────────────────────────────────────────────────
  cardBody: {
    backgroundColor: BRAND.colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },

  // This-week header row
  weekRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 0.2,
  },
  tapToFix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tapToFixText: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },

  // Day cells
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 8,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(34,34,34,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.06)',
    gap: 4,
  },
  dayCellCompleted: {
    backgroundColor: 'rgba(191,216,192,0.35)',
    borderColor: 'rgba(46,85,64,0.30)',
  },
  dayCellToday: {
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 1.5,
    backgroundColor: 'rgba(191,216,192,0.12)',
  },
  dayCellTodayCompleted: {
    backgroundColor: 'rgba(191,216,192,0.35)',
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 1.5,
  },
  dayCellMissed: {
    borderStyle: 'dashed',
    borderColor: 'rgba(34,34,34,0.12)',
    backgroundColor: 'transparent',
  },
  dayCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(34,34,34,0.55)',
    letterSpacing: 0.3,
  },
  dayCellLabelCompleted: { color: BRAND.colors.mossGreen },
  dayCellLabelToday: { color: BRAND.colors.mossGreen, fontWeight: '700' },
  dayCellIndicator: { height: 16, alignItems: 'center', justifyContent: 'center' },

  tapHint: {
    fontSize: 11,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginBottom: 2,
  },

  // Frequency recommendation block
  recBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.07)',
  },
  recSentence: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(34,34,34,0.65)',
    lineHeight: 18,
    marginBottom: 10,
  },
  recChipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  recChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.18)',
    backgroundColor: 'rgba(34,34,34,0.04)',
  },
  recChipActive: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: BRAND.colors.sageMist,
  },
  recChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  recChipTextActive: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  recCaption: {
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(34,34,34,0.40)',
  },

  // Persistent applied-change banner
  appliedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.07)',
  },
  appliedBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },

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

  // Finish early
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
