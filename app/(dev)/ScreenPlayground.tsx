/**
 * ScreenPlayground - Smoke test for DS Screen component
 */

import React from 'react';
import { Screen } from '../../ui';
import { Box, Text, Button } from '../../ui';

export default function ScreenPlayground() {
  return (
    <Screen title="Screen DS" padded scroll testID="screen-playground">
      <Box gap={4}>
        <Text variant="body">
          This is the DS-based Screen component. It supports scrolling, padding, titles, and safe
          areas.
        </Text>

        <Text variant="title">Features</Text>
        <Box gap={2}>
          <Text variant="body">✓ No Tailwind/className usage</Text>
          <Text variant="body">✓ Token-based spacing and colors</Text>
          <Text variant="body">✓ Safe area support</Text>
          <Text variant="body">✓ Optional title rendering</Text>
          <Text variant="body">✓ Scroll mode support</Text>
        </Box>

        <Text variant="title">Variants</Text>
        <Box gap={2}>
          <Button title="Primary Action" onPress={() => console.log('Pressed')} variant="primary" />
          <Button title="Neutral Action" onPress={() => console.log('Pressed')} variant="neutral" />
        </Box>

        <Text variant="body">
          The screen automatically handles safe areas, applies consistent padding, and provides a
          clean foundation for all app screens.
        </Text>

        {/* Add some scrollable content */}
        {Array.from({ length: 10 }).map((_, i) => (
          <Box key={i} p={3} bg="surface" radius={2}>
            <Text variant="body">Scrollable Item {i + 1}</Text>
          </Box>
        ))}
      </Box>
    </Screen>
  );
}
