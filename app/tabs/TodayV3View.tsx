import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Screen, Box, Button } from '../../ui';
import FocusCard from '../../components/today/v3/FocusCard';
import TaskHabitStack from '../../components/today/v3/TaskHabitStack';
import DropZoneCard from '../../components/today/v3/DropZoneCard';
import SweepPreviewFooter from '../../components/today/v3/SweepPreviewFooter';
import FocusPickerModal from '../../components/today/v3/FocusPickerModal';
import TodayHeader from '../../components/today/v3/TodayHeader';
import CompletedItemsModal from '../../components/today/v3/CompletedItemsModal';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useCommitments } from '../../lib/today/hooks/useCommitments';
import { useTodayTodos, useTodayHabits, useCompletedToday } from '../../lib/store/selectors';
import { isHabitLockedIn } from '../../lib/store/useGremlyStore';
import {
  getTodayCompletionSummary,
  type TodayMergedEntry,
} from '../../lib/today/hooks/useTodayEntries';
import CommitmentsSection from '../today/CommitmentsSection';
import { useRepo } from '../../providers/RepoProvider';
import { eventBus } from '../../lib/events';
import { useActionToast } from '../../src/hooks/useActionToast';
import type { TodayProgressItem } from '../../components/today/v3/TodayProgressHeader';

/** Duration to show glow effect after item completion (ms) */
const GLOW_DURATION_MS = 800;

export default function TodayV3View() {
  const overlay = useUnifiedOverlayController();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [completedModalOpen, setCompletedModalOpen] = useState(false);
  const [justCompletedIds, setJustCompletedIds] = useState<string[]>([]);
  const glowTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const repo = useRepo();
  const { showToast, Toast } = useActionToast();
  const commitmentsEnabled = useMemo(
    () => (process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS ?? 'on').toLowerCase(),
    [],
  );
  const showCommitments = useMemo(
    () => ['on', 'true', '1'].includes(commitmentsEnabled),
    [commitmentsEnabled],
  );
  const { items: commitmentItems } = useCommitments(showCommitments);

  // Get today's entries from Zustand store
  const todayTodos = useTodayTodos();
  const todayHabits = useTodayHabits();
  const completedItems = useCompletedToday();

  // Convert store data to TodayMergedEntry format for compatibility
  const activeItems: TodayMergedEntry[] = useMemo(
    () => [
      ...todayTodos
        .filter((t) => !t.completed_at)
        .map((t) => ({
          type: 'todo' as const,
          id: t.id,
          name: t.title || '',
          due_date: t.due_date,
          due_day: t.due_day,
          space_id: t.space_id,
          tags: t.tags ?? [],
          completed_at: t.completed_at,
          commitment: t.commitment,
        })),
      ...todayHabits.map((h) => ({
        type: 'habit' as const,
        id: h.id,
        name: h.name,
        space_id: h.space_id,
        tags: h.tags ?? [],
        commitment: isHabitLockedIn(h),
      })),
    ],
    [todayTodos, todayHabits],
  );

  // Completed items today (from store selector)
  const doneItems: TodayMergedEntry[] = useMemo(
    () =>
      completedItems.map((item) => ({
        type: item.type as 'todo' | 'habit',
        id: item.id,
        name: item.type === 'todo' ? (item as any).title : (item as any).name,
        completed_at:
          item.type === 'todo'
            ? (item as any).completed_at
            : ((item as any).last_completed_at ?? null),
      })),
    [completedItems],
  );

  // Compute completion summary using shared helper
  const completion = useMemo(
    () => getTodayCompletionSummary(activeItems, doneItems),
    [activeItems, doneItems],
  );

  // Convert completion items to TodayProgressItem format for the header dots
  const progressItems: TodayProgressItem[] = useMemo(() => {
    return completion.items.map((item) => ({
      id: item.id,
      type: item.type,
      done: item.isDone,
    }));
  }, [completion.items]);

  // Track completions for glow effect
  // ItemCompleted fires AFTER the 2s undo window and DB persistence
  useEffect(() => {
    const unsubscribe = eventBus.on('ItemCompleted', ({ id }) => {
      // Add to justCompletedIds for temporary glow effect
      setJustCompletedIds((prev) => {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      });

      // Clear any existing timeout for this id
      const existingTimeout = glowTimeoutsRef.current.get(id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Remove from justCompletedIds after glow duration
      const timeoutId = setTimeout(() => {
        setJustCompletedIds((prev) => prev.filter((itemId) => itemId !== id));
        glowTimeoutsRef.current.delete(id);
      }, GLOW_DURATION_MS);

      glowTimeoutsRef.current.set(id, timeoutId);
    });

    return () => {
      unsubscribe();
      // Clean up all glow timeouts on unmount
      glowTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      glowTimeoutsRef.current.clear();
    };
  }, []);

  const handleRemoveCommitment = useCallback(
    async (id: string, type: 'habit' | 'todo') => {
      await repo.removeCommitment(id, type);
      eventBus.emit('CommitmentsChanged', {});
    },
    [repo],
  );

  // Handle sweep complete - show appropriate toast after modal closes
  const handleSweepComplete = useCallback(
    (summary: { archived: number; total: number }) => {
      if (summary.archived > 0) {
        showToast({ type: 'success', content: "Everything's where it should be." });
      } else if (summary.total > 0) {
        showToast({ type: 'success', content: "You're all set for today." });
      }
    },
    [showToast],
  );

  // Open completed items modal when progress bar is tapped
  const handleProgressPress = useCallback(() => {
    setCompletedModalOpen(true);
  }, []);

  // Convert justCompletedIds array to Set for the header
  const justCompletedIdsSet = useMemo(() => new Set(justCompletedIds), [justCompletedIds]);

  return (
    <Screen scroll padded testID="today-v3-screen">
      <Box gap={4}>
        {showCommitments && (
          <CommitmentsSection items={commitmentItems} onRemove={handleRemoveCommitment} />
        )}
        <TodayHeader
          completedCount={completion.completedCount}
          totalCount={completion.totalCount}
          items={progressItems}
          justCompletedIds={justCompletedIdsSet}
          onProgressPress={handleProgressPress}
        />

        <Box testID="today-hero">
          <FocusCard onChange={() => setPickerOpen(true)} onClear={() => {}} />
        </Box>

        <TaskHabitStack />

        <DropZoneCard onViewDrops={() => overlay.openCreate({ type: 'unsorted' })} />

        <Box style={{ alignItems: 'center', marginTop: 8 }}>
          <Button label="Add More" variant="primary" onPress={() => overlay.openCreate()} />
        </Box>

        <SweepPreviewFooter
          onStart={() => setCompletedModalOpen(true)}
          onPeek={() => setCompletedModalOpen(true)}
          completedTodayCount={doneItems.length}
        />
      </Box>

      <FocusPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <CompletedItemsModal
        visible={completedModalOpen}
        onClose={() => setCompletedModalOpen(false)}
        completedItems={doneItems}
        onSweepComplete={handleSweepComplete}
      />

      {Toast}
    </Screen>
  );
}
