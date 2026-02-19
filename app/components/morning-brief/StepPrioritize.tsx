/**
 * StepPrioritize — "What matters today?"
 *
 * Fast binary triage: tap to add tasks to today's plan, skip what can wait.
 * Selected items show as compact chips at top with a capacity bar.
 * Filters by type (Todos/Habits) and Space.
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Animated,
  Text as RNText,
} from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { Plus, X, Minus, Sparkles, Repeat } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { TaskItemData } from './components';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function fmt(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getMeterColor(pct: number): string {
  if (pct > 1) return '#C45B4A';
  if (pct >= 0.85) return '#E8A838';
  return BRAND.colors.mossGreen;
}

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepPrioritizeProps {
  flexibleTasks: TaskItemData[];
  isPrioritizing: boolean;
  selectedMinutes: number;
  totalAvailableMinutes: number;
  remainingMinutes: number;
  isOverCommitted: boolean;
  selectedIds: Set<string>;
  lockedIds: Set<string>;
  onToggleSelect: (task: TaskItemData) => void;
  onToggleLock: (task: TaskItemData) => void;
  onTaskPress: (task: TaskItemData) => void;
  onTimePress: (task: TaskItemData) => void;
  onAddPress: () => void;
  onAssignPress: (task: TaskItemData) => void;
  onSkipTask: (taskId: string) => void;
  onGremlyPick?: () => void;
  pendingDrops: unknown[];
  animatingAssignments: unknown[] | null;
  onContinue: () => void;
  onSkip: () => void;
  onBack?: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepPrioritize({
  flexibleTasks,
  selectedMinutes,
  totalAvailableMinutes,
  remainingMinutes,
  selectedIds,
  lockedIds,
  onToggleSelect,
  onAddPress,
  onSkipTask,
  onGremlyPick,
  onContinue,
  onSkip,
  onBack,
}: StepPrioritizeProps) {
  const [activeType, setActiveType] = useState<'all' | 'todo' | 'habit'>('all');
  const [activeSpace, setActiveSpace] = useState<string>('All');
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  // ── Meter ─────────────────────────────────────────────────────
  const capacity = Math.max(totalAvailableMinutes, 1);
  const fillPct = selectedMinutes / capacity;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fillAnim = useMemo(() => new Animated.Value(0), []);
  const isOver = remainingMinutes < 0;

  useEffect(() => {
    Animated.spring(fillAnim, {
      toValue: Math.min(fillPct, 1),
      useNativeDriver: false,
      friction: 12,
      tension: 60,
    }).start();
  }, [fillPct, fillAnim]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const meterColor = getMeterColor(fillPct);

  // ── Split committed vs available ──────────────────────────────
  const committedTasks = useMemo(
    () => flexibleTasks.filter((t) => selectedIds.has(t.id)),
    [flexibleTasks, selectedIds],
  );

  const totalTaskMinutes = useMemo(
    () => flexibleTasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0),
    [flexibleTasks],
  );

  // Available spaces (from non-committed, non-skipped tasks)
  const spaces = useMemo(() => {
    const s = new Set<string>();
    for (const t of flexibleTasks) {
      if (selectedIds.has(t.id) || skippedIds.has(t.id)) continue;
      if (t.spaceName) s.add(t.spaceName);
    }
    return [...s].sort();
  }, [flexibleTasks, selectedIds, skippedIds]);

  // Filtered available tasks
  const availableTasks = useMemo(() => {
    return flexibleTasks.filter((t) => {
      if (selectedIds.has(t.id)) return false;
      if (skippedIds.has(t.id)) return false;
      if (activeType === 'todo' && t.type !== 'todo') return false;
      if (activeType === 'habit' && t.type !== 'habit') return false;
      if (activeSpace !== 'All' && t.spaceName !== activeSpace) return false;
      return true;
    });
  }, [flexibleTasks, selectedIds, skippedIds, activeType, activeSpace]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleAdd = useCallback(
    (task: TaskItemData) => {
      LayoutAnimation.configureNext({
        duration: 250,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      onToggleSelect(task);
    },
    [onToggleSelect],
  );

  const handleRemove = useCallback(
    (task: TaskItemData) => {
      const isLocked = lockedIds.has(task.id);
      if (isLocked) return; // Can't remove locked items
      LayoutAnimation.configureNext({
        duration: 250,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      onToggleSelect(task);
    },
    [onToggleSelect, lockedIds],
  );

  const handleSkip = useCallback(
    (task: TaskItemData) => {
      LayoutAnimation.configureNext({
        duration: 200,
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
      setSkippedIds((prev) => new Set([...prev, task.id]));
      onSkipTask(task.id);
    },
    [onSkipTask],
  );

  const handleUndoSkips = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSkippedIds(new Set());
  }, []);

  const handleGremlyPick = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      /* haptics unavailable */
    }
    onGremlyPick?.();
  }, [onGremlyPick]);

  // ── Continue logic ────────────────────────────────────────────
  const hasSelections = committedTasks.length > 0;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HEADLINE ─────────────────────────────────────── */}
        <View style={styles.titleArea}>
          <RNText style={styles.title}>What matters today?</RNText>
          <RNText style={styles.subtitle}>
            {flexibleTasks.length} tasks · {fmt(totalTaskMinutes)} estimated
          </RNText>
        </View>

        {/* ── 2. CAPACITY BAR ─────────────────────────────────── */}
        <View style={styles.meterContainer}>
          <View style={styles.meterLabelRow}>
            <Text style={styles.meterLabelLeft}>
              {selectedMinutes > 0 ? `${fmt(selectedMinutes)} selected` : 'None selected'}
            </Text>
            <Text style={[styles.meterLabelRight, isOver && styles.meterLabelOver]}>
              {isOver
                ? `${fmt(Math.abs(remainingMinutes))} over`
                : `${fmt(totalAvailableMinutes)} available`}
            </Text>
          </View>
          <View style={styles.meterTrack}>
            <Animated.View
              style={[styles.meterFill, { width: fillWidth, backgroundColor: meterColor }]}
            />
          </View>
        </View>

        {/* ── 3. COMMITTED CHIPS ──────────────────────────────── */}
        {committedTasks.length > 0 && (
          <View style={styles.chipContainer}>
            {committedTasks.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => handleRemove(t)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipName} numberOfLines={2}>
                  {t.title}
                </Text>
                <Text style={styles.chipTime}>{fmt(t.estimatedMinutes || 0)}</Text>
                {!lockedIds.has(t.id) && <X size={11} color={BRAND.colors.inkMuted} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* ── 4. GREMLY SUGGEST (when nothing selected) ───────── */}
        {committedTasks.length === 0 && onGremlyPick && (
          <Pressable
            style={({ pressed }) => [styles.gremlyPickButton, pressed && { opacity: 0.7 }]}
            onPress={handleGremlyPick}
          >
            <Sparkles size={16} color={BRAND.colors.mossGreen} />
            <Text style={styles.gremlyPickText}>Let Gremly pick for me</Text>
          </Pressable>
        )}

        {/* ── 5. DIVIDER ──────────────────────────────────────── */}
        <View style={styles.divider} />

        {/* ── 6. FILTER BAR ───────────────────────────────────── */}
        <View style={styles.filterBar}>
          {/* Left: type filters */}
          <View style={styles.filterGroup}>
            {(['all', 'todo', 'habit'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setActiveType(t)}
                style={[styles.filterChip, activeType === t && styles.filterChipActive]}
              >
                <Text
                  style={[styles.filterChipText, activeType === t && styles.filterChipTextActive]}
                >
                  {t === 'all' ? 'All' : t === 'todo' ? 'Todos' : 'Habits'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.filterDivider} />

          {/* Right: space filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.spaceScroll}>
            <View style={styles.filterGroup}>
              {spaces.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setActiveSpace(activeSpace === s ? 'All' : s)}
                  style={[styles.filterChip, activeSpace === s && styles.filterChipActive]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeSpace === s && styles.filterChipTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ── 7. SECTION HEADER ───────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>EVERYTHING ELSE ({availableTasks.length})</Text>
          {skippedIds.size > 0 && (
            <Pressable onPress={handleUndoSkips}>
              <Text style={styles.undoSkipsText}>Undo skips ({skippedIds.size})</Text>
            </Pressable>
          )}
        </View>

        {/* ── 8. TASK LIST ────────────────────────────────────── */}
        {availableTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            {/* Add button */}
            <Pressable
              style={({ pressed }) => [styles.addIcon, pressed && { backgroundColor: '#D6E5D9' }]}
              onPress={() => handleAdd(task)}
            >
              <Plus size={13} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            </Pressable>

            {/* Name (tap to add) */}
            <Pressable style={styles.taskNameArea} onPress={() => handleAdd(task)}>
              <Text style={styles.taskName} numberOfLines={1}>
                {task.title}
              </Text>
            </Pressable>

            {/* Habit badge */}
            {task.type === 'habit' && (
              <View style={styles.habitBadge}>
                <Repeat size={9} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
              </View>
            )}

            {/* Time */}
            <Text style={styles.taskTime}>{fmt(task.estimatedMinutes || 0)}</Text>

            {/* Skip button */}
            <Pressable
              style={({ pressed }) => [styles.skipIcon, pressed && { backgroundColor: '#F0EEEA' }]}
              onPress={() => handleSkip(task)}
            >
              <Minus size={13} color={BRAND.colors.inkMuted} strokeWidth={2} />
            </Pressable>
          </View>
        ))}

        {availableTasks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {skippedIds.size > 0 ? 'All remaining tasks skipped' : 'All tasks added'}
            </Text>
          </View>
        )}

        {/* ── 9. REASSURANCE ──────────────────────────────────── */}
        <Text style={styles.reassurance}>Skipped tasks will come back in your next sweep</Text>

        {/* Spacer for footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── 10. STICKY FOOTER ─────────────────────────────────── */}
      <View style={styles.stickyFooter}>
        <View style={styles.footerRow}>
          {/* Quick add */}
          <Pressable
            style={({ pressed }) => [styles.quickAddButton, pressed && { opacity: 0.7 }]}
            onPress={onAddPress}
          >
            <Plus size={22} color={BRAND.colors.mossGreen} />
          </Pressable>

          {/* Continue */}
          <Pressable
            style={({ pressed }) => [
              styles.continueButton,
              !hasSelections && styles.continueButtonDisabled,
              pressed && hasSelections && { backgroundColor: '#AECBB0' },
            ]}
            onPress={hasSelections ? onContinue : undefined}
            disabled={!hasSelections}
          >
            <Text style={[styles.continueText, !hasSelections && styles.continueTextDisabled]}>
              {hasSelections ? `Continue with ${committedTasks.length} →` : 'Pick at least one →'}
            </Text>
          </Pressable>
        </View>

        {/* Back / Skip row */}
        <View style={styles.footerSecondary}>
          {onBack && (
            <Pressable style={({ pressed }) => [pressed && { opacity: 0.5 }]} onPress={onBack}>
              <Text style={styles.footerLink}>← Back</Text>
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.5 }]} onPress={onSkip}>
            <Text style={styles.footerLink}>Skip · keep all</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },

  // Title
  titleArea: { paddingHorizontal: 20, marginTop: 16 },
  title: { fontSize: 22, fontWeight: '700', color: BRAND.colors.charcoalInk },
  subtitle: { fontSize: 13, color: BRAND.colors.inkMuted, marginTop: 4 },

  // Meter
  meterContainer: { marginHorizontal: 20, marginTop: 12, marginBottom: 4 },
  meterLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  meterLabelLeft: { fontSize: 11, fontWeight: '600', color: BRAND.colors.mossGreen },
  meterLabelRight: { fontSize: 11, fontWeight: '600', color: BRAND.colors.inkMuted },
  meterLabelOver: { color: '#C45B4A' },
  meterTrack: { height: 5, borderRadius: 3, backgroundColor: '#E8E4DD', overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },

  // Committed chips
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    justifyContent: 'space-between',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 8,
    backgroundColor: '#E8F0EB',
    borderWidth: 1,
    borderColor: '#D6E5D9',
    width: '48.5%',
  },
  chipName: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    flex: 1,
    flexShrink: 1,
    lineHeight: 14,
  },
  chipTime: { fontSize: 10, color: BRAND.colors.inkMuted },

  // Gremly pick
  gremlyPickButton: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEFDFB',
    borderWidth: 1.5,
    borderColor: '#D6E5D9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gremlyPickText: { fontSize: 13, fontWeight: '600', color: BRAND.colors.mossGreen },

  // Divider
  divider: { height: 1, backgroundColor: '#E8E6E1', marginHorizontal: 20, marginTop: 10 },

  // Filters
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  filterGroup: { flexDirection: 'row', gap: 4 },
  filterDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#E8E6E1',
    marginHorizontal: 4,
  },
  spaceScroll: { flexShrink: 1, marginLeft: 8 },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#E8F0EB',
    borderColor: '#D6E5D9',
  },
  filterChipText: { fontSize: 11, fontWeight: '500', color: BRAND.colors.inkMuted },
  filterChipTextActive: { fontWeight: '700', color: BRAND.colors.mossGreen },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: BRAND.colors.inkMuted,
  },
  undoSkipsText: { fontSize: 10, color: BRAND.colors.mossGreen, fontWeight: '600' },

  // Task row
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E6E1',
  },
  addIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#D6E5D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskNameArea: { flex: 1, minWidth: 0 },
  taskName: {
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
    opacity: 0.85,
  },
  habitBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#E8F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTime: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    fontVariant: ['tabular-nums'],
  },
  skipIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: BRAND.colors.inkMuted },

  // Reassurance
  reassurance: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Sticky footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: BRAND.colors.linenCream ?? '#F9F6F1',
    shadowColor: '#F9F6F1',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  quickAddButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FEFDFB',
    borderWidth: 1.5,
    borderColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#BFD8C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: { backgroundColor: '#E8E6E1' },
  continueText: { fontSize: 16, fontWeight: '600', color: '#2E5540' },
  continueTextDisabled: { color: '#B0AEA8' },
  footerSecondary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 8,
  },
  footerLink: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    paddingVertical: 6,
  },
});

export default StepPrioritize;
