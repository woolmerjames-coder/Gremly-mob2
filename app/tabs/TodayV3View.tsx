import React, { useState } from 'react';
import { Screen, Box, Text, Button } from '../../ui';
import FocusCard from '../../components/today/v3/FocusCard';
import TaskHabitStack from '../../components/today/v3/TaskHabitStack';
import DropZoneCard from '../../components/today/v3/DropZoneCard';
import SweepPreviewFooter from '../../components/today/v3/SweepPreviewFooter';
import FocusPickerModal from '../../components/today/v3/FocusPickerModal';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';

export default function TodayV3View() {
  const overlay = useUnifiedOverlayController();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);

  const handleViewFocus = (entryId: string | null, entryType: 'todo' | 'habit' | 'note' | null) => {
    if (!entryId || !entryType) return;
    overlay.openCreate({
      type: entryType === 'todo' ? 'todo' : entryType === 'habit' ? 'habit' : 'note',
    });
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
