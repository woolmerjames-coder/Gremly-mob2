/**
 * ManualAddDSPlayground - DEPRECATED
 *
 * ManualAddSheet has been removed. Use ManualAddOverlay instead.
 * See TodayScreen, HubScreen, or SpaceDetailScreen for usage examples.
 */
import React from 'react';
import { Screen, Box, Text } from '../../ui';

export default function ManualAddDSPlayground() {
  return (
    <Screen title="Manual Add DS Playground" padded>
      <Box gap={4}>
        <Text variant="title">DEPRECATED</Text>
        <Text variant="body">
          ManualAddSheet has been removed and replaced with ManualAddOverlay.
        </Text>
        <Text variant="body">
          See TodayScreen, HubScreen, or SpaceDetailScreen for usage examples.
        </Text>
      </Box>
    </Screen>
  );
}
