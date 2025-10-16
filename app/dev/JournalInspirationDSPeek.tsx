/**
 * JournalInspirationDSPeek - Dev preview for JournalInspiration component
 * Visual QA for the rotating journal prompts with DS primitives
 */
import { useState } from 'react';
import { Screen, Box, Button, Text } from '../../ui';
import JournalInspiration from '../../components/JournalInspiration';

export default function JournalInspirationDSPeek() {
  const [showComponent, setShowComponent] = useState(true);

  return (
    <Screen title="Journal Inspiration Preview" scroll testID="journal-inspiration-ds-peek">
      <Box gap={3}>
        <Text variant="body">
          This preview demonstrates the JournalInspiration component with rotating prompts every 6
          seconds.
        </Text>

        <Button
          testID="toggle-component"
          variant="neutral"
          title={showComponent ? 'Hide Component' : 'Show Component'}
          onPress={() => setShowComponent(!showComponent)}
        />

        {showComponent && <JournalInspiration />}

        <Box p={3} bg="surface" radius={3}>
          <Text variant="label" style={{ marginBottom: 8 }}>
            Component Features:
          </Text>
          <Text variant="body">• Rotates through 6 prompts every 6 seconds</Text>
          <Text variant="body">• Mascot icon (celebrate pose, static)</Text>
          <Text variant="body">• Italic text with subtle color</Text>
          <Text variant="body">• Rounded card with outlined border</Text>
          <Text variant="body">• Semi-transparent background</Text>
          <Text variant="body">• Accessibility label for screen readers</Text>
        </Box>

        <Box p={3} style={{ backgroundColor: '#E7F3FF', borderRadius: 12 }}>
          <Text variant="label" style={{ marginBottom: 8 }}>
            💡 Usage:
          </Text>
          <Text variant="body">
            This component is typically shown in the Journal entry screen to provide inspiring
            prompts and reduce writer&apos;s block.
          </Text>
        </Box>
      </Box>
    </Screen>
  );
}
