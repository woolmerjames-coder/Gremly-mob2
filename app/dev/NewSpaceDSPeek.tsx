/**
 * NewSpaceDSPeek - Dev preview for NewSpaceModal
 * Visual QA for the New Space overlay with DS primitives
 */
import { SheetManager } from 'react-native-actions-sheet';
import { Screen, Box, Button, Text } from '../../ui';

export default function NewSpaceDSPeek() {
  return (
    <Screen title="New Space Modal Preview" scroll testID="new-space-ds-peek">
      <Box gap={3}>
        <Text variant="body">
          This preview screen lets you test the New Space modal overlay without navigating through
          the app.
        </Text>

        <Button
          testID="open-new-space"
          variant="primary"
          title="Open New Space Modal"
          onPress={() => {
            SheetManager.show('new-space');
          }}
        />

        <Box p={3} bg="surface" radius={3}>
          <Text variant="label" style={{ marginBottom: 8 }}>
            Modal Features:
          </Text>
          <Text variant="body">• Name input (required)</Text>
          <Text variant="body">• Icon input (optional emoji)</Text>
          <Text variant="body">• Theme chips (deepTeal, mint, cream, periwinkle)</Text>
          <Text variant="body">• Disabled submit until name filled</Text>
          <Text variant="body">• Error display on validation failure</Text>
          <Text variant="body">• Keyboard-avoiding sticky footer</Text>
        </Box>

        <Box p={3} style={{ backgroundColor: '#FFF3CD', borderRadius: 12 }}>
          <Text variant="label" style={{ marginBottom: 8 }}>
            ⚠️ Note:
          </Text>
          <Text variant="body">
            The modal will attempt to create a real Space in the database. Make sure you&apos;re
            connected and authenticated for full testing.
          </Text>
        </Box>
      </Box>
    </Screen>
  );
}
