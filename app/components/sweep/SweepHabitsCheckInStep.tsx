/**
 * SweepHabitsCheckInStep -- "Check in on habits" spoke (v7-1/v7-2).
 *
 * Per-habit card deck. Rolling 7-day window ending today for all cadences.
 * Hero header with 3 stats (7d, streak, 30d%). Tap-to-fix day row.
 * Persistent frequency-change banner per habit (session state).
 * No AI, no gauge side-effects.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  Modal,
  Pressable,
  Alert,
  Animated,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Flame,
  ChevronLeft,
  ChevronRight,
  Check,
  Circle,
  Pencil,
  Pause,
  TrendingDown,
  Shield,
  Calendar,
  ChevronUp,
  Sparkles,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useHabitCardStats } from '../../../lib/habits/habitCardStats';
import type { HabitCardStats } from '../../../lib/habits/habitCardStats';
import { getDateService } from '../../../lib/date/DateService';
import {
  computeFrequencyRecommendation,
  getFrequencyDisplayLabel,
} from '../../../lib/habits/habitFrequencyRecommendation';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

// Dot size for the trend row
const DOT_SIZE = 10;

/** Format YYYY-MM-DD → short display like "Jun 8" */
function formatDateDisplay(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
}

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
  const setHabitAdaptation = useGremlyStore((s) => s.setHabitAdaptation);
  const clearHabitAdaptation = useGremlyStore((s) => s.clearHabitAdaptation);
  const habitAdaptations = useGremlyStore((s) => s.habitAdaptations);
  const getOrFetchHabitInsight = useGremlyStore((s) => s.getOrFetchHabitInsight);

  const cards = useHabitCardStats(habits);

  const [index, setIndex] = useState(0);
  // Session-persistent frequency-change confirmations keyed by habitId
  const [appliedChanges, setAppliedChanges] = useState<Record<string, AppliedChange>>({});

  // ── Habit insight state ────────────────────────────────────────────────────
  type InsightState = { loading: boolean; show: boolean; line: string | null; kind: string | null };
  const [insightStates, setInsightStates] = useState<Record<string, InsightState>>({});
  // Per-habitId Animated.Value for fade-in (created lazily on show:true result)
  const insightFade = useRef<Record<string, Animated.Value>>({});

  // ── Adaptation form state ────────────────────────────────────────────────
  type AdaptMode = 'keep' | 'floor' | 'pause';
  type DatePickerTarget = 'start' | 'end' | null;
  const [adaptExpanded, setAdaptExpanded] = useState(false);
  const [adaptMode, setAdaptMode] = useState<AdaptMode>('keep');
  const [adaptStart, setAdaptStart] = useState<string>(() => getDateService().today());
  const [adaptEnd, setAdaptEnd] = useState<string>(() =>
    getDateService().addDays(getDateService().today(), 6),
  );
  const [adaptFloorNote, setAdaptFloorNote] = useState('');
  const [adaptOverlapError, setAdaptOverlapError] = useState(false);
  const [adaptSaving, setAdaptSaving] = useState(false);
  // Session-persistent adaptation confirmations keyed by habitId
  const [adaptConfirmations, setAdaptConfirmations] = useState<Record<string, string>>({});
  // Date picker
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [datePickerTempDate, setDatePickerTempDate] = useState<Date>(() => getDateService().now());

  // Fetch insight for the currently visible card (lazy, one call per habit per week)
  useEffect(() => {
    const currentHabitId = habits[index]?.id;
    if (!currentHabitId) return;
    // Skip if already loaded or loading
    const existing = insightStates[currentHabitId];
    if (existing) return;
    // Mark as loading
    setInsightStates((prev) => ({
      ...prev,
      [currentHabitId]: { loading: true, show: false, line: null, kind: null },
    }));
    getOrFetchHabitInsight(currentHabitId)
      .then((result) => {
        if (result.show && result.line) {
          if (!insightFade.current[currentHabitId]) {
            insightFade.current[currentHabitId] = new Animated.Value(0);
          } else {
            insightFade.current[currentHabitId].setValue(0);
          }
          Animated.timing(insightFade.current[currentHabitId], {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }).start();
        }
        setInsightStates((prev) => ({
          ...prev,
          [currentHabitId]: {
            loading: false,
            show: result.show,
            line: result.line,
            kind: result.kind,
          },
        }));
      })
      .catch(() => {
        setInsightStates((prev) => ({
          ...prev,
          [currentHabitId]: { loading: false, show: false, line: null, kind: null },
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // When the card changes, reset adaptation form and pre-fill from habit
  const resetAdaptForm = useCallback(
    (idx: number) => {
      const h = habits[idx];
      const ds = getDateService();
      setAdaptExpanded(false);
      setAdaptMode('keep');
      setAdaptStart(ds.today());
      setAdaptEnd(ds.addDays(ds.today(), 6));
      setAdaptFloorNote(h?.floor_note ?? '');
      setAdaptOverlapError(false);
      // leave adaptConfirmations intact — persists for the session
    },
    [habits],
  );

  const openDatePicker = useCallback(
    (target: 'start' | 'end') => {
      const ds = getDateService();
      const currentIso = target === 'start' ? adaptStart : adaptEnd;
      const date = (currentIso ? ds.fromLocalDate(currentIso) : null) ?? ds.now();
      setDatePickerTempDate(date);
      setDatePickerTarget(target);
    },
    [adaptStart, adaptEnd],
  );

  const handleDatePickerConfirm = useCallback(() => {
    const ds = getDateService();
    const iso = ds.toLocalDate(datePickerTempDate);
    if (datePickerTarget === 'start') {
      setAdaptStart(iso);
      // Bump end if it would fall before the new start
      if (adaptEnd < iso) setAdaptEnd(iso);
    } else if (datePickerTarget === 'end') {
      setAdaptEnd(iso);
    }
    setDatePickerTarget(null);
  }, [datePickerTempDate, datePickerTarget, adaptEnd]);

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
        // Check if the tapped date falls inside an active floor adaptation window.
        // Only mode==='floor' sets wasFloor=true; pause/keep/none → false.
        const d = date.slice(0, 10);
        const covering = habitAdaptations.find(
          (a) =>
            a.habit_id === card.id &&
            a.mode === 'floor' &&
            a.period_start <= d &&
            a.period_end >= d,
        );
        await logHabitCompletionForDate(card.id, date, !!covering);
      }
    },
    [card, habitAdaptations, logHabitCompletionForDate, removeHabitCompletionForDate],
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
    const next = Math.max(0, index - 1);
    setIndex(next);
    resetAdaptForm(next);
  }, [index, resetAdaptForm]);

  const handleNext = useCallback(() => {
    if (index < cards.length - 1) {
      const next = index + 1;
      setIndex(next);
      resetAdaptForm(next);
    } else {
      onFinish();
    }
  }, [index, cards.length, onFinish, resetAdaptForm]);

  // ── Today's ISO date ─────────────────────────────────────────────────────
  const today = getDateService().today();

  // ── All current/future adaptations for this habit (sorted by period_start) ─
  const adaptationsForCard = useMemo(
    () =>
      card
        ? habitAdaptations
            .filter((a) => a.habit_id === card.id && a.period_end >= today)
            .sort((a, b) => a.period_start.localeCompare(b.period_start))
        : [],
    [card, habitAdaptations, today],
  );

  // ── Save adaptation handler ──────────────────────────────────────────────
  const handleSaveAdaptation = useCallback(async () => {
    if (!card || adaptMode === 'keep') return;
    if (!adaptStart || !adaptEnd || adaptStart > adaptEnd) return; // guarded by date picker
    setAdaptSaving(true);
    setAdaptOverlapError(false);
    const result = await setHabitAdaptation(card.id, {
      mode: adaptMode,
      period_start: adaptStart,
      period_end: adaptEnd,
      floor_note: adaptMode === 'floor' ? adaptFloorNote || null : null,
    });
    setAdaptSaving(false);
    if (!result.ok) {
      if (result.reason === 'overlap') {
        setAdaptOverlapError(true);
      } else {
        Alert.alert('Error', 'Could not save adaptation. Please try again.');
      }
      return;
    }
    // Success: persist confirmation banner, collapse, reset defaults
    const savedMode = adaptMode;
    const savedStart = adaptStart;
    const savedEnd = adaptEnd;
    const confirmLabel =
      savedMode === 'pause'
        ? `Paused ${formatDateDisplay(savedStart)}–${formatDateDisplay(savedEnd)}`
        : `Floor mode ${formatDateDisplay(savedStart)}–${formatDateDisplay(savedEnd)}`;
    setAdaptConfirmations((prev) => ({ ...prev, [card.id]: confirmLabel }));
    const ds = getDateService();
    setAdaptExpanded(false);
    setAdaptMode('keep');
    setAdaptStart(ds.today());
    setAdaptEnd(ds.addDays(ds.today(), 6));
    setAdaptFloorNote(currentHabit?.floor_note ?? '');
  }, [card, adaptMode, adaptStart, adaptEnd, adaptFloorNote, setHabitAdaptation, currentHabit]);

  // ── Clear a specific adaptation by id ────────────────────────────────────
  const handleClearAdaptation = useCallback(
    async (id: string) => {
      try {
        await clearHabitAdaptation(id);
      } catch {
        Alert.alert('Error', 'Could not remove adaptation. Please try again.');
      }
    },
    [clearHabitAdaptation],
  );

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
  const adaptConfirmation = adaptConfirmations[card.id];

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressRow}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.progressDot, i === index && styles.progressDotActive]} />
        ))}
      </View>

      {/* Card — scrollable so insight / adaptation sections are always reachable */}
      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces
      >
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
              <View>
                <Text style={styles.weekRowLabel}>This week</Text>
                <Text style={styles.weekRowSub}>past 7 days</Text>
              </View>
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

            {/* ── Habit Adaptation Block (v7-3a) ── */}
            <View style={styles.adaptBlock}>
              {/* Adaptation pills — always visible, one per non-expired adaptation */}
              {adaptationsForCard.map((a) => (
                <View key={a.id} style={styles.activeAdaptRow}>
                  <View style={styles.activeAdaptContent}>
                    {a.mode === 'pause' ? (
                      <Pause size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                    ) : (
                      <TrendingDown size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                    )}
                    <Text style={styles.activeAdaptText}>
                      {a.mode === 'pause'
                        ? `Paused ${formatDateDisplay(a.period_start)}–${formatDateDisplay(a.period_end)}`
                        : `Floor ${formatDateDisplay(a.period_start)}–${formatDateDisplay(a.period_end)}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleClearAdaptation(a.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove adaptation"
                  >
                    <Text style={styles.activeAdaptRemove}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add prompt (collapsed) or form (expanded) — always present */}
              {!adaptExpanded ? (
                /* Quiet prompt row — always shown so user can always add
                 TODO: AI seam (v7-3b) — AI will promote this into a travel/break nudge */
                <TouchableOpacity
                  style={styles.adaptPromptRow}
                  onPress={() => setAdaptExpanded(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    adaptationsForCard.length > 0
                      ? 'Add another adaptation'
                      : 'Adapt this habit for travel or a break'
                  }
                >
                  <Calendar size={13} strokeWidth={1.8} color={BRAND.colors.inkMuted} />
                  <Text style={styles.adaptPromptText}>
                    {adaptationsForCard.length > 0 ? 'Add another' : 'Adapt for travel or a break'}
                  </Text>
                </TouchableOpacity>
              ) : (
                /* Expanded form */
                <View>
                  {/* Header with collapse button */}
                  <View style={styles.adaptExpandedHeader}>
                    <Text style={styles.adaptLabel}>Adapt this habit</Text>
                    <TouchableOpacity
                      onPress={() => setAdaptExpanded(false)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Collapse"
                    >
                      <ChevronUp size={16} strokeWidth={2} color={BRAND.colors.inkMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Mode selector */}
                  <View style={styles.adaptModeRow}>
                    {(['keep', 'floor', 'pause'] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.adaptModeBtn, adaptMode === m && styles.adaptModeBtnActive]}
                        onPress={() => setAdaptMode(m)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityState={{ selected: adaptMode === m }}
                        accessibilityLabel={m}
                      >
                        {m === 'keep' && (
                          <Shield
                            size={13}
                            strokeWidth={2}
                            color={adaptMode === m ? BRAND.colors.mossGreen : BRAND.colors.inkMuted}
                          />
                        )}
                        {m === 'floor' && (
                          <TrendingDown
                            size={13}
                            strokeWidth={2}
                            color={adaptMode === m ? BRAND.colors.mossGreen : BRAND.colors.inkMuted}
                          />
                        )}
                        {m === 'pause' && (
                          <Pause
                            size={13}
                            strokeWidth={2}
                            color={adaptMode === m ? BRAND.colors.mossGreen : BRAND.colors.inkMuted}
                          />
                        )}
                        <Text
                          style={[
                            styles.adaptModeBtnText,
                            adaptMode === m && styles.adaptModeBtnTextActive,
                          ]}
                        >
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Date range + floor note (only when floor or pause selected) */}
                  {adaptMode !== 'keep' && (
                    <View style={styles.adaptFields}>
                      <View style={styles.adaptDateRow}>
                        <TouchableOpacity
                          style={[
                            styles.adaptDateBtn,
                            datePickerTarget === 'start' && styles.adaptDateBtnActive,
                          ]}
                          onPress={() => openDatePicker('start')}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel={`Start date: ${formatDateDisplay(adaptStart)}`}
                        >
                          <Calendar size={11} strokeWidth={2} color={BRAND.colors.inkMuted} />
                          <Text style={styles.adaptDateBtnText}>
                            {formatDateDisplay(adaptStart)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.adaptDateBtn,
                            datePickerTarget === 'end' && styles.adaptDateBtnActive,
                          ]}
                          onPress={() => openDatePicker('end')}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel={`End date: ${formatDateDisplay(adaptEnd)}`}
                        >
                          <Calendar size={11} strokeWidth={2} color={BRAND.colors.inkMuted} />
                          <Text style={styles.adaptDateBtnText}>{formatDateDisplay(adaptEnd)}</Text>
                        </TouchableOpacity>
                      </View>

                      {adaptMode === 'floor' && (
                        <TextInput
                          style={styles.adaptFloorNoteInput}
                          placeholder="Floor note (optional)"
                          placeholderTextColor={BRAND.colors.inkMuted}
                          value={adaptFloorNote}
                          onChangeText={setAdaptFloorNote}
                          maxLength={200}
                          multiline={false}
                          accessibilityLabel="Floor note"
                        />
                      )}

                      {/* TODO: AI floor-note suggestion seam (v7-3b) */}

                      {adaptOverlapError && (
                        <Text style={styles.adaptErrorText}>
                          This period overlaps an existing adaptation. Remove the existing one
                          first.
                        </Text>
                      )}

                      <TouchableOpacity
                        style={[styles.adaptSaveBtn, adaptSaving && styles.adaptSaveBtnDisabled]}
                        onPress={handleSaveAdaptation}
                        disabled={adaptSaving}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Save adaptation"
                      >
                        <Text style={styles.adaptSaveBtnText}>
                          {adaptSaving ? 'Saving...' : 'Save adaptation'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
            {card.trend.read !== null &&
              (() => {
                const onTarget = card.trend.bars.filter((b) => b.hits >= b.target).length;
                const total = card.trend.bars.length;
                return (
                  <View style={styles.trendBlock}>
                    <View style={styles.trendHeader}>
                      <View>
                        <Text style={styles.trendHeaderLabel}>Recent weeks</Text>
                        <Text style={styles.weekRowSub}>week by week</Text>
                      </View>
                      <Text
                        style={[
                          styles.trendReadLabel,
                          card.trend.read === 'building' && styles.trendReadBuilding,
                        ]}
                      >
                        {card.trend.read}
                      </Text>
                    </View>
                    <View style={styles.trendDotsRow}>
                      {card.trend.bars.map((bar) => {
                        const hit = bar.hits >= bar.target;
                        return (
                          <View
                            key={bar.weekLabel}
                            style={[
                              styles.trendDot,
                              hit ? styles.trendDotHit : styles.trendDotMiss,
                              bar.isCurrent && styles.trendDotCurrent,
                            ]}
                            accessibilityLabel={`${bar.weekLabel}: ${bar.hits} of ${bar.target}${hit ? ' hit target' : ' missed target'}`}
                          />
                        );
                      })}
                    </View>
                    <Text style={styles.trendCaption}>
                      {onTarget} of last {total} weeks on target
                    </Text>
                  </View>
                );
              })()}

            {/* AI insight slot */}
            {(() => {
              const habitId = card?.id;
              const insight = habitId ? insightStates[habitId] : undefined;
              // Nothing if gated out (habit has no history — call was skipped)
              if (!insight) return null;
              // Shimmer while call is in flight
              if (insight.loading) {
                return <View style={styles.insightShimmer} />;
              }
              // Gated-out: show:false with no line means no history
              if (!insight.show || !insight.line) return null;
              const isAttention = insight.kind === 'drifting' || insight.kind === 'target_mismatch';
              const fadeAnim = habitId ? insightFade.current[habitId] : undefined;
              const tileStyle = isAttention
                ? styles.insightIconTileWarn
                : styles.insightIconTileCalm;
              const InsightIcon = isAttention ? TrendingDown : Sparkles;
              const textStyle = isAttention
                ? styles.insightLineTextWarn
                : styles.insightLineTextCalm;
              const inner = (
                <>
                  <View style={tileStyle}>
                    <InsightIcon size={15} strokeWidth={1.8} color="#FFFFFF" />
                  </View>
                  <Text style={textStyle} numberOfLines={3}>
                    {insight.line}
                  </Text>
                </>
              );
              if (isAttention) {
                return (
                  <Animated.View style={{ opacity: fadeAnim ?? 1 }}>
                    <LinearGradient
                      colors={['rgba(227,178,60,0.10)', 'rgba(240,220,160,0.12)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.insightBlock}
                    >
                      {inner}
                    </LinearGradient>
                  </Animated.View>
                );
              }
              return (
                <Animated.View style={{ opacity: fadeAnim ?? 1 }}>
                  <View style={[styles.insightBlock, styles.insightBlockCalm]}>{inner}</View>
                </Animated.View>
              );
            })()}

            {/* Frequency recommendation (conditional -- hides once change applied) */}
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

            {/* Adaptation saved banner — persistent for the session */}
            {adaptConfirmation && (
              <View style={styles.appliedBanner}>
                <Check size={13} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                <Text style={styles.appliedBannerText}>{adaptConfirmation}</Text>
              </View>
            )}

            {/* Applied frequency-change banner — persistent for the session */}
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
      </ScrollView>

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

      {/* Date picker — Android: native dialog (no modal needed) */}
      {datePickerTarget !== null && Platform.OS === 'android' && (
        <DateTimePicker
          value={datePickerTempDate}
          mode="date"
          display="default"
          minimumDate={
            // Allow past start dates (logging after the fact).
            // Only constrain End >= Start.
            datePickerTarget === 'end'
              ? (getDateService().fromLocalDate(adaptStart) ?? undefined)
              : undefined
          }
          onChange={(e: any, date?: Date) => {
            const captured = datePickerTarget;
            setDatePickerTarget(null);
            if (e.type === 'set' && date) {
              const iso = getDateService().toLocalDate(date);
              if (captured === 'start') {
                setAdaptStart(iso);
                if (adaptEnd < iso) setAdaptEnd(iso);
              } else {
                setAdaptEnd(iso);
              }
            }
          }}
        />
      )}

      {/* Date picker — iOS: bottom sheet with inline calendar grid */}
      {datePickerTarget !== null && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="slide">
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
            onPress={() => setDatePickerTarget(null)}
          />
          <View style={styles.datePickerSheet}>
            <View style={styles.datePickerSheetHeader}>
              <TouchableOpacity onPress={() => setDatePickerTarget(null)}>
                <Text style={styles.datePickerSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.datePickerSheetTitle}>
                {datePickerTarget === 'start' ? 'Start date' : 'End date'}
              </Text>
              <TouchableOpacity onPress={handleDatePickerConfirm}>
                <Text style={styles.datePickerSheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={datePickerTempDate}
              mode="date"
              display="inline"
              themeVariant="light"
              accentColor={BRAND.colors.mossGreen}
              minimumDate={
                // Allow past start dates (logging after the fact).
                // Only constrain End >= Start.
                datePickerTarget === 'end'
                  ? (getDateService().fromLocalDate(adaptStart) ?? undefined)
                  : undefined
              }
              onChange={(_: any, date?: Date) => {
                if (date) setDatePickerTempDate(date);
              }}
            />
          </View>
        </Modal>
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
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
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
  weekRowSub: {
    fontSize: 10,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginTop: 1,
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

  // Adaptation block
  adaptBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.07)',
    marginBottom: 4,
  },
  adaptExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  adaptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 0.2,
  },
  adaptPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
  },
  adaptPromptText: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
  },
  activeAdaptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(191,216,192,0.20)',
    borderRadius: BRAND.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  activeAdaptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  activeAdaptText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  activeAdaptRemove: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    marginLeft: 8,
  },
  adaptModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  adaptModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.12)',
    backgroundColor: 'rgba(34,34,34,0.03)',
  },
  adaptModeBtnActive: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: 'rgba(191,216,192,0.22)',
  },
  adaptModeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  adaptModeBtnTextActive: {
    color: BRAND.colors.mossGreen,
  },
  adaptFields: {
    gap: 8,
  },
  adaptDateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  adaptDateBtn: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.14)',
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.surface,
  },
  adaptDateBtnActive: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: 'rgba(191,216,192,0.12)',
  },
  adaptDateBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  adaptFloorNoteInput: {
    height: 38,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.14)',
    borderRadius: BRAND.radius.md,
    paddingHorizontal: 10,
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
    backgroundColor: BRAND.colors.surface,
  },
  adaptErrorText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#C0392B',
    lineHeight: 16,
  },
  adaptSaveBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.mossGreen,
  },
  adaptSaveBtnDisabled: {
    opacity: 0.55,
  },
  adaptSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Date picker bottom sheet
  datePickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    minHeight: 440,
  },
  datePickerSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,34,34,0.08)',
  },
  datePickerSheetCancel: {
    fontSize: 16,
    color: BRAND.colors.inkMuted,
  },
  datePickerSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  datePickerSheetDone: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // Trend block
  trendBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.07)',
    marginBottom: 4,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trendHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 0.2,
  },
  trendReadLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  trendReadBuilding: { color: BRAND.colors.mossGreen },
  // drifting intentionally uses default inkMuted (no alarm colour)
  trendDotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  trendDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  trendDotHit: {
    backgroundColor: BRAND.colors.sageMist,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.35)',
  },
  trendDotMiss: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(34,34,34,0.22)',
  },
  trendDotCurrent: {
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
  },
  trendCaption: {
    fontSize: 11,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
  },

  // Habit insight slot
  insightShimmer: {
    height: 44,
    marginTop: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(34,34,34,0.05)',
  },
  insightBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 15,
  },
  insightBlockCalm: {
    backgroundColor: 'rgba(191,216,192,0.10)',
  },
  insightIconTileWarn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: BRAND.colors.goldenPear,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightIconTileCalm: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightLineTextCalm: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    lineHeight: 20,
  },
  insightLineTextWarn: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '400',
    color: BRAND.colors.inkSubtle,
    lineHeight: 20,
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
