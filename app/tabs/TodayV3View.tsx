import React, { useState } from 'react';
import { Screen, Box, Text, Button } from '../../ui';
import FocusCard from '../../components/today/v3/FocusCard';
import TaskHabitStack from '../../components/today/v3/TaskHabitStack';
import DropZoneCard from '../../components/today/v3/DropZoneCard';
import SweepPreviewFooter from '../../components/today/v3/SweepPreviewFooter';
import FocusPickerModal from '../../components/today/v3/FocusPickerModal';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useRepo } from '../../providers/RepoProvider';

export default function TodayV3View() {
  const overlay = useUnifiedOverlayController();
  const repo = useRepo();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);

  const handleViewFocus = async (
    entryId: string | null,
    entryType: 'todo' | 'habit' | 'note' | null,
  ) => {
    if (!entryId || !entryType) return;
    try {
      const rec = await (repo as any).getById?.(entryId);
      const initialEntity = {
        type: entryType,
        id: (rec?.id as string | undefined) ?? entryId,
        subtype:
          ((rec as { subtype?: string | null })?.subtype as string | null | undefined) ?? null,
      };
      overlay.openCreate({
        type: entryType,
        initialEntity,
      });
    } catch {
      overlay.openCreate({ type: entryType });
    }
  };

  return (
    <Screen title="Today" scroll padded testID="today-v3-screen">
      <Box gap={4}>
        <Box gap={1}>
          <Text variant="display">Today</Text>
          <Text variant="subtle">Small wins add up fast.</Text>
        </Box>

        <FocusCard
          onView={handleViewFocus}
          onChange={() => setPickerOpen(true)}
          onClear={() => {}}
        />

        <TaskHabitStack />

        <DropZoneCard onViewDrops={() => overlay.openCreate({ type: 'note' })} />

        <Box>
          <Button title="Add More" variant="neutral" onPress={() => overlay.openCreate()} />
        </Box>

        <SweepPreviewFooter onStart={() => setSweepOpen(true)} onPeek={() => setSweepOpen(true)} />
      </Box>

      <FocusPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <SweepDrawer visible={sweepOpen} onClose={() => setSweepOpen(false)} />
    </Screen>
  );
}
