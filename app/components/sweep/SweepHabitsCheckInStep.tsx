/**
 * SweepHabitsCheckInStep -- "Check in on habits" spoke (v7-1/v7-2).
 *
 * Per-habit card deck. Rolling 7-day window ending today for all cadences.
 * Hero header with 3 stats (7d, streak, 30d%). Tap-to-fix day row.
 * Persistent frequency-change banner per habit (session state).
 * No AI, no gauge side-effects.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Flame,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  CheckSquare,
  Circle,
  Pencil,
  Pause,
  TrendingDown,
  Shield,
  Calendar,
  ChevronUp,
  Sparkles,
  ArrowDown,
  X,
} from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useHabitCardStats } from '../../../lib/habits/habitCardStats';
import type { HabitCardStats } from '../../../lib/habits/habitCardStats';
import { getDateService } from '../../../lib/date/DateService';
import MascotLottie from '../MascotLottie';
import { SweepHabitCardC } from './SweepHabitCardC';
import {
  computeFrequencyRecommendation,
  getFrequencyDisplayLabel,
} from '../../../lib/habits/habitFrequencyRecommendation';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
// Habit-read preview (Phase 3c): dev builds only. Floor suggestions keep
// running in parallel until Phase 5 cutover.
const HABIT_READS_PREVIEW = __DEV__;
// Card C (Phase 4): full redesigned card behind its own flag so old and new
// can be compared by flipping one constant. Cutover removes both in Phase 5.
const USE_CARD_C = __DEV__;

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

/** Format an ISO date as a short "since" label: "Apr" (this year) or "Apr '25" (prior year). */
function formatSince(iso: string | null): string {
  if (!iso || iso.length < 7) return '--';
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
  const year = parseInt(parts[0], 10);
  const mon = months[parseInt(parts[1], 10) - 1] ?? '';
  const nowYear = parseInt(getDateService().today().slice(0, 4), 10);
  return year === nowYear ? mon : `${mon} '${String(year).slice(2)}`;
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

interface HabitStepIntroProps {
  habitCount: number;
  onContinue: () => void;
  onClose: () => void;
}

function HabitStepIntro({ habitCount, onContinue, onClose }: HabitStepIntroProps) {
  return (
    <View style={styles.habitIntroWrap}>
      <TouchableOpacity
        style={styles.habitIntroCloseBtn}
        onPress={onClose}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Close habits check-in"
      >
        <X size={17} strokeWidth={2} color={BRAND.colors.inkMuted} />
      </TouchableOpacity>

      <Pressable style={styles.habitIntroPressable} onPress={onContinue}>
        <View style={styles.habitIntroCenter}>
          <View style={styles.habitIntroTitleRow}>
            <Flame size={17} strokeWidth={2.2} color={BRAND.colors.mossGreen} />
            <Text style={styles.habitIntroTitle}>YOUR HABITS</Text>
          </View>

          <Text style={styles.habitIntroSubtitle}>a look back at how each one is going</Text>
          <Text style={styles.habitIntroHint}>one card per habit</Text>

          <View style={styles.habitIntroRows}>
            <View style={styles.habitIntroRow}>
              <View style={styles.habitIntroChip}>
                <Calendar size={14} strokeWidth={2} color={BRAND.colors.mossGreen} />
              </View>
              <Text style={styles.habitIntroRowText}>
                <Text style={styles.habitIntroRowLead}>See your rhythm</Text>
                {' over the past 7 days, plus streak and stats'}
              </Text>
            </View>

            <View style={styles.habitIntroRow}>
              <View style={styles.habitIntroChip}>
                <CheckSquare size={14} strokeWidth={2} color={BRAND.colors.mossGreen} />
              </View>
              <Text style={styles.habitIntroRowText}>
                <Text style={styles.habitIntroRowLead}>Tap any day</Text>
                {' to fix one you forgot to mark'}
              </Text>
            </View>

            <View style={styles.habitIntroRow}>
              <View style={styles.habitIntroChip}>
                <Calendar size={14} strokeWidth={2} color={BRAND.colors.mossGreen} />
              </View>
              <Text style={styles.habitIntroRowText}>
                <Text style={styles.habitIntroRowLead}>Plan the week ahead</Text>
                {' and adjust how often if the pace is off'}
              </Text>
            </View>
          </View>

          <View style={styles.habitIntroFooter}>
            <MascotLottie />
            <Text style={styles.habitIntroTap}>tap to start</Text>
            <Text style={styles.habitIntroCount}>{habitCount} habits this week</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export function SweepHabitsCheckInStep({ onFinish }: SweepHabitsCheckInStepProps) {
  const allHabits = useGremlyStore((s) => s.habits);
  const habits = useMemo(() => allHabits.filter((h) => !h.archived), [allHabits]);
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const setHabitTarget = useGremlyStore((s) => s.setHabitTarget);
  const setHabitAdaptation = useGremlyStore((s) => s.setHabitAdaptation);
  const updateHabitAdaptation = useGremlyStore((s) => s.updateHabitAdaptation);
  const clearHabitAdaptation = useGremlyStore((s) => s.clearHabitAdaptation);
  const habitAdaptations = useGremlyStore((s) => s.habitAdaptations);
  const setHabitPlan = useGremlyStore((s) => s.setHabitPlan);
  const removeHabitPlan = useGremlyStore((s) => s.removeHabitPlan);
  const habitPlans = useGremlyStore((s) => s.habitPlans);
  const ensureFloorSuggestions = useGremlyStore((s) => s.ensureFloorSuggestions);
  const getFloorSuggestion = useGremlyStore((s) => s.getFloorSuggestion);
  const ensureHabitReads = useGremlyStore((s) => s.ensureHabitReads);
  const { weekStart: blockWeekStart } = useGremlyStore(useShallow((s) => s.resolveSweepBlock()));
  // Reactive subscription (NOT the getHabitRead getter): cards must re-render
  // when the batched read call hydrates state mid-session.
  const habitReads = useGremlyStore((s) => s.habitReads);
  const habitReadsRunning = useGremlyStore((s) => s.habitReadsRunning);
  const dismissHabitRead = useGremlyStore((s) => s.dismissHabitRead);

  const cards = useHabitCardStats(habits);

  const [index, setIndex] = useState(0);
  const [showHabitIntro, setShowHabitIntro] = useState(true);
  // Session-persistent frequency-change confirmations keyed by habitId
  const [appliedChanges, setAppliedChanges] = useState<Record<string, AppliedChange>>({});

  // ── Adaptation form state ────────────────────────────────────────────────
  type AdaptMode = 'keep' | 'floor' | 'pause';
  type DatePickerTarget = 'start' | 'end' | 'planStart' | null;
  const [adaptExpanded, setAdaptExpanded] = useState(false);
  const [adaptMode, setAdaptMode] = useState<AdaptMode>('keep');
  const [adaptStart, setAdaptStart] = useState<string>(() => getDateService().today());
  const [adaptEnd, setAdaptEnd] = useState<string>(() =>
    getDateService().addDays(getDateService().today(), 6),
  );
  const [adaptFloorNote, setAdaptFloorNote] = useState('');
  const [adaptSourceRef, setAdaptSourceRef] = useState<string | null>(null);
  const [editingAdaptationId, setEditingAdaptationId] = useState<string | null>(null);
  const [adaptOverlapError, setAdaptOverlapError] = useState(false);
  const [adaptSaving, setAdaptSaving] = useState(false);
  // Session-persistent adaptation confirmations keyed by habitId
  const [adaptConfirmations, setAdaptConfirmations] = useState<Record<string, string>>({});
  // ── Plan state ───────────────────────────────────────────────────────────
  const [planStart, setPlanStart] = useState<string>(getDateService().today());
  // ── Floor suggestion state ──────────────────────────────────────────────
  const [floorReady, setFloorReady] = useState(false);
  const [dismissedFloors, setDismissedFloors] = useState<Set<string>>(new Set());
  const hasNonDailyBuild = habits.some(
    (h) => !h.archived && h.cadence !== 'daily' && h.subtype !== 'break_habit',
  );

  useEffect(() => {
    let cancelled = false;
    const weekStart = blockWeekStart;
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setFloorReady(true);
    }, 6000);
    (async () => {
      try {
        await ensureFloorSuggestions(habits, weekStart);
      } catch (_) {
        // errors handled inside ensureFloorSuggestions
      } finally {
        clearTimeout(safetyTimer);
        if (!cancelled) setFloorReady(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Phase 3c: one batched habit-read call per sweep open. Fire-and-forget;
  // never gates rendering and never touches the floorReady flow.
  useEffect(() => {
    if (!HABIT_READS_PREVIEW) return;
    ensureHabitReads(habits, cards, blockWeekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [planStartMenuOpen, setPlanStartMenuOpen] = useState(false);
  // Date picker
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [datePickerTempDate, setDatePickerTempDate] = useState<Date>(() => getDateService().now());

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
      setAdaptSourceRef(null);
      setEditingAdaptationId(null);
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
    } else if (datePickerTarget === 'planStart') {
      setPlanStart(iso);
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
      await setHabitTarget(card.id, rec.cadence, n);
      setAppliedChanges((prev) => ({
        ...prev,
        [card.id]: { from: rec.currentTarget, to: n, label },
      }));
    },
    [card, rec, setHabitTarget],
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
    const patch = {
      mode: adaptMode,
      period_start: adaptStart,
      period_end: adaptEnd,
      floor_note: adaptMode === 'floor' ? adaptFloorNote || null : null,
      source_ref: adaptSourceRef,
    };
    const result = editingAdaptationId
      ? await updateHabitAdaptation(editingAdaptationId, patch)
      : await setHabitAdaptation(card.id, patch);
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
    setAdaptMode('keep');
    setAdaptStart(ds.today());
    setAdaptEnd(ds.addDays(ds.today(), 6));
    setAdaptFloorNote(currentHabit?.floor_note ?? '');
    setAdaptSourceRef(null);
    setEditingAdaptationId(null);
  }, [
    card,
    adaptMode,
    adaptStart,
    adaptEnd,
    adaptFloorNote,
    adaptSourceRef,
    editingAdaptationId,
    updateHabitAdaptation,
    setHabitAdaptation,
    currentHabit,
  ]);

  const handleSelectIdea = useCallback(
    (idea: string, start: string, end: string, ref: string) => {
      if (!card) return;
      setAdaptMode('floor');
      setAdaptStart(start);
      setAdaptEnd(end);
      setAdaptFloorNote(idea);
      setAdaptSourceRef(ref);
      setEditingAdaptationId(null);
      setAdaptOverlapError(false);
      setAdaptExpanded(true);
    },
    [card],
  );

  const handleSelectPause = useCallback(
    (start: string, end: string, ref: string) => {
      if (!card) return;
      setAdaptMode('pause');
      setAdaptStart(start);
      setAdaptEnd(end);
      setAdaptFloorNote('');
      setAdaptSourceRef(ref);
      setEditingAdaptationId(null);
      setAdaptOverlapError(false);
      setAdaptExpanded(true);
    },
    [card],
  );

  const handlePressAdapt = useCallback(() => {
    setAdaptSourceRef(null);
    setEditingAdaptationId(null);
    setAdaptExpanded(true);
  }, []);

  const handlePressPlanStart = useCallback(() => {
    setPlanStartMenuOpen(true);
  }, []);

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

  // ── Load screen: show while floor suggestions are running (non-daily build habits only) ──
  if ((!floorReady || habitReadsRunning) && hasNonDailyBuild) {
    return (
      <View style={styles.loadWrap}>
        <MascotLottie />
        <Text style={styles.loadText}>Reading your week...</Text>
      </View>
    );
  }

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

  if (showHabitIntro) {
    return (
      <HabitStepIntro
        habitCount={cards.length}
        onContinue={() => setShowHabitIntro(false)}
        onClose={onFinish}
      />
    );
  }

  const isLast = index === cards.length - 1;
  const appliedChange = appliedChanges[card.id];
  const adaptConfirmation = adaptConfirmations[card.id];
  const datePickerModals = (
    <>
      {/* Date picker — Android: native dialog (no modal needed) */}
      {datePickerTarget !== null && Platform.OS === 'android' && (
        <DateTimePicker
          value={datePickerTempDate}
          mode="date"
          display="default"
          minimumDate={
            datePickerTarget === 'end'
              ? (getDateService().fromLocalDate(adaptStart) ?? undefined)
              : datePickerTarget === 'planStart'
                ? (getDateService().fromLocalDate(getDateService().today()) ?? undefined)
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
              } else if (captured === 'end') {
                setAdaptEnd(iso);
              } else if (captured === 'planStart') {
                setPlanStart(iso);
              }
            }
          }}
        />
      )}

      {/* Date picker — iOS standalone modal (planStart only). Start/end now render in-sheet overlay. */}
      {datePickerTarget === 'planStart' && Platform.OS === 'ios' && (
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
              <Text style={styles.datePickerSheetTitle}>Plan start date</Text>
              <TouchableOpacity onPress={handleDatePickerConfirm}>
                <Text style={styles.datePickerSheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              style={{ marginHorizontal: 8 }}
              value={datePickerTempDate}
              mode="date"
              display="inline"
              themeVariant="light"
              accentColor={BRAND.colors.mossGreen}
              minimumDate={getDateService().fromLocalDate(getDateService().today()) ?? undefined}
              onChange={(_: any, date?: Date) => {
                if (date) setDatePickerTempDate(date);
              }}
            />
          </View>
        </Modal>
      )}
    </>
  );
  const adaptFormModal = (
    <Modal visible={adaptExpanded} transparent animationType="slide">
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
        onPress={() => {
          setAdaptSourceRef(null);
          setEditingAdaptationId(null);
          setAdaptExpanded(false);
        }}
      />
      <View style={styles.adaptFormSheet}>
        <View style={styles.adaptExpandedHeader}>
          <Text style={styles.adaptLabel}>
            {editingAdaptationId ? 'Edit adaptation' : 'Adapt this habit'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setAdaptSourceRef(null);
              setEditingAdaptationId(null);
              setAdaptExpanded(false);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Collapse"
          >
            <ChevronUp size={16} strokeWidth={2} color={BRAND.colors.inkMuted} />
          </TouchableOpacity>
        </View>
        {adaptationsForCard.length > 0 && (
          <View style={styles.adaptSheetActiveSection}>
            <Text style={styles.adaptSheetActiveTitle}>Active this period</Text>
            {adaptationsForCard.map((a) => (
              <View key={a.id} style={styles.activeAdaptRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.75}
                  onPress={() => {
                    setAdaptMode(a.mode);
                    setAdaptStart(a.period_start);
                    setAdaptEnd(a.period_end);
                    setAdaptFloorNote(a.floor_note ?? '');
                    setAdaptSourceRef(a.source_ref ?? null);
                    setEditingAdaptationId(a.id);
                    setAdaptOverlapError(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Edit adaptation"
                >
                  <View style={styles.activeAdaptContent}>
                    {a.mode === 'pause' ? (
                      <Pause size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                    ) : (
                      <TrendingDown size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                    )}
                    <Text style={styles.activeAdaptText}>
                      {a.mode === 'pause' ? 'Paused' : 'Floor'} {formatDateDisplay(a.period_start)}
                      {'–'}
                      {formatDateDisplay(a.period_end)}
                    </Text>
                  </View>
                </TouchableOpacity>
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
          </View>
        )}
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
                style={[styles.adaptModeBtnText, adaptMode === m && styles.adaptModeBtnTextActive]}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
                <Text style={styles.adaptDateBtnText}>{formatDateDisplay(adaptStart)}</Text>
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
            {adaptOverlapError && (
              <Text style={styles.adaptErrorText}>
                This period overlaps an existing adaptation. Remove the existing one first.
              </Text>
            )}
            <TouchableOpacity
              style={[styles.adaptSaveBtn, adaptSaving && styles.adaptSaveBtnDisabled]}
              onPress={handleSaveAdaptation}
              disabled={adaptSaving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={editingAdaptationId ? 'Update adaptation' : 'Save adaptation'}
            >
              <Text style={styles.adaptSaveBtnText}>
                {editingAdaptationId
                  ? adaptSaving
                    ? 'Updating...'
                    : 'Update'
                  : adaptSaving
                    ? 'Saving...'
                    : 'Save adaptation'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={styles.adaptDoneBtn}
          onPress={() => {
            setAdaptSourceRef(null);
            setEditingAdaptationId(null);
            setAdaptExpanded(false);
          }}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.adaptDoneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {datePickerTarget !== null && datePickerTarget !== 'planStart' && Platform.OS === 'ios' && (
        <View style={styles.adaptSheetDatePickerOverlay}>
          <Pressable
            style={styles.adaptSheetDatePickerBackdrop}
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
              style={{ marginHorizontal: 8 }}
              value={datePickerTempDate}
              mode="date"
              display="inline"
              themeVariant="light"
              accentColor={BRAND.colors.mossGreen}
              minimumDate={
                datePickerTarget === 'end'
                  ? (getDateService().fromLocalDate(adaptStart) ?? undefined)
                  : (getDateService().fromLocalDate(getDateService().today()) ?? undefined)
              }
              onChange={(_: any, date?: Date) => {
                if (date) setDatePickerTempDate(date);
              }}
            />
          </View>
        </View>
      )}
    </Modal>
  );

  // ── Card C render path (Phase 4a). Early return: the legacy card below is
  // untouched and renders when USE_CARD_C is false. ──
  if (USE_CARD_C) {
    const ds = getDateService();
    const todayIso = ds.today();
    const nextMondayFrom = (dateStr: string): string => {
      const js = ds.fromLocalDate(dateStr) ?? ds.now();
      const daysUntilMonRaw = (8 - js.getDay()) % 7;
      const daysUntilMon = daysUntilMonRaw === 0 ? 7 : daysUntilMonRaw;
      return ds.addDays(dateStr, daysUntilMon);
    };
    const planStartOptions = [
      { label: 'Today', value: todayIso },
      { label: 'Tomorrow', value: ds.addDays(todayIso, 1) },
      { label: 'Monday', value: nextMondayFrom(todayIso) },
    ] as { label: string; value: string }[];
    const selectedOptionIndex = planStartOptions.findIndex((opt) => opt.value === planStart);
    const formatStartLabel = (dateStr: string): string => {
      if (dateStr === todayIso) return 'Today';
      if (dateStr === ds.addDays(todayIso, 1)) return 'Tomorrow';
      const js = ds.fromLocalDate(dateStr);
      if (!js) return dateStr;
      const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${dows[js.getDay()]} ${dateStr.slice(5)}`;
    };
    return (
      <View style={styles.container}>
        <View style={styles.progressRow}>
          {cards.map((_, i) => (
            <View key={i} style={[styles.progressDot, i === index && styles.progressDotActive]} />
          ))}
        </View>
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces
        >
          <View style={styles.cardCPlanStartAnchor}>
            <SweepHabitCardC
              card={card}
              readEntry={habitReads[`${card.id}:${blockWeekStart}`] ?? null}
              readLoading={habitReadsRunning}
              rec={rec}
              appliedChange={appliedChanges[card.id] ?? null}
              adaptationsForCard={adaptationsForCard}
              planStart={planStart}
              planStartLabel={formatStartLabel(planStart)}
              habitPlans={habitPlans}
              onToggleDay={handleToggleDay}
              onTogglePlanCell={async (date, planned, paused) => {
                if (paused) return;
                if (planned) await removeHabitPlan(card.id, date);
                else await setHabitPlan(card.id, date, planStart);
              }}
              onChipPress={handleChipPress}
              onSelectIdea={handleSelectIdea}
              onSelectPause={handleSelectPause}
              onPressPlanStart={handlePressPlanStart}
              onPressAdapt={handlePressAdapt}
              onDismissRead={() => dismissHabitRead(card.id, blockWeekStart)}
              onRemoveAdaptation={handleClearAdaptation}
            />
            {planStartMenuOpen && (
              <>
                <Pressable
                  style={styles.cardCPlanStartBackdrop}
                  onPress={() => setPlanStartMenuOpen(false)}
                />
                <View style={styles.cardCPlanStartMenu}>
                  {planStartOptions.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={styles.planStartMenuItem}
                      onPress={() => {
                        setPlanStart(opt.value);
                        setPlanStartMenuOpen(false);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                    >
                      <Text style={styles.planStartMenuItemText}>{opt.label}</Text>
                      {idx === selectedOptionIndex && (
                        <Check size={13} strokeWidth={2.5} color={'#1E3D2B'} />
                      )}
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.planStartMenuItem, { borderBottomWidth: 0 }]}
                    onPress={() => {
                      setPlanStartMenuOpen(false);
                      requestAnimationFrame(() => {
                        const jsDate = ds.fromLocalDate(planStart) ?? ds.now();
                        setDatePickerTempDate(jsDate);
                        setDatePickerTarget('planStart');
                      });
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Pick date"
                  >
                    <Text style={styles.planStartMenuItemText}>Pick date...</Text>
                    <Calendar size={13} strokeWidth={1.8} color={BRAND.colors.inkMuted} />
                  </TouchableOpacity>
                </View>
              </>
            )}
            {adaptFormModal}
            {datePickerModals}
          </View>
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
          {!isLast && (
            <TouchableOpacity style={styles.skipBtn} onPress={onFinish} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Finish early</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

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
            {/* Cadence pill — break cards only */}
            {card.isBreak && (
              <View style={styles.cadencePill}>
                <Text style={styles.cadencePillText}>BREAKING HABIT</Text>
              </View>
            )}

            {/* Habit name */}
            <Text style={styles.heroName} numberOfLines={2}>
              {card.name}
            </Text>

            {/* Three stats row: frequency · this-week · streak */}
            <View style={styles.heroStats}>
              {/* Stat 1: frequency */}
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>
                  {getFrequencyDisplayLabel(card.cadence, card.targetPerPeriod) ?? card.cadence}
                </Text>
                <Text style={styles.heroStatLabel}>frequency</Text>
              </View>

              <View style={styles.heroStatDivider} />

              {/* Stat 2: this week */}
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>
                  {card.weekHits}
                  <Text style={styles.heroStatDenom}> / {card.weekTarget}</Text>
                </Text>
                <Text style={styles.heroStatLabel}>
                  {card.isBreak ? 'clear this wk' : 'this week'}
                </Text>
              </View>

              <View style={styles.heroStatDivider} />

              {/* Stat 3: streak */}
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
            </View>
          </View>

          {/* ── Card body ── */}
          <View style={styles.cardBody}>
            {/* Your rhythm zone header — day row + weekly trend grouped */}
            <View style={styles.weekRowHeader}>
              <Text style={styles.weekRowLabel}>
                {card.isBreak ? 'Days clear' : 'Your rhythm'}
                <Text style={styles.rhythmHeadingSub}>{' \u00b7 past 7 days'}</Text>
              </Text>
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
                    !day.isCompleted && day.isPaused && styles.dayCellPaused,
                    !day.isCompleted && !day.isPaused && !day.isToday && styles.dayCellMissed,
                  ]}
                  onPress={() => handleToggleDay(day.date, day.isCompleted)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${day.dayLabel} ${day.date}${day.isCompleted ? ' completed' : day.isPaused ? ' paused' : ''}`}
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
                    ) : day.isPaused ? (
                      <Pause size={11} strokeWidth={2} color="rgba(34,34,34,0.35)" />
                    ) : (
                      <Circle size={12} strokeWidth={1.5} color="rgba(34,34,34,0.20)" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.tapHint}>Did one you forgot to mark? Tap to add it.</Text>

            {/* Weekly trend micro-row — part of the rhythm zone, under the day row */}
            {card.cadence !== 'daily' &&
              card.trend.read !== null &&
              (() => {
                const onTarget = card.trend.bars.filter((b) => b.hits >= b.target).length;
                const total = card.trend.bars.length;
                return (
                  <View style={styles.rhythmWeeksRow}>
                    <Text style={styles.rhythmWeeksLabel}>last {total} weeks</Text>
                    <View style={styles.rhythmWeeksDots}>
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
                    <Text style={styles.rhythmWeeksCaption}>
                      {onTarget} of {total} on target
                    </Text>
                  </View>
                );
              })()}

            {/* Code-insight strip — three fixed lifetime facts */}
            <View style={styles.stripRow}>
              <View style={styles.stripItem}>
                <Text style={styles.stripNum} numberOfLines={1}>
                  {card.bestDayAllTime ?? '--'}
                </Text>
                <Text style={styles.stripLabel}>best day</Text>
              </View>
              <View style={styles.stripDivider} />
              <View style={styles.stripItem}>
                <Text style={styles.stripNum}>{card.totalCompletions}</Text>
                <Text style={styles.stripLabel}>{card.isBreak ? 'days clear' : 'total done'}</Text>
              </View>
              <View style={styles.stripDivider} />
              <View style={styles.stripItem}>
                <Text style={styles.stripNum} numberOfLines={1}>
                  {formatSince(card.trackingSince)}
                </Text>
                <Text style={styles.stripLabel}>tracking since</Text>
              </View>
            </View>

            {/* ── Planning surface (P5): adapt + schedule, one zone ── */}
            {!card.isBreak &&
              card.cadence !== 'daily' &&
              (() => {
                const ds = getDateService();
                const today = ds.today();
                const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                const nextMondayFrom = (dateStr: string): string => {
                  const js = ds.fromLocalDate(dateStr) ?? ds.now();
                  const daysUntilMon = (8 - js.getDay()) % 7;
                  return ds.addDays(dateStr, daysUntilMon);
                };
                const formatStartLabel = (dateStr: string): string => {
                  if (dateStr === today) return 'Today';
                  if (dateStr === ds.addDays(today, 1)) return 'Tomorrow';
                  const js = ds.fromLocalDate(dateStr);
                  if (!js) return dateStr;
                  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const mons = [
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
                  return `${dows[js.getDay()]} ${mons[js.getMonth()]} ${js.getDate()}`;
                };
                const pauseCovers = (date: string) =>
                  adaptationsForCard.some(
                    (a) => a.mode === 'pause' && a.period_start <= date && a.period_end >= date,
                  );
                const floorCovers = (date: string) =>
                  adaptationsForCard.some(
                    (a) => a.mode === 'floor' && a.period_start <= date && a.period_end >= date,
                  );
                const localPlannedDates = habitPlans
                  .filter((p) => p.habit_id === card.id && p.week_start === planStart)
                  .map((p) => p.planned_date);
                const cells = Array.from({ length: 7 }, (_, i) => {
                  const date = ds.addDays(planStart, i);
                  const js = ds.fromLocalDate(date) ?? ds.now();
                  return {
                    date,
                    dow: DOW[js.getDay()],
                    dayNum: js.getDate(),
                    isPlanned: localPlannedDates.includes(date),
                    isPaused: pauseCovers(date),
                    isFloored: floorCovers(date),
                  };
                });
                if (cells.some((c) => c.date === '2026-06-25')) {
                  console.log('[FLOOR_PROBE]', {
                    date: '2026-06-25',
                    isFloored: floorCovers('2026-06-25'),
                    adaptCount: habitAdaptations.length,
                    floorRows: habitAdaptations
                      .filter((a) => a.mode === 'floor')
                      .map(
                        (a) => `${a.period_start}..${a.period_end} card:${a.habit_id === card?.id}`,
                      ),
                    cardId: card?.id,
                    planStart,
                  });
                }
                const plannedCount = cells.filter((c) => c.isPlanned).length;
                const target = card.targetPerPeriod;
                const mondayOption = nextMondayFrom(today);
                const onToggle = async (date: string, planned: boolean, paused: boolean) => {
                  if (paused) return;
                  if (planned) await removeHabitPlan(card.id, date);
                  else await setHabitPlan(card.id, date, planStart);
                };
                return (
                  <View style={styles.planSurface}>
                    {/* Heading + start date selector */}
                    <View style={styles.planHead}>
                      <Text style={styles.planTitle}>Plan your week starting</Text>
                      <TouchableOpacity
                        style={styles.planStartPill}
                        onPress={() => setPlanStartMenuOpen((v) => !v)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Plan start date: ${formatStartLabel(planStart)}. Tap to change.`}
                      >
                        <Text style={styles.planStartPillText}>{formatStartLabel(planStart)}</Text>
                        <ChevronDown size={13} strokeWidth={2} color={'#1E3D2B'} />
                      </TouchableOpacity>
                    </View>

                    {/* Inline start date menu */}
                    {planStartMenuOpen && (
                      <View style={styles.planStartMenu}>
                        {(
                          [
                            { label: 'Today', value: today },
                            { label: 'Tomorrow', value: ds.addDays(today, 1) },
                            { label: 'Monday', value: mondayOption },
                          ] as { label: string; value: string }[]
                        ).map((opt) => (
                          <TouchableOpacity
                            key={opt.label}
                            style={styles.planStartMenuItem}
                            onPress={() => {
                              setPlanStart(opt.value);
                              setPlanStartMenuOpen(false);
                            }}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={opt.label}
                          >
                            <Text style={styles.planStartMenuItemText}>{opt.label}</Text>
                            {planStart === opt.value && (
                              <Check size={13} strokeWidth={2.5} color={'#1E3D2B'} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={[styles.planStartMenuItem, { borderBottomWidth: 0 }]}
                          onPress={() => {
                            setPlanStartMenuOpen(false);
                            requestAnimationFrame(() => {
                              const jsDate = ds.fromLocalDate(planStart) ?? ds.now();
                              setDatePickerTempDate(jsDate);
                              setDatePickerTarget('planStart');
                            });
                          }}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Pick date"
                        >
                          <Text style={styles.planStartMenuItemText}>Pick date...</Text>
                          <Calendar size={13} strokeWidth={1.8} color={BRAND.colors.inkMuted} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Adapt slot — adapt affordance above the strip so strip reflects reality */}
                    <View style={styles.planAdaptSlot}>
                      {/* Adaptation pills — one per non-expired adaptation */}
                      {adaptationsForCard.map((a) => (
                        <View key={a.id} style={styles.activeAdaptRow}>
                          <View style={styles.activeAdaptContent}>
                            {a.mode === 'pause' ? (
                              <Pause size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                            ) : (
                              <TrendingDown
                                size={11}
                                strokeWidth={2}
                                color={BRAND.colors.charcoalInk}
                              />
                            )}
                            <Text style={styles.activeAdaptText}>
                              {a.mode === 'pause'
                                ? `Paused ${formatDateDisplay(a.period_start)} to ${formatDateDisplay(a.period_end)}`
                                : `Floor ${formatDateDisplay(a.period_start)} to ${formatDateDisplay(a.period_end)}`}
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

                      {/* Add prompt (collapsed) or form (expanded) */}
                      {!adaptExpanded && (
                        <TouchableOpacity
                          style={styles.adaptPromptRow}
                          onPress={handlePressAdapt}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={
                            adaptationsForCard.length > 0
                              ? 'Add another adaptation'
                              : 'Adapt this habit for travel or a break'
                          }
                        >
                          <Calendar size={13} strokeWidth={1.8} color={'#3A5A45'} />
                          <Text style={styles.adaptPromptText}>
                            {adaptationsForCard.length > 0
                              ? 'Add another'
                              : 'Adapt for travel or a break'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Floor suggestion (AI-detected disruption, above day strip) */}
                    {(() => {
                      const suggestion = getFloorSuggestion(card.id, blockWeekStart);
                      const isDismissed = dismissedFloors.has(card.id);
                      const showSuggestion =
                        suggestion?.detected && suggestion.ideas.length > 0 && !isDismissed;
                      if (!showSuggestion) return null;
                      const formatRange = (d: { start: string; end: string }) =>
                        `${formatDateDisplay(d.start)} to ${formatDateDisplay(d.end)}`;
                      return (
                        <View style={styles.floorSuggest}>
                          <View style={styles.floorSuggestHead}>
                            <Sparkles size={15} strokeWidth={1.8} color={'#7A6420'} />
                            <Text style={styles.floorSuggestLead}>{suggestion!.lead_line}</Text>
                            <TouchableOpacity
                              onPress={() =>
                                setDismissedFloors((prev) => new Set([...prev, card.id]))
                              }
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Dismiss suggestion"
                            >
                              <X size={14} strokeWidth={2} color={'#3A5A45'} />
                            </TouchableOpacity>
                          </View>
                          {suggestion!.ideas.map((idea, i) => (
                            <TouchableOpacity
                              key={i}
                              style={styles.floorIdeaRow}
                              onPress={() => {
                                updateHabit(card.id, { floor_note: idea });
                                setDismissedFloors((prev) => new Set([...prev, card.id]));
                              }}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={`Use this floor: ${idea}`}
                            >
                              <ArrowDown size={13} strokeWidth={2} color={'#7A6420'} />
                              <Text style={styles.floorIdeaText}>{idea}</Text>
                            </TouchableOpacity>
                          ))}
                          <View style={styles.floorSuggestActions}>
                            <TouchableOpacity
                              onPress={() => {
                                if (suggestion!.disruption) {
                                  setAdaptMode('pause');
                                  setAdaptStart(suggestion!.disruption.start);
                                  setAdaptEnd(suggestion!.disruption.end);
                                  setAdaptExpanded(true);
                                }
                              }}
                              accessibilityRole="button"
                            >
                              <Text style={styles.floorPauseLink}>
                                {'Or pause '}
                                {suggestion!.disruption
                                  ? formatRange(suggestion!.disruption)
                                  : 'this stretch'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })()}
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
                                <Text
                                  style={[styles.recChipText, isActive && styles.recChipTextActive]}
                                >
                                  {label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={styles.recCaption}>Selecting a chip updates this habit.</Text>
                      </View>
                    )}

                    {/* Banners */}
                    {adaptConfirmation && (
                      <View style={styles.appliedBanner}>
                        <Check size={13} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                        <Text style={styles.appliedBannerText}>{adaptConfirmation}</Text>
                      </View>
                    )}
                    {appliedChange && (
                      <View style={styles.appliedBanner}>
                        <Check size={13} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                        <Text style={styles.appliedBannerText}>
                          Frequency updated to {appliedChange.label}
                        </Text>
                      </View>
                    )}

                    {/* 7-day forward strip */}
                    <View style={styles.planRow}>
                      {cells.map((c) => (
                        <TouchableOpacity
                          key={c.date}
                          style={[
                            styles.planCell,
                            c.isPaused && styles.planCellPaused,
                            !c.isPaused && c.isFloored && styles.planCellFloored,
                            !c.isPaused && !c.isFloored && c.isPlanned && styles.planCellActive,
                          ]}
                          disabled={c.isPaused}
                          onPress={() => onToggle(c.date, c.isPlanned, c.isPaused)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: c.isPlanned || c.isFloored,
                            disabled: c.isPaused,
                          }}
                          accessibilityLabel={`${c.dow} ${c.dayNum}${c.isPaused ? ' paused' : c.isFloored ? ' floored' : c.isPlanned ? ' planned' : ''}`}
                        >
                          <Text
                            style={[
                              styles.planCellDow,
                              !c.isPaused &&
                                !c.isFloored &&
                                c.isPlanned &&
                                styles.planCellDowActive,
                            ]}
                          >
                            {c.dow}
                          </Text>
                          <Text style={styles.planCellNum}>{c.dayNum}</Text>
                          {c.isPaused ? (
                            <Pause size={11} strokeWidth={2} color="rgba(34,34,34,0.30)" />
                          ) : c.isFloored ? (
                            <TrendingDown size={11} strokeWidth={2} color={'#8A6A28'} />
                          ) : c.isPlanned ? (
                            <Check size={12} strokeWidth={2.5} color={'#F9F6F1'} />
                          ) : (
                            <View style={styles.planCellDot} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.planFlexNote}>
                      {plannedCount === 0
                        ? 'or leave it blank to keep this week flexible'
                        : `${plannedCount} of ${target} planned`}
                    </Text>
                  </View>
                );
              })()}
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
      </ScrollView>
      {adaptFormModal}
      {datePickerModals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    paddingBottom: 10,
  },

  // Progress dots
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
    paddingTop: 6,
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
    marginBottom: 20,
  },

  // ── Hero header ────────────────────────────────────────────────────────────
  heroHeader: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingHorizontal: 20,
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
    color: '#F9F6F1',
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
    paddingHorizontal: 20,
    paddingTop: 16,
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
  rhythmHeadingSub: { fontSize: 12, fontWeight: '400', color: 'rgba(34,34,34,0.40)' },
  // Floor suggestion
  floorSuggest: {
    marginTop: 14,
    marginBottom: 14,
  },
  floorSuggestHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  floorSuggestLead: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#1E3D2B',
    fontWeight: '600',
  },
  floorIdeaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(30,61,43,0.18)',
  },
  floorIdeaText: { flex: 1, flexShrink: 1, fontSize: 13.5, lineHeight: 18, color: '#26442F' },
  floorSuggestActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(30,61,43,0.18)',
  },
  floorPauseLink: { fontSize: 12, color: '#3A5A45', fontWeight: '500' },
  floorChatLink: { fontSize: 12, color: BRAND.colors.mossGreen, fontWeight: '600' },
  // Intro gate
  habitIntroWrap: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  habitIntroCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,34,34,0.05)',
    zIndex: 2,
  },
  habitIntroPressable: {
    flex: 1,
  },
  habitIntroCenter: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  habitIntroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  habitIntroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 0.6,
  },
  habitIntroSubtitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    color: '#3A5A45',
    marginBottom: 6,
  },
  habitIntroHint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginBottom: 18,
  },
  habitIntroRows: {
    gap: 12,
  },
  habitIntroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  habitIntroChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(191,216,192,0.35)',
    marginTop: 1,
  },
  habitIntroRowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#3D3A34',
    fontWeight: '400',
  },
  habitIntroRowLead: {
    fontWeight: '500',
    color: '#2F2B25',
  },
  habitIntroFooter: {
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  habitIntroTap: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  habitIntroCount: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontWeight: '500',
  },
  // Load screen
  loadWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 40,
  },
  loadText: { fontSize: 14, color: BRAND.colors.inkMuted, fontWeight: '500' },
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
  dayCellPaused: {
    backgroundColor: 'rgba(34,34,34,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.10)',
    borderStyle: 'solid',
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
    color: '#3A5A45',
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
  adaptSheetActiveSection: {
    marginBottom: 10,
  },
  adaptSheetActiveTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 6,
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
  adaptDoneBtn: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.14)',
    backgroundColor: BRAND.colors.surface,
  },
  adaptDoneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },

  // Date picker bottom sheet
  datePickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 8,
    paddingBottom: 34,
    minHeight: 440,
  },
  adaptFormSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 34,
  },
  adaptSheetDatePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  adaptSheetDatePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
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

  // Rhythm zone — micro trend row + code-insight strip
  rhythmWeeksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(34,34,34,0.07)',
  },
  rhythmWeeksLabel: {
    fontSize: 10,
    color: 'rgba(34,34,34,0.45)',
    width: 70,
  },
  rhythmWeeksDots: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  rhythmWeeksCaption: {
    fontSize: 10,
    color: 'rgba(34,34,34,0.45)',
    marginLeft: 'auto' as any,
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    marginTop: 9,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderTopColor: 'rgba(34,34,34,0.08)',
    borderBottomColor: 'rgba(34,34,34,0.08)',
  },
  stripItem: {
    flex: 1,
    alignItems: 'center',
  },
  stripNum: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  stripLabel: {
    fontSize: 9.5,
    color: 'rgba(34,34,34,0.45)',
    marginTop: 3,
  },
  stripDivider: {
    width: 0.5,
    height: 24,
    backgroundColor: 'rgba(34,34,34,0.10)',
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
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(30,61,43,0.18)',
  },
  recSentence: {
    fontSize: 13,
    fontWeight: '400',
    color: '#26442F',
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
    borderColor: 'rgba(30,61,43,0.20)',
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  recChipActive: {
    borderColor: '#2E5540',
    backgroundColor: '#2E5540',
  },
  recChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E3D2B',
  },
  recChipTextActive: {
    color: '#F9F6F1',
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
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(30,61,43,0.18)',
  },
  appliedBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },

  // Planning surface (P5)
  planSurface: {
    backgroundColor: 'rgba(191,216,192,0.45)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginHorizontal: -20,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,61,43,0.25)',
    marginBottom: 12,
  },
  planTitle: { fontSize: 16, fontWeight: '700', color: '#1E3D2B' },
  planStartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  planStartPillText: { fontSize: 13, fontWeight: '600', color: '#1E3D2B' },
  cardCPlanStartAnchor: {
    position: 'relative',
  },
  cardCPlanStartBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  cardCPlanStartMenu: {
    position: 'absolute',
    top: 352,
    right: 24,
    zIndex: 50,
    elevation: 8,
    minWidth: 180,
    borderRadius: 12,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(34,34,34,0.10)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  planStartMenu: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(34,34,34,0.10)',
    overflow: 'hidden',
  },
  planStartMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(34,34,34,0.07)',
  },
  planStartMenuItemText: { fontSize: 14, fontWeight: '500', color: '#1E3D2B' },
  planAdaptSlot: { marginTop: 8, marginBottom: 8 },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: 12 },
  planCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderWidth: 0.5,
    borderColor: 'rgba(30,61,43,0.12)',
  },
  planCellActive: {
    backgroundColor: '#2E5540',
    borderColor: '#2E5540',
  },
  planCellFloored: {
    backgroundColor: 'rgba(224,196,122,0.30)',
    borderColor: 'rgba(138,106,40,0.60)',
    borderWidth: 1,
  },
  planCellPaused: { backgroundColor: 'rgba(34,34,34,0.04)', opacity: 0.55 },
  planCellDow: { fontSize: 9.5, fontWeight: '600', color: '#3A5A45' },
  planCellDowActive: { color: '#F9F6F1' },
  planCellNum: { fontSize: 12.5, fontWeight: '600', color: '#1E3D2B' },
  planCellDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(34,34,34,0.18)' },
  planFlexNote: { fontSize: 10.5, color: '#3A5A45', marginTop: 8, textAlign: 'center' },

  // Navigation
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 20,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  skipBtn: { alignItems: 'center', paddingVertical: 2 },
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
