import React from 'react';
import { Screen, Box, Text, Button } from '../../ui';
import FocusCard from '../../components/today/v3/FocusCard';
import TaskHabitStack from '../../components/today/v3/TaskHabitStack';
import DropZoneCard from '../../components/today/v3/DropZoneCard';
import SweepPreviewFooter from '../../components/today/v3/SweepPreviewFooter';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';

export default function TodayV3View() {
  const overlay = useUnifiedOverlayController();

  const handleViewFocus = (entryId: string | null, entryType: 'todo' | 'habit' | 'note' | null) => {
    if (!entryId || !entryType) return;
    // Open the unified overlay to view/edit; minimal for v3 scaffold
    overlay.openCreate({
      type: entryType === 'todo' ? 'todo' : entryType === 'habit' ? 'habit' : 'note',
    });
  };

  return (
    <Screen title="Today" scroll padded testID="today-v3-screen">
      <Box gap={4}>
        {/* Header */}
        <Box gap={1}>
          <Text variant="display">Today</Text>
          <Text variant="subtle">Small wins add up fast.</Text>
        </Box>

        {/* Focus card */}
        <FocusCard
          onView={handleViewFocus}
          onChange={() => overlay.openCreate()}
          onClear={() => {}}
        />

        {/* Unified list */}
        <TaskHabitStack />

        {/* Drop Zone */}
        <DropZoneCard onViewDrops={() => overlay.openCreate({ type: 'note' })} />

        {/* Add More (quick) */}
        <Box>
          <Button title="Add More" variant="neutral" onPress={() => overlay.openCreate()} />
        </Box>

        {/* Sweep preview */}
        <SweepPreviewFooter
          onStart={() => overlay.openCreate({ type: 'journal' })}
          onPeek={() => overlay.openCreate({ type: 'journal' })}
        />
      </Box>

      {/* Overlay lives at top-level; TodayScreen already renders the overlay, so no duplicate here */}
    </Screen>
  );
}
