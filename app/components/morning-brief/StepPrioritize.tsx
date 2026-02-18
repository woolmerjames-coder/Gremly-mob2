/**
 * StepPrioritize — "Build Your Day"
 *
 * Visual time-canvas concept: the user assembles their day by
 * tapping tasks. Colored blocks fill a horizontal bar showing
 * how time is being allocated. Two zones: TODAY (selected) and
 * AVAILABLE (unselected).
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, Pressable, StyleSheet, LayoutAnimation, Animated } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { Plus } from 'lucide-react-native';
import type { TaskItemData } from './components';

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const BLOCK_COLORS = [
  '#2E5540', // mossGreen
  '#4A7C63', // lighter green
  '#6B9B7E', // sage
  '#8FB59E', // light sage
  '#3D6B50', // forest
  '#5C8A6E', // fern
];

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

/** Short format for pills: "30m", "1h", "1h 15m" */
function formatPill(mins: number | undefined): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
  onToggleSelect,
  onTaskPress,
  onAddPress,
  onContinue,
  onSkip,
}: StepPrioritizeProps) {
  const hasTasks = flexibleTasks.length > 0;
  const isOver = remainingMinutes < 0;
  const overAmount = Math.abs(remainingMinutes);

  // ── Pulse animation for overflow glow ────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pulseAnim = useMemo(() => new Animated.Value(0.3), []);

  useEffect(() => {
    if (isOver) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isOver, pulseAnim]);

  // ── Split tasks into Today (selected) and Available ──────────────
  const { todayTasks, availableTasks } = useMemo(() => {
    const today: TaskItemData[] = [];
    const available: TaskItemData[] = [];
    for (const task of flexibleTasks) {
      if (selectedIds.has(task.id)) {
        today.push(task);
      } else {
        available.push(task);
      }
    }
    return { todayTasks: today, availableTasks: available };
  }, [flexibleTasks, selectedIds]);

  // ── Stable color assignment by task ID ───────────────────────────
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const task of flexibleTasks) {
      if (!map.has(task.id)) {
        map.set(task.id, BLOCK_COLORS[idx % BLOCK_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [flexibleTasks]);

  // ── Selected count + total time for subtitle ─────────────────────
  const selectedCount = todayTasks.length;
  const totalSelectedMins = selectedMinutes;

  // ── Toggle with LayoutAnimation ──────────────────────────────────
  const handleToggle = useCallback(
    (task: TaskItemData) => {
      LayoutAnimation.configureNext({
        duration: 300,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.scaleXY,
        },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
      onToggleSelect(task);
    },
    [onToggleSelect],
  );

  // ── Available zone sub-labels ────────────────────────────────────
  const availableTodos = useMemo(
    () => availableTasks.filter((t) => t.type === 'todo'),
    [availableTasks],
  );
  const availableHabits = useMemo(
    () => availableTasks.filter((t) => t.type === 'habit'),
    [availableTasks],
  );
  const showAvailableSubLabels = availableTodos.length > 0 && availableHabits.length > 0;

  // ── Effective capacity for bar (min 1 to avoid division by 0) ──
  const barCapacity = Math.max(totalAvailableMinutes, selectedMinutes, 1);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. TITLE ────────────────────────────────────────── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>Build your day</Text>
          {selectedCount === 0 ? (
            <Text style={styles.subtitle}>Tap tasks to add them to your day</Text>
          ) : (
            <Text style={styles.subtitle}>
              <Text style={styles.subtitleAccent}>{selectedCount}</Text>
              {` task${selectedCount !== 1 ? 's' : ''} · ${formatMins(totalSelectedMins)}`}
            </Text>
          )}
        </View>

        {/* ── 2. TIME CANVAS ──────────────────────────────────── */}
        <View style={styles.canvas}>
          {/* Time label row */}
          <View style={styles.canvasLabelRow}>
            <Text style={styles.canvasLabelLeft}>
              Your {formatMins(totalAvailableMinutes)} of free time
            </Text>
            {isOver ? (
              <Text style={styles.canvasLabelOver}>{formatMins(overAmount)} over</Text>
            ) : (
              <Text style={styles.canvasLabelRight}>{formatMins(remainingMinutes)} left</Text>
            )}
          </View>

          {/* THE BAR */}
          <View style={styles.bar}>
            {todayTasks.map((task) => {
              const mins = task.estimatedMinutes || 15;
              const widthPct = Math.min((mins / barCapacity) * 100, 100);
              const color = colorMap.get(task.id) || BLOCK_COLORS[0];

              return (
                <View
                  key={task.id}
                  style={[
                    styles.block,
                    {
                      width: `${widthPct}%` as unknown as number,
                      backgroundColor: color,
                    },
                  ]}
                >
                  <Text style={styles.blockLabel} numberOfLines={1}>
                    {task.title}
                  </Text>
                </View>
              );
            })}

            {/* Overflow glow */}
            {isOver && (
              <View style={styles.overflowEdge}>
                <Animated.View style={[styles.overflowGlow, { opacity: pulseAnim }]} />
              </View>
            )}
          </View>

          {/* Time markers */}
          <View style={styles.canvasMarkers}>
            <Text style={styles.markerText}>0</Text>
            <Text style={styles.markerText}>{formatMins(totalAvailableMinutes)}</Text>
          </View>
        </View>

        {/* ── 3. TASK ZONES ───────────────────────────────────── */}

        {/* Zero tasks empty state */}
        {!hasTasks && (
          <View style={styles.emptyTaskState}>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
              onPress={onAddPress}
            >
              <Plus size={20} color={BRAND.colors.mossGreen} />
              <Text style={styles.addButtonText}>Add a task</Text>
            </Pressable>
          </View>
        )}

        {/* TODAY ZONE (selected tasks) */}
        {todayTasks.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDotGreen} />
              <Text style={styles.sectionLabelGreen}>TODAY</Text>
            </View>
            {todayTasks.map((task) => {
              const color = colorMap.get(task.id) || BLOCK_COLORS[0];
              return (
                <Pressable
                  key={task.id}
                  style={({ pressed }) => [
                    styles.todayCard,
                    { borderLeftColor: color },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => handleToggle(task)}
                  onLongPress={() => onTaskPress(task)}
                >
                  <View style={[styles.todayDot, { backgroundColor: color }]} />
                  <View style={styles.todayInfo}>
                    <Text style={styles.todayTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    {task.metadata?.label ? (
                      <Text style={styles.todayMeta}>{task.metadata.label}</Text>
                    ) : null}
                  </View>
                  <View style={styles.timePill}>
                    <Text style={styles.timePillText}>{formatPill(task.estimatedMinutes)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {/* AVAILABLE ZONE (unselected tasks) */}
        {availableTasks.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: todayTasks.length > 0 ? 16 : 0 }]}>
              <View style={styles.sectionDotMuted} />
              <Text style={styles.sectionLabelMuted}>AVAILABLE</Text>
            </View>

            {showAvailableSubLabels && availableTodos.length > 0 && (
              <Text style={styles.subLabel}>Todos</Text>
            )}
            {availableTodos.map((task) => (
              <AvailableRow
                key={task.id}
                task={task}
                onToggle={handleToggle}
                onLongPress={onTaskPress}
              />
            ))}

            {showAvailableSubLabels && availableHabits.length > 0 && (
              <Text style={styles.subLabel}>Habits</Text>
            )}
            {availableHabits.map((task) => (
              <AvailableRow
                key={task.id}
                task={task}
                onToggle={handleToggle}
                onLongPress={onTaskPress}
              />
            ))}

            {/* When only one type exists, render whichever is non-empty already handled above */}
          </>
        )}
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
// AvailableRow sub-component
// ═══════════════════════════════════════════════════════════════════

function AvailableRow({
  task,
  onToggle,
  onLongPress,
}: {
  task: TaskItemData;
  onToggle: (t: TaskItemData) => void;
  onLongPress: (t: TaskItemData) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.availableRow,
        pressed && { backgroundColor: 'rgba(46,85,64,0.04)' },
      ]}
      onPress={() => onToggle(task)}
      onLongPress={() => onLongPress(task)}
    >
      <View style={styles.availableCircle} />
      <Text style={styles.availableTitle} numberOfLines={1}>
        {task.title}
      </Text>
      <Text style={styles.availableTime}>{formatPill(task.estimatedMinutes)}</Text>
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
  },
  subtitleAccent: {
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },

  // ── Time Canvas ─────────────────────────────────────────────────
  canvas: {
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 24,
    backgroundColor: '#F3F1EC',
    borderRadius: 12,
    padding: 14,
    overflow: 'hidden',
  },
  canvasLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  canvasLabelLeft: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  canvasLabelRight: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  canvasLabelOver: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C45B4A',
  },
  bar: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#E8E4DD',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  block: {
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  blockLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  overflowEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  overflowGlow: {
    flex: 1,
    backgroundColor: '#C45B4A',
  },
  canvasMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  markerText: {
    fontSize: 10,
    color: BRAND.colors.inkMuted,
    opacity: 0.5,
  },

  // ── Section headers ─────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.colors.mossGreen,
  },
  sectionLabelGreen: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: BRAND.colors.mossGreen,
  },
  sectionDotMuted: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  sectionLabelMuted: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: BRAND.colors.inkMuted,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    opacity: 0.5,
    marginLeft: 20,
    marginBottom: 4,
    marginTop: 8,
  },

  // ── Today cards (selected) ──────────────────────────────────────
  todayCard: {
    backgroundColor: '#FEFDFB',
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  todayInfo: {
    flex: 1,
  },
  todayTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  todayMeta: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  timePill: {
    backgroundColor: 'rgba(46,85,64,0.08)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  timePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // ── Available rows (unselected) ─────────────────────────────────
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 4,
    borderRadius: 10,
  },
  availableCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: 'transparent',
    marginRight: 10,
  },
  availableTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk,
    opacity: 0.65,
  },
  availableTime: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    opacity: 0.5,
  },

  // ── Empty state ─────────────────────────────────────────────────
  emptyTaskState: {
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
