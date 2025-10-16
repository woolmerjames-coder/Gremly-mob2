/**
 * ManualAddDSPlayground - Preview for Design System ManualAddSheet
 *
 * Uses SheetManager pattern (Phase 6 migration).
 */
import React from 'react';
import { Screen, Box } from '../../ui';
import { Button } from '../../design-system';
import ManualAddSheet, { openManualAdd } from '../../components/ManualAddSheet';

export default function ManualAddDSPlayground() {
  return (
    <Screen title="Manual Add DS Playground" padded>
      <Box gap={4}>
        <Button
          label="Open Manual Add Sheet (Default)"
          onPress={() => openManualAdd()}
          variant="primary"
        />
        <Button
          label="Open to Journal Tab"
          onPress={() => openManualAdd({ defaultTab: 'journal' })}
          variant="outline"
        />
        <Button
          label="Open to To-Do Tab"
          onPress={() => openManualAdd({ defaultTab: 'todo' })}
          variant="outline"
        />
      </Box>

      {/* Sheet component must be rendered somewhere in the tree */}
      <ManualAddSheet />
    </Screen>
  );
}
