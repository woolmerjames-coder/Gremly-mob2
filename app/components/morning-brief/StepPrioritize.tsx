/**
 * StepPrioritize — "Build Your Day"
 *
 * Clean battery-style capacity meter + slim compact task rows.
 * Single unified list sorted by type (todos then habits) with
 * selected items floating to top. Lock icon inline on selected rows.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, Pressable, StyleSheet, LayoutAnimation, Animated } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { Check, Lock, Unlock, Plus, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { TaskItemData } from './components';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatMins(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatPill(mins: number | undefined): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Meter fill color based on capacity usage */
function getMeterColor(pct: number): string {
  if (pct > 1) return '#C45B4A'; // red — over
  if (pct >= 0.85) return '#E8A838'; // amber — nearing full
  return BRAND.colors.mossGreen; // green — healthy
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
  pendingDrops: unknown[];
  animatingAssignments: unknown[] | null;
  onContinue: () => void;
  onSkip: () => void;
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
  onToggleLock,
  onTaskPress,
  onAddPress,
  onAssignPress,
  onContinue,
  onSkip,
}: StepPrioritizeProps) {
  const hasTasks = flexibleTasks.length > 0;
  const isOver = remainingMinutes < 0;
  const overAmount = Math.abs(remainingMinutes);

  // ── Meter fill animation ─────────────────────────────────────────
  const capacity = Math.max(totalAvailableMinutes, 1);
  const fillPct = selectedMinutes / capacity;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fillAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    LayoutAnimation.configureNext({
      duration: 300,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    Animated.spring(fillAnim, {
      toValue: Math.min(fillPct, 1),
      useNativeDriver: false,
      friction: 12,
      tension: 60,
    }).start();
  }, [fillPct, fillAnim]);

  const meterColor = getMeterColor(fillPct);

  // ── Sort tasks: selected first within each type ──────────────────
  const { todos, habits, showTypeLabels, selectedCount } = useMemo(() => {
    const td: TaskItemData[] = [];
    const hb: TaskItemData[] = [];
    let selCount = 0;
    for (const task of flexibleTasks) {
      if (selectedIds.has(task.id)) selCount++;
      if (task.type === 'todo') td.push(task);
      else hb.push(task);
    }
    // Sort selected first, preserve original order within each group
    const sortSelected = (a: TaskItemData, b: TaskItemData) => {
      const aS = selectedIds.has(a.id) ? 0 : 1;
      const bS = selectedIds.has(b.id) ? 0 : 1;
      return aS - bS;
    };
    td.sort(sortSelected);
    hb.sort(sortSelected);
    return {
      todos: td,
      habits: hb,
      showTypeLabels: td.length > 0 && hb.length > 0,
      selectedCount: selCount,
    };
  }, [flexibleTasks, selectedIds]);

  // ── Toggle handler with LayoutAnimation ──────────────────────────
  const handleToggle = useCallback(
    (task: TaskItemData) => {
      const isSelected = selectedIds.has(task.id);
      const isLocked = lockedIds.has(task.id);

      // Locked items can't be deselected — do nothing
      if (isSelected && isLocked) return;

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
    [onToggleSelect, selectedIds, lockedIds],
  );

  // ── Long press handler with haptic ───────────────────────────────
  const handleLongPress = useCallback(
    (task: TaskItemData) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        // haptics unavailable — ignore
      }
      onTaskPress(task);
    },
    [onTaskPress],
  );

  // ── Lock toggle handler ──────────────────────────────────────────
  const handleLockToggle = useCallback(
    (task: TaskItemData) => {
      onToggleLock(task);
    },
    [onToggleLock],
  );

  // ── Animated fill width interpolation ────────────────────────────
  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. TITLE + LIVE SUBTITLE ────────────────────────── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>Build your day</Text>
          {selectedCount === 0 ? (
            <Text style={styles.subtitle}>Tap tasks to fill your day</Text>
          ) : (
            <Text style={styles.subtitle}>
              <Text style={styles.subtitleAccent}>{selectedCount}</Text>
              {` task${selectedCount !== 1 ? 's' : ''} · `}
              <Text style={styles.subtitleAccent}>{formatMins(selectedMinutes)}</Text>
            </Text>
          )}
        </View>

        {/* ── 2. CAPACITY METER ───────────────────────────────── */}
        <View style={styles.meterContainer}>
          <View style={styles.meterLabelRow}>
            <Text style={styles.meterLabelLeft}>{formatMins(totalAvailableMinutes)} free time</Text>
            {isOver ? (
              <Text style={styles.meterLabelOver}>{formatMins(overAmount)} over</Text>
            ) : (
              <Text style={styles.meterLabelRight}>{formatMins(remainingMinutes)} left</Text>
            )}
          </View>
          <View style={styles.meterTrack}>
            <Animated.View
              style={[
                styles.meterFill,
                {
                  width: fillWidth,
                  backgroundColor: meterColor,
                },
              ]}
            />
          </View>
        </View>

        {/* ── 3. TASK LIST ────────────────────────────────────── */}
        {!hasTasks && (
          <View style={styles.emptyState}>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
              onPress={onAddPress}
            >
              <Plus size={20} color={BRAND.colors.mossGreen} />
              <Text style={styles.addButtonText}>Add a task</Text>
            </Pressable>
          </View>
        )}

        {showTypeLabels && todos.length > 0 && (
          <Text style={styles.sectionLabel}>TODOS ({todos.length})</Text>
        )}
        {todos.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={selectedIds.has(task.id)}
            isLocked={lockedIds.has(task.id)}
            onToggle={handleToggle}
            onLongPress={handleLongPress}
            onLockToggle={handleLockToggle}
            onAssignPress={onAssignPress}
          />
        ))}

        {showTypeLabels && habits.length > 0 && (
          <Text style={styles.sectionLabel}>HABITS ({habits.length})</Text>
        )}
        {habits.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={selectedIds.has(task.id)}
            isLocked={lockedIds.has(task.id)}
            onToggle={handleToggle}
            onLongPress={handleLongPress}
            onLockToggle={handleLockToggle}
            onAssignPress={onAssignPress}
          />
        ))}
      </ScrollView>

      {/* ── 4. FOOTER ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.continueButton, pressed && { opacity: 0.85 }]}
          onPress={onContinue}
        >
          <Text style={styles.continueText}>Continue →</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.skipPressable, pressed && { opacity: 0.5 }]}
          onPress={onSkip}
        >
          <Text style={styles.skipText}>Skip · keep all</Text>
        </Pressable>
      </View>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TaskRow — unified row for selected and unselected
// ═══════════════════════════════════════════════════════════════════

/** Map timeWindow to short pill label */
function blockLabel(tw: TaskItemData['timeWindow']): string | null {
  if (tw === 'morning') return 'AM';
  if (tw === 'day') return 'PM';
  if (tw === 'evening') return 'EVE';
  return null;
}

function TaskRow({
  task,
  isSelected,
  isLocked,
  onToggle,
  onLongPress,
  onLockToggle,
  onAssignPress,
}: {
  task: TaskItemData;
  isSelected: boolean;
  isLocked: boolean;
  onToggle: (t: TaskItemData) => void;
  onLongPress: (t: TaskItemData) => void;
  onLockToggle: (t: TaskItemData) => void;
  onAssignPress: (t: TaskItemData) => void;
}) {
  if (isSelected) {
    const bl = blockLabel(task.timeWindow);

    return (
      <Pressable
        style={({ pressed }) => [styles.selectedRow, pressed && { opacity: 0.85 }]}
        onPress={() => onToggle(task)}
        onLongPress={() => onLongPress(task)}
      >
        {/* Straight accent bar */}
        <View style={[styles.accentBar, isLocked && styles.accentBarLocked]} />

        {/* Row content */}
        <View style={styles.rowContent}>
          {/* Checkbox — filled */}
          <View style={styles.checkboxFilled}>
            <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
          </View>

          {/* Title + metadata */}
          <View style={styles.titleArea_row}>
            <Text style={styles.selectedTitle} numberOfLines={1}>
              {task.title}
            </Text>
            {task.type === 'habit' && task.metadata?.label ? (
              <Text style={styles.habitMeta}>{task.metadata.label}</Text>
            ) : null}
            {isLocked && <Text style={styles.lockedBadge}>Locked</Text>}
          </View>

          {/* Time */}
          <Text style={styles.timeText}>{formatPill(task.estimatedMinutes)}</Text>

          {/* Block assignment button */}
          {bl ? (
            <Pressable style={styles.blockPill} hitSlop={8} onPress={() => onAssignPress(task)}>
              <Text style={styles.blockPillText}>{bl}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.blockButton} hitSlop={8} onPress={() => onAssignPress(task)}>
              <Clock size={15} color={BRAND.colors.borderSubtle} strokeWidth={2} />
            </Pressable>
          )}

          {/* Lock button — always visible */}
          <Pressable style={styles.lockButton} hitSlop={8} onPress={() => onLockToggle(task)}>
            {isLocked ? (
              <View style={styles.lockCircle}>
                <Lock size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
              </View>
            ) : (
              <Unlock size={16} color={BRAND.colors.borderSubtle} strokeWidth={2} />
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  }

  // Unselected row
  return (
    <Pressable
      style={({ pressed }) => [
        styles.unselectedRow,
        pressed && { backgroundColor: 'rgba(46,85,64,0.04)' },
      ]}
      onPress={() => onToggle(task)}
      onLongPress={() => onLongPress(task)}
    >
      {/* Checkbox — empty */}
      <View style={styles.checkboxEmpty} />

      {/* Title */}
      <Text style={styles.unselectedTitle} numberOfLines={1}>
        {task.title}
      </Text>

      {/* Time */}
      <Text style={styles.unselectedTime}>{formatPill(task.estimatedMinutes)}</Text>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },

  // ── Title ───────────────────────────────────────────────────────
  titleArea: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  subtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
    paddingHorizontal: 0,
  },
  subtitleAccent: {
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },

  // ── Capacity Meter ──────────────────────────────────────────────
  meterContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 20,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  meterLabelLeft: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  meterLabelRight: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  meterLabelOver: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C45B4A',
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8E4DD',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },

  // ── Section Labels ──────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 8,
  },

  // ── Selected Row ────────────────────────────────────────────────
  selectedRow: {
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: '#FEFDFB',
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  accentBar: {
    width: 3,
    backgroundColor: BRAND.colors.mossGreen,
  },
  accentBarLocked: {
    width: 4,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  checkboxFilled: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleArea_row: {
    flex: 1,
    marginLeft: 10,
  },
  selectedTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  habitMeta: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    marginTop: 1,
  },
  lockedBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    marginTop: 1,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    marginRight: 8,
  },
  blockButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  blockPill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(46,85,64,0.08)',
    marginRight: 4,
  },
  blockPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  lockButton: {
    padding: 2,
  },
  lockCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(46,85,64,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Unselected Row ──────────────────────────────────────────────
  unselectedRow: {
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxEmpty: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: BRAND.colors.borderSubtle,
  },
  unselectedTitle: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk,
    opacity: 0.7,
  },
  unselectedTime: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    opacity: 0.5,
  },

  // ── Empty state ─────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F0EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // ── Footer ──────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  continueButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: BRAND.colors.mossGreen,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FEFDFB',
  },
  skipPressable: {
    alignItems: 'center',
  },
  skipText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 14,
  },
});

export default StepPrioritize;
