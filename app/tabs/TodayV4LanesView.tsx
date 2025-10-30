import React from 'react';
import { Screen, Box, Text } from '../../ui';

export default function TodayV4LanesView() {
  return (
    <Screen scroll padded testID="today-v4-lanes-screen">
      <Box gap={4}>
        <Text variant="title">Today — Lanes (V4)</Text>
        <Text accessibilityLabel="placeholder">
          This is a placeholder. Real two-lane layout will mount behind this route in Phase 4.
        </Text>
      </Box>
    </Screen>
  );
}
