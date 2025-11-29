import React, { useMemo, useState, useCallback } from 'react';
import { Screen, Box, Button } from '../../ui';
import FocusCard from '../../components/today/v3/FocusCard';
import TaskHabitStack from '../../components/today/v3/TaskHabitStack';
import DropZoneCard from '../../components/today/v3/DropZoneCard';
import SweepPreviewFooter from '../../components/today/v3/SweepPreviewFooter';
import FocusPickerModal from '../../components/today/v3/FocusPickerModal';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import TodayHeader from '../../components/today/v3/TodayHeader';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useCommitments } from '../../lib/today/hooks/useCommitments';
import CommitmentsSection from '../today/CommitmentsSection';
import { useRepo } from '../../providers/RepoProvider';
import { eventBus } from '../../lib/events';
import { useActionToast } from '../../src/hooks/useActionToast';

export default function TodayV3View() {
  const overlay = useUnifiedOverlayController();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);
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

  return (
    <Screen scroll padded testID="today-v3-screen">
      <Box gap={4}>
        {showCommitments && (
          <CommitmentsSection items={commitmentItems} onRemove={handleRemoveCommitment} />
        )}
        <TodayHeader />

        <Box testID="today-hero">
          <FocusCard onChange={() => setPickerOpen(true)} onClear={() => {}} />
        </Box>

        <TaskHabitStack />

        <DropZoneCard onViewDrops={() => overlay.openCreate({ type: 'unsorted' })} />

        <Box style={{ alignItems: 'center', marginTop: 8 }}>
          <Button label="Add More" variant="primary" onPress={() => overlay.openCreate()} />
        </Box>

        <SweepPreviewFooter onStart={() => setSweepOpen(true)} onPeek={() => setSweepOpen(true)} />
      </Box>

      <FocusPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <SweepDrawer
        visible={sweepOpen}
        onClose={() => setSweepOpen(false)}
        onSweepComplete={handleSweepComplete}
      />

      {Toast}
    </Screen>
  );
}
