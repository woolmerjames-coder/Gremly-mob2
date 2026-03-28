/**
 * TaskQuickActionSheet
 *
 * Slide-up bottom sheet for task quick actions in Morning Brief.
 * Replaces the old center-modal TimeBlockPicker with a richer UX:
 *   • Horizontal block pills (Morning / Afternoon / Evening) with available-minutes
 *   • Time slot picker — shows gaps within the selected block
 *   • Lock-in toggle
 *   • Remind me
 *   • "Not today" dismiss
 *   • Unschedule (for slotted tasks)
 *   • Open full details
 *
 * Pattern follows EventQuickActionSheet (slide-up, overlay, card with handle).
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Sunrise,
  Sun,
  Sunset,
  Diamond,
  EyeOff,
  Bell,
  Clock,
  Check,
  Undo2,
} from 'lucide-react-native';
import type { TaskItemData } from './TaskItem';
import type { TimeBlock } from '../../../../lib/capacity';
import { getTimeBlockBoundaries } from '../../../../lib/capacity';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { getDateService } from '../../../../lib/date';

/* ─── design tokens (match EventQuickActionSheet) ─── */

const SAGE = '#6A7D76';
const SAGE_TINT = '#F0F4F3';
const MOSS = '#2E5540';
const CHARCOAL = '#222222';
const MUTED = '#888888';
const DIVIDER = '#F0EDE8';
const DANGER_MUTED = '#9E3B3B';
const HANDLE_COLOR = '#D5D2CC';
const PRESSED_BG = '#F9F6F1';

/* ─── pill icon colours (warm palette from TimeBlockPicker) ─── */
const BLOCK_ICON_COLORS: Record<TimeBlock, string> = {
  morning: '#D4A574',
  day: '#C9956C',
  evening: '#A89BC9',
};

const BLOCK_ICONS: Record<TimeBlock, React.ComponentType<{ size: number; color: string }>> = {
  morning: Sunrise,
  day: Sun,
  evening: Sunset,
};

const BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'Morning',
  day: 'Afternoon',
  evening: 'Evening',
};

/* ─── helpers ─── */

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function blockSubtitle(
  block: TimeBlock,
  boundaries: ReturnType<typeof getTimeBlockBoundaries>,
): string {
  const b = boundaries[block];
  return `${formatHour(b.startHour)} – ${formatHour(b.endHour)}`;
}

/** Format minutes into compact "Xh Ym" label */
function formatAvailMinutes(mins: number): string {
  if (mins <= 0) return 'Full';
  if (mins < 60) return `${mins}m free`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h free` : `${h}h ${m}m free`;
}

/** Format ISO string to "h:mm AM" */
function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Format duration in minutes for slot row */
function formatSlotDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/* ─── types ─── */

export interface GapSlot {
  block: TimeBlock;
  startIso: string;
  endIso: string;
  durationMinutes: number;
}

export interface TaskQuickActionSheetProps {
  visible: boolean;
  task: TaskItemData | null;
  /** Is this task currently slotted into a gap? */
  isSlotted?: boolean;
  onClose: () => void;
  /** Assign / re-assign to a time block (no specific slot) */
  onAssignBlock: (
    taskId: string,
    taskType: 'todo' | 'habit',
    timeWindow: TimeBlock | 'any',
    lockIn: boolean,
  ) => void;
  /** Assign task to a specific time slot */
  onAssignSlot: (
    taskId: string,
    taskType: 'todo' | 'habit',
    startIso: string,
    block: TimeBlock,
  ) => void;
  /** Unslot (remove from gap) */
  onUnschedule?: (taskId: string, taskType: 'todo' | 'habit') => void;
  /** Hide for today / tomorrow */
  onNotToday: (taskId: string) => void;
  /** Toggle lock-in state */
  onToggleLock: (taskId: string, taskType: 'todo' | 'habit', lockIn: boolean) => void;
  /** Is the task currently locked in? */
  isLocked?: boolean;
  /** Target date (defaults to today; pass tomorrow's date for evening planning) */
  targetDate?: string;
  /** Available gaps across all blocks */
  gaps: GapSlot[];
  /** Available minutes per block */
  blockAvailability: { morning: number; day: number; evening: number };
  /** Open the reminder picker */
  onRemind?: (taskId: string) => void;
  /** Open full task details */
  onOpenDetails?: (task: TaskItemData) => void;
}

/* ─── component ─── */

export function TaskQuickActionSheet({
  visible,
  task,
  isSlotted = false,
  onClose,
  onAssignBlock,
  onAssignSlot,
  onUnschedule,
  onNotToday,
  onToggleLock,
  isLocked = false,
  targetDate,
  gaps,
  blockAvailability,
  onRemind,
  onOpenDetails,
}: TaskQuickActionSheetProps) {
  const insets = useSafeAreaInsets();
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);

  const boundaries = useMemo(
    () => getTimeBlockBoundaries(timeBlockPreferences),
    [timeBlockPreferences],
  );

  const blockKeys: TimeBlock[] = ['morning', 'day', 'evening'];

  // Local selection state — pill selection doesn't immediately assign
  const currentBlock = task?.timeWindow as TimeBlock | 'any' | null | undefined;
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);

  // Reset selected block when task changes (useEffect avoids render-phase setState)
  const prevTaskIdRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (task?.id !== prevTaskIdRef.current) {
      prevTaskIdRef.current = task?.id ?? null;
      const block = task?.timeWindow as TimeBlock | 'any' | null | undefined;
      setSelectedBlock(block && block !== 'any' ? (block as TimeBlock) : null);
    }
  }, [task?.id, task?.timeWindow]);

  // Gaps filtered to the selected block, excluding past time slots
  const blockGaps = useMemo(() => {
    if (!selectedBlock) return [];
    const now = getDateService().now();
    return gaps
      .filter((g) => g.block === selectedBlock)
      .map((g) => {
        const gapEnd = new Date(g.endIso);
        // Fully in the past — drop entirely
        if (gapEnd <= now) return null;

        const gapStart = new Date(g.startIso);
        if (gapStart < now) {
          // Partially past — clip start to next 5-minute mark
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const roundedUp = Math.ceil(nowMins / 5) * 5;
          const clipped = new Date(now);
          clipped.setHours(Math.floor(roundedUp / 60), roundedUp % 60, 0, 0);
          const clippedDuration = Math.round((gapEnd.getTime() - clipped.getTime()) / 60000);
          if (clippedDuration < 5) return null; // Too small after clipping
          return { ...g, startIso: clipped.toISOString(), durationMinutes: clippedDuration };
        }
        return g;
      })
      .filter((g): g is GapSlot => g !== null);
  }, [gaps, selectedBlock]);

  // First gap that fits the task estimate
  const recommendedIdx = useMemo(() => {
    if (!task?.estimatedMinutes) return -1;
    return blockGaps.findIndex((g) => g.durationMinutes >= task.estimatedMinutes!);
  }, [blockGaps, task?.estimatedMinutes]);

  if (!task) return null;

  const handleBlockPress = (block: TimeBlock) => {
    if (selectedBlock === block) {
      // User is DESELECTING — unassign the task entirely
      onAssignBlock(task.id, task.type, 'any', false);
      onUnschedule?.(task.id, task.type);
      onClose();
      return;
    }
    // User is selecting a different block
    setSelectedBlock(block);
  };

  const handleSlotPress = (gap: GapSlot) => {
    // Also assign to the block's time window + slot into gap
    onAssignBlock(task.id, task.type, gap.block, isLocked);
    onAssignSlot(task.id, task.type, gap.startIso, gap.block);
    onClose();
  };

  const handleAssignBlockOnly = () => {
    if (!selectedBlock) return;
    onAssignBlock(task.id, task.type, selectedBlock, isLocked);
    onClose();
  };

  const handleLockToggle = (v: boolean) => {
    onToggleLock(task.id, task.type, v);
  };

  const handleNotToday = () => {
    onNotToday(task.id);
    onClose();
  };

  const handleUnschedule = () => {
    // Clear both time_window and scheduled_start_iso
    onAssignBlock(task.id, task.type, 'any', false);
    onUnschedule?.(task.id, task.type);
    onClose();
  };

  const handleRemind = () => {
    onRemind?.(task.id);
    onClose();
  };

  const handleOpenDetails = () => {
    onOpenDetails?.(task);
    onClose();
  };

  /* ─── subtitle derived from current assignment ─── */
  const subtitleText = isSlotted
    ? 'Scheduled into a time slot'
    : currentBlock && currentBlock !== 'any'
      ? `Assigned to ${BLOCK_LABELS[currentBlock as TimeBlock] ?? currentBlock}`
      : 'Flexible – not yet assigned';

  /* ─── slot list empty state ─── */
  const hasRecommended = recommendedIdx >= 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* dim overlay */}
        <Pressable style={styles.overlay} onPress={onClose} />

        {/* card */}
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {task.title}
            </Text>
            <Text style={styles.headerSubtitle}>{subtitleText}</Text>
          </View>
          <View style={styles.headerDivider} />

          {/* ── Block pills ── */}
          <View style={styles.pillRow}>
            {blockKeys.map((block) => {
              const Icon = BLOCK_ICONS[block];
              const selected = selectedBlock === block;
              const availMin = blockAvailability[block];
              return (
                <Pressable
                  key={block}
                  style={[styles.pill, selected && styles.pillSelected]}
                  onPress={() => handleBlockPress(block)}
                >
                  <Icon size={18} color={selected ? '#FFFFFF' : BLOCK_ICON_COLORS[block]} />
                  <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
                    {BLOCK_LABELS[block]}
                  </Text>
                  <Text style={[styles.pillSub, selected && styles.pillSubSelected]}>
                    {blockSubtitle(block, boundaries)}
                  </Text>
                  <Text style={[styles.pillAvail, selected && styles.pillAvailSelected]}>
                    {formatAvailMinutes(availMin)}
                  </Text>
                  {selected && (
                    <View style={styles.pillCheck}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* ── Time slot list (when a block is selected) ── */}
          {selectedBlock && (
            <>
              <View style={styles.sectionDivider} />
              <Text style={styles.slotSectionHeader}>Available slots</Text>

              {blockGaps.length > 0 ? (
                <>
                  <ScrollView style={styles.slotScroll} nestedScrollEnabled>
                    {blockGaps.map((gap, idx) => {
                      const isRecommended = idx === recommendedIdx;
                      return (
                        <Pressable
                          key={gap.startIso}
                          style={({ pressed }) => [
                            styles.slotRow,
                            pressed && { backgroundColor: PRESSED_BG },
                          ]}
                          onPress={() => handleSlotPress(gap)}
                        >
                          <Clock size={14} color={MUTED} style={styles.slotIcon} />
                          <Text style={styles.slotTime}>
                            {formatTimeShort(gap.startIso)} – {formatTimeShort(gap.endIso)}
                          </Text>
                          <View style={styles.slotRight}>
                            {isRecommended && (
                              <View style={styles.recommendedBadge}>
                                <Text style={styles.recommendedText}>Recommended</Text>
                              </View>
                            )}
                            <Text style={styles.slotDuration}>
                              {formatSlotDuration(gap.durationMinutes)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Hint when no slot fully fits */}
                  {!hasRecommended && task.estimatedMinutes && (
                    <Text style={styles.slotHint}>
                      No slots fully fit — pick one and Gremly will make it work
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.slotHint}>No free time in this block</Text>
              )}

              {/* Block-only assignment CTA */}
              <Pressable
                style={({ pressed }) => [styles.assignBlockOnly, pressed && { opacity: 0.7 }]}
                onPress={handleAssignBlockOnly}
              >
                <Text style={styles.assignBlockOnlyText}>
                  Assign to {BLOCK_LABELS[selectedBlock]} without a specific time
                </Text>
              </Pressable>
            </>
          )}

          <View style={styles.sectionDivider} />

          {/* ── Back to priorities (only for block-assigned or slotted tasks) ── */}
          {(isSlotted || (currentBlock && currentBlock !== 'any')) && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && { backgroundColor: PRESSED_BG },
                ]}
                onPress={handleUnschedule}
              >
                <View style={styles.actionIcon}>
                  <Undo2 size={18} color="#C27A6B" />
                </View>
                <Text style={[styles.actionLabel, { color: '#C27A6B', fontWeight: '600' }]}>
                  Back to priorities
                </Text>
              </Pressable>
              <View style={styles.rowDivider} />
            </>
          )}

          {/* ── Lock-in toggle ── */}
          <View style={styles.actionRow}>
            <View style={styles.actionIcon}>
              <Diamond size={18} color={MOSS} />
            </View>
            <Text style={styles.actionLabel}>Lock this in</Text>
            <Switch
              value={isLocked}
              onValueChange={handleLockToggle}
              trackColor={{ false: DIVIDER, true: MOSS }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.rowDivider} />

          {/* ── Remind me ── */}
          {onRemind && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && { backgroundColor: PRESSED_BG },
                ]}
                onPress={handleRemind}
              >
                <View style={styles.actionIcon}>
                  <Bell size={18} color={SAGE} />
                </View>
                <Text style={styles.actionLabel}>Remind me</Text>
              </Pressable>
              <View style={styles.rowDivider} />
            </>
          )}

          {/* ── Not today ── */}
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: PRESSED_BG }]}
            onPress={handleNotToday}
          >
            <View style={styles.actionIcon}>
              <EyeOff size={18} color={DANGER_MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: DANGER_MUTED }]}>
                {targetDate ? 'Not tomorrow' : 'Not today'}
              </Text>
              <Text style={styles.actionDetail}>
                {task.type === 'habit'
                  ? targetDate
                    ? 'Skip for tomorrow'
                    : 'Skip for today, back tomorrow'
                  : targetDate
                    ? 'Skip for tomorrow'
                    : 'Hide for now — sweep will check in'}
              </Text>
            </View>
          </Pressable>

          {/* ── Open full details ── */}
          {onOpenDetails && (
            <Pressable
              style={({ pressed }) => [styles.detailsBtn, pressed && { opacity: 0.7 }]}
              onPress={handleOpenDetails}
            >
              <Text style={styles.detailsBtnText}>Open full details</Text>
            </Pressable>
          )}

          {/* ── Done ── */}
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
          >
            <Text style={styles.cancelBtnText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─── styles ─── */

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  /* handle */
  handleRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HANDLE_COLOR,
  },

  /* header */
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: CHARCOAL,
  },
  headerSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: DIVIDER,
  },

  /* block pills */
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: SAGE_TINT,
  },
  pillSelected: {
    backgroundColor: MOSS,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: CHARCOAL,
    marginTop: 4,
  },
  pillLabelSelected: {
    color: '#FFFFFF',
  },
  pillSub: {
    fontSize: 10,
    color: MUTED,
    marginTop: 1,
  },
  pillSubSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  pillAvail: {
    fontSize: 10,
    color: MUTED,
    marginTop: 2,
  },
  pillAvailSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  pillCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
  },

  /* slot section */
  slotSectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  slotScroll: {
    maxHeight: 160,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  slotIcon: {
    marginRight: 8,
  },
  slotTime: {
    fontSize: 13,
    color: CHARCOAL,
    flex: 1,
  },
  slotRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotDuration: {
    fontSize: 12,
    color: MUTED,
  },
  recommendedBadge: {
    backgroundColor: 'rgba(46,85,64,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: 10,
    color: MOSS,
    fontWeight: '500',
  },
  slotHint: {
    fontSize: 12,
    color: MUTED,
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  assignBlockOnly: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  assignBlockOnlyText: {
    fontSize: 13,
    color: SAGE,
    textAlign: 'center',
  },

  /* section divider */
  sectionDivider: {
    height: 1,
    backgroundColor: DIVIDER,
  },

  /* action rows (match EventQuickActionSheet) */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIcon: {
    marginRight: 14,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: CHARCOAL,
    flex: 1,
  },
  actionDetail: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: DIVIDER,
    marginLeft: 50,
  },

  /* footer buttons */
  detailsBtn: {
    backgroundColor: SAGE_TINT,
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: MOSS,
  },
  cancelBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
  },
});
