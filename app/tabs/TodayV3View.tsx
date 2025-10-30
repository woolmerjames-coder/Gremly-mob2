import React, { useState } from 'react';
import { Screen, Box, Button } from '../../ui';
import FocusCard from '../../components/today/v3/FocusCard';
import TaskHabitStack from '../../components/today/v3/TaskHabitStack';
import DropZoneCard from '../../components/today/v3/DropZoneCard';
import SweepPreviewFooter from '../../components/today/v3/SweepPreviewFooter';
import FocusPickerModal from '../../components/today/v3/FocusPickerModal';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import TodayHeader from '../../components/today/v3/TodayHeader';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';

export default function TodayV3View() {
  const overlay = useUnifiedOverlayController();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);

  return (
    <Screen title="Today" scroll padded testID="today-v3-screen">
      <Box gap={4}>
        <TodayHeader />

        <FocusCard onChange={() => setPickerOpen(true)} onClear={() => {}} />

        <TaskHabitStack />

        <DropZoneCard onViewDrops={() => overlay.openCreate({ type: 'note' })} />

        <Box style={{ alignItems: 'center', marginTop: 8 }}>
          <Button label="Add More" variant="primary" onPress={() => overlay.openCreate()} />
        </Box>

        <SweepPreviewFooter onStart={() => setSweepOpen(true)} onPeek={() => setSweepOpen(true)} />
      </Box>

      <FocusPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <SweepDrawer visible={sweepOpen} onClose={() => setSweepOpen(false)} />
    </Screen>
  );
}
