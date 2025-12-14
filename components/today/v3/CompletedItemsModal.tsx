/**
 * CompletedItemsModal - Modal for reviewing completed items in Today's Focus
 *
 * Shows completed habits and todos for the day with actions:
 * - Keep: No-op, just dismiss
 * - Move to tomorrow: Sets carry_forward = true for todos
 * - Archive: Archives the item
 *
 * Title adapts based on time of day:
 * - Morning (6am-11am): "Daily Review"
 * - Midday/Evening: "Evening Review"
 */

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useRepo } from '../../../providers/RepoProvider';
import type { TodayMergedEntry } from '../../../lib/today/hooks/useTodayEntries';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

type TimeWindow = 'morning' | 'midday' | 'evening';

export type CompletedItemsModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Completed items from today (doneItems from useTodayEntries) */
  completedItems: TodayMergedEntry[];
  /** Called after an action is taken, to refresh the list */
  onActionComplete?: () => Promise<void>;
  /** Called after modal closes with summary of actions taken */
  onSweepComplete?: (summary: { archived: number; total: number }) => void;
};

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Determines time window based on current hour
 */
function getTimeWindow(date: Date = new Date()): TimeWindow {
  const hour = date.getHours();

  if (hour >= 6 && hour < 11) {
    return 'morning';
  } else if (hour >= 11 && hour < 17) {
    return 'midday';
  } else if (hour >= 17 && hour < 24) {
    return 'evening';
  }

  return 'morning';
}

/**
 * Get review title based on time of day
 */
function getReviewTitle(): string {
  const timeWindow = getTimeWindow();
  return timeWindow === 'morning' ? 'Daily Review' : 'Evening Review';
}

/**
 * Get subtitle with proper pluralization
 */
function getReviewSubtitle(count: number): string {
  if (count === 0) return 'No completed items to review.';
  if (count === 1) return 'Review 1 completed item from today.';
  return `Review ${count} completed items from today.`;
}

/**
 * Get type label for display
 */
function getTypeLabel(type: 'habit' | 'todo'): string {
  return type === 'habit' ? 'Habit' : 'Todo';
}

// ───────────────────────────────────────────────────────────────────────────────
// CompletedItemRow - Individual item with action buttons
// ───────────────────────────────────────────────────────────────────────────────

type CompletedItemRowProps = {
  item: TodayMergedEntry;
  onKeep: () => void;
  onMoveToTomorrow: () => void;
  onArchive: () => void;
  isLoading?: boolean;
};

function CompletedItemRow({
  item,
  onKeep,
  onMoveToTomorrow,
  onArchive,
  isLoading,
}: CompletedItemRowProps) {
  return (
    <Card padding="sm" testID={`completed-item-${item.id}`}>
      <Box gap={2}>
        {/* Item info */}
        <Box row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box style={{ flex: 1, marginRight: 8 }}>
            <Text variant="body" numberOfLines={2}>
              {item.name}
            </Text>
            <Text variant="subtle" style={{ fontSize: 12, marginTop: 2 }}>
              {getTypeLabel(item.type)}
            </Text>
          </Box>
        </Box>

        {/* Action buttons */}
        <Box row style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button
            title="Keep"
            variant="neutral"
            size="sm"
            onPress={onKeep}
            disabled={isLoading}
            testID={`completed-keep-${item.id}`}
          />
          {/* Only show "Move to tomorrow" for todos (habits don't support carry_forward) */}
          {item.type === 'todo' && (
            <Button
              title="Tomorrow"
              variant="neutral"
              size="sm"
              onPress={onMoveToTomorrow}
              disabled={isLoading}
              testID={`completed-tomorrow-${item.id}`}
            />
          )}
          <Button
            title="Archive"
            variant="danger"
            size="sm"
            onPress={onArchive}
            disabled={isLoading}
            testID={`completed-archive-${item.id}`}
          />
        </Box>
      </Box>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// CompletedItemsModal - Main component
// ───────────────────────────────────────────────────────────────────────────────

export function CompletedItemsModal({
  visible,
  onClose,
  completedItems,
  onActionComplete,
  onSweepComplete,
}: CompletedItemsModalProps) {
  const repo = useRepo();

  // Track actions taken during this session
  const actionsRef = useRef<{ archived: number; total: number }>({ archived: 0, total: 0 });

  // Reset counters when modal opens
  useEffect(() => {
    if (visible) {
      actionsRef.current = { archived: 0, total: 0 };
    }
  }, [visible]);

  const title = useMemo(() => getReviewTitle(), []);
  const subtitle = useMemo(() => getReviewSubtitle(completedItems.length), [completedItems.length]);
  const hasItems = completedItems.length > 0;

  const handleKeep = useCallback(
    (id: string) => {
      // Keep is a no-op for the item, but we track it and close/refresh
      actionsRef.current.total += 1;
      void onActionComplete?.();
    },
    [onActionComplete],
  );

  const handleMoveToTomorrow = useCallback(
    async (id: string, type: 'habit' | 'todo') => {
      try {
        // Use sweepApplyAction with carry_forward action
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (repo as any).sweepApplyAction?.(id, type, 'carry_forward');
        actionsRef.current.total += 1;
        await onActionComplete?.();
      } catch (e) {
        console.warn('[CompletedItemsModal] move to tomorrow failed:', e);
      }
    },
    [repo, onActionComplete],
  );

  const handleArchive = useCallback(
    async (id: string, type: 'habit' | 'todo') => {
      try {
        // Use sweepApplyAction with archive action
        // Note: 'manual' reason since this is from review modal, not Sweep swipe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (repo as any).sweepApplyAction?.(id, type, 'archive', { archived_reason: 'manual' });
        actionsRef.current.total += 1;
        actionsRef.current.archived += 1;
        await onActionComplete?.();
      } catch (e) {
        console.warn('[CompletedItemsModal] archive failed:', e);
      }
    },
    [repo, onActionComplete],
  );

  // Handle Done button - close modal and notify parent with summary
  const handleDone = useCallback(() => {
    const summary = { ...actionsRef.current };
    onClose();
    // Fire callback after close so toast shows after modal dismisses
    if (onSweepComplete && summary.total > 0) {
      setTimeout(() => onSweepComplete(summary), 100);
    }
  }, [onClose, onSweepComplete]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="completed-items-modal"
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Card
            padding="md"
            style={{ borderRadius: BRAND.radius.xl, backgroundColor: BRAND.colors.linenCream }}
          >
            <Box gap={2}>
              <Text variant="title">{title}</Text>
              <Text variant="subtle">{subtitle}</Text>

              <ScrollView style={{ maxHeight: 420 }}>
                <Box gap={2}>
                  {!hasItems ? (
                    <Box style={{ paddingVertical: 24 }}>
                      <Text variant="body" style={{ textAlign: 'center' }}>
                        Nothing completed yet — all clear!
                      </Text>
                    </Box>
                  ) : (
                    completedItems.map((item) => (
                      <CompletedItemRow
                        key={item.id}
                        item={item}
                        onKeep={() => handleKeep(item.id)}
                        onMoveToTomorrow={() => void handleMoveToTomorrow(item.id, item.type)}
                        onArchive={() => void handleArchive(item.id, item.type)}
                      />
                    ))
                  )}
                </Box>
              </ScrollView>

              <Box row style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button
                  title="Done"
                  variant="primary"
                  onPress={handleDone}
                  testID="completed-items-done"
                />
              </Box>
            </Box>
          </Card>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    padding: 16,
  },
});

export default CompletedItemsModal;
