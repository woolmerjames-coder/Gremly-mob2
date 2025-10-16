/**
 * ManualAddDSPlayground - Preview for DS-only ManualAddSheet
 */
import React, { useState } from 'react';
import { Screen, Box, Button } from '../../ui';
import { ManualAddSheet } from '../../components2/ManualAddSheet';

export default function ManualAddDSPlayground() {
  const [visible, setVisible] = useState(false);

  return (
    <Screen title="Manual Add DS Playground" padded>
      <Box gap={4}>
        <Button title="Open Manual Add Sheet" onPress={() => setVisible(true)} variant="primary" />
      </Box>

      <ManualAddSheet
        visible={visible}
        onClose={() => setVisible(false)}
        onSubmit={async (payload) => {
          console.log('[ManualAddDSPlayground] onSubmit:', payload);
        }}
      />
    </Screen>
  );
}
