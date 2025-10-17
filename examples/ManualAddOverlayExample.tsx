/**
 * Example: Using ManualAddOverlay in a Screen
 * This demonstrates how to integrate the Phase 6 overlay
 */

import React, { useState } from 'react';
import { Screen } from '../ui/Screen';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';
import { Button } from '../design-system/Button';
import { ManualAddOverlay } from '../components/ManualAddOverlay';
import type { ManualAddPayload } from '../app/schemas/manualAdd';

export function ExampleScreen() {
  const [overlayVisible, setOverlayVisible] = useState(false);

  const handleSubmit = (payload: ManualAddPayload) => {
    console.log('📝 Manual add submission:', payload);

    // Route to appropriate action based on type
    switch (payload.type) {
      case 'habits':
        if (payload.subType === 'start') {
          console.log('✅ Creating habit (start):', payload.data);
          // Example: repo.habits.create(payload.data)
        } else {
          console.log('🚫 Creating habit (break):', payload.data);
          // Example: repo.habitsBreak.create(payload.data)
        }
        break;

      case 'todos':
        console.log('✅ Creating todo:', payload.data);
        // Example: repo.todos.create(payload.data)
        break;

      case 'journal':
        console.log('📖 Creating journal entry:', payload.data);
        // Example: repo.journal.create(payload.data)
        break;

      case 'catchall':
        console.log('💭 Creating catch-all:', payload.data);
        // Example: repo.catchall.create(payload.data)
        break;
    }

    // Optional: Show success feedback
    // showToast({ message: 'Added successfully!', type: 'success' });

    // Optional: Trigger analytics
    // analytics.track('manual_add_submitted', { type: payload.type });
  };

  return (
    <Screen testID="example-screen">
      <Box style={{ flex: 1, padding: 16 }}>
        <Text variant="title">Manual Add Example</Text>

        <Box style={{ marginTop: 24 }}>
          <Text variant="body">
            This screen demonstrates the Phase 6 ManualAddOverlay component. Tap the button below to
            open the overlay.
          </Text>
        </Box>

        <Box style={{ marginTop: 32 }}>
          <Button
            label="Open Manual Add"
            variant="primary"
            onPress={() => setOverlayVisible(true)}
          />
        </Box>

        <Box style={{ marginTop: 16 }}>
          <Button
            label="Open to To-Dos Tab"
            variant="secondary"
            onPress={() => setOverlayVisible(true)}
          />
        </Box>
      </Box>

      {/* Phase 6 Overlay */}
      <ManualAddOverlay
        visible={overlayVisible}
        defaultTab="habits"
        onClose={() => setOverlayVisible(false)}
        onSubmit={handleSubmit}
      />
    </Screen>
  );
}

/**
 * Integration Notes:
 *
 * 1. Import the overlay and payload type
 * 2. Add state to control visibility
 * 3. Handle submission with switch statement
 * 4. Pass visible, onClose, and onSubmit props
 * 5. Optional: Set defaultTab based on context
 *
 * Features:
 * - Full-screen modal with keyboard handling
 * - 4 tabs: Habits (Start/Break), To-Dos, Journal, Catch-All
 * - Pinned reminders (except Catch-All)
 * - Optional fields with "Show optional" toggle
 * - Type-safe validation with Zod
 * - All styling via DS primitives (no Tailwind)
 *
 * Tests:
 * - See __tests__/manualAddOverlay.ds.test.tsx
 * - 22 passing tests covering all functionality
 */
