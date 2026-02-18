/**
 * StepPrioritize — "Build Your Day"
 *
 * Clean battery-style capacity meter + slim compact task rows.
 * Single unified list sorted by type (todos then habits) with
 * selected items floating to top. Lock icon inline on selected rows.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
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
import { Check, Lock, Plus, MoreHorizontal, ChevronLeft } from 'lucide-react-native';
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
  isOverCommitted,
  selectedIds,
  lockedIds,
  onToggleSelect,
  onTaskPress,
  onAddPress,
  onContinue,
  onSkip,
  onBack,
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
          <RNText style={styles.title}>Build your day</RNText>
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
            onTaskPress={onTaskPress}
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
            onTaskPress={onTaskPress}
          />
        ))}
      </ScrollView>

      {/* ── 4. FOOTER ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        {/* Back + Continue row */}
        <View style={styles.footerRow}>
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
              onPress={onBack}
            >
              <ChevronLeft size={20} color={BRAND.colors.inkMuted} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.continueButton,
              onBack ? { flex: 1 } : undefined,
              (selectedCount === 0 || isOverCommitted) && styles.continueButtonDisabled,
              pressed && !(selectedCount === 0 || isOverCommitted) && { opacity: 0.85 },
            ]}
            onPress={onContinue}
            disabled={selectedCount === 0 || isOverCommitted}
          >
            <Text
              style={[
                styles.continueText,
                (selectedCount === 0 || isOverCommitted) && styles.continueTextDisabled,
              ]}
            >
              Continue →
            </Text>
          </Pressable>
        </View>

        {/* Helper text when disabled */}
        {selectedCount === 0 && (
          <Text style={styles.helperText}>Select at least one task to continue</Text>
        )}
        {selectedCount > 0 && isOverCommitted && (
          <Text style={styles.helperText}>
            Over capacity by {formatMins(overAmount)} — remove or shorten tasks
          </Text>
        )}

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

/** Map timeWindow to readable label */
function blockName(tw: TaskItemData['timeWindow']): string | null {
  if (tw === 'morning') return 'Morning';
  if (tw === 'day') return 'Afternoon';
  if (tw === 'evening') return 'Evening';
  return null;
}

function TaskRow({
  task,
  isSelected,
  isLocked,
  onToggle,
  onLongPress,
  onTaskPress,
}: {
  task: TaskItemData;
  isSelected: boolean;
  isLocked: boolean;
  onToggle: (t: TaskItemData) => void;
  onLongPress: (t: TaskItemData) => void;
  onTaskPress: (t: TaskItemData) => void;
}) {
  if (isSelected) {
    const bn = blockName(task.timeWindow);
    const hasBadges = !!bn || isLocked;

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
          </View>

          {/* Time */}
          <Text style={styles.timeText}>{formatPill(task.estimatedMinutes)}</Text>

          {/* ⋯ button — opens TaskQuickActionSheet */}
          <Pressable
            style={styles.moreButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => onTaskPress(task)}
          >
            <MoreHorizontal size={18} color={BRAND.colors.inkMuted} />
          </Pressable>
        </View>

        {/* Inline badges row */}
        {hasBadges && (
          <View style={styles.badgeRow}>
            {bn ? (
              <View style={styles.blockBadge}>
                <Text style={styles.blockBadgeText}>{bn}</Text>
              </View>
            ) : null}
            {isLocked ? (
              <View style={styles.lockBadge}>
                <Lock size={10} color={BRAND.colors.mossGreen} strokeWidth={2} />
                <Text style={styles.lockBadgeText}>Locked in</Text>
              </View>
            ) : null}
          </View>
        )}
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
    marginTop: 16,
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
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    marginRight: 4,
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: -4,
    marginBottom: 6,
    marginLeft: 37,
  },
  blockBadge: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(46,85,64,0.06)',
  },
  blockBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(46,85,64,0.06)',
  },
  lockBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
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
  continueButtonDisabled: {
    backgroundColor: BRAND.colors.borderSubtle,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FEFDFB',
  },
  continueTextDisabled: {
    color: BRAND.colors.inkMuted,
  },
  helperText: {
    fontSize: 12,
    color: '#C45B4A',
    textAlign: 'center',
    marginTop: 6,
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
