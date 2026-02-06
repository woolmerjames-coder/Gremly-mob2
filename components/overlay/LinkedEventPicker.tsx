/**
 * LinkedEventPicker - Allows selecting an event to link to in UnifiedOverlayV2
 *
 * Features:
 * - Shows current linked event or "None" placeholder
 * - Tap to open picker with available events
 * - Uses ActionSheetIOS on iOS, Alert on Android
 * - Clear button when linked
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActionSheetIOS, Alert } from 'react-native';
import { ChevronDown, X, Calendar } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { BRAND } from '../../design/brand';
import { useEventsForSpace } from '../../lib/store/selectors';
import type { Note } from '../../lib/types';

export interface LinkedEventPickerProps {
  spaceId: string;
  currentEventId: string | null;
  onChange: (eventId: string | null) => void;
}

/**
 * Format event for display in picker
 * Returns: "Event Name (Mon DD)"
 */
function formatEventOption(event: Note): string {
  const name = event.title || 'Untitled Event';
  if (event.target_date) {
    try {
      const date = parseISO(event.target_date);
      const formatted = format(date, 'MMM d');
      return `${name} (${formatted})`;
    } catch {
      return name;
    }
  }
  return name;
}

export default function LinkedEventPicker({
  spaceId,
  currentEventId,
  onChange,
}: LinkedEventPickerProps) {
  const events = useEventsForSpace(spaceId);

  // Find current event
  const currentEvent = currentEventId ? events.find((e) => e.id === currentEventId) : null;

  // Handle picker open
  const handleOpenPicker = useCallback(() => {
    // Build options list
    const options = ['None', ...events.map(formatEventOption), 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          title: 'Link to Event',
        },
        (buttonIndex) => {
          if (buttonIndex === cancelIndex) return;
          if (buttonIndex === 0) {
            // "None" selected
            onChange(null);
          } else {
            // Event selected (buttonIndex - 1 because of "None" at index 0)
            const selectedEvent = events[buttonIndex - 1];
            if (selectedEvent) {
              onChange(selectedEvent.id);
            }
          }
        },
      );
    } else {
      // Android: use Alert with buttons
      const buttons = [
        {
          text: 'None',
          onPress: () => onChange(null),
        },
        ...events.map((event) => ({
          text: formatEventOption(event),
          onPress: () => onChange(event.id),
        })),
        {
          text: 'Cancel',
          style: 'cancel' as const,
        },
      ];

      Alert.alert('Link to Event', undefined, buttons);
    }
  }, [events, onChange]);

  // Handle clear
  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Don't render if no events available
  if (events.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Linked to event</Text>

      {currentEvent ? (
        // Linked state - show event with clear button
        <View style={styles.selectedContainer}>
          <Pressable
            style={({ pressed }) => [styles.selectedButton, pressed && { opacity: 0.7 }]}
            onPress={handleOpenPicker}
          >
            <Calendar size={16} color={BRAND.colors.mossGreen} />
            <Text style={styles.selectedText} numberOfLines={1}>
              {formatEventOption(currentEvent)}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.7 }]}
            onPress={handleClear}
            hitSlop={8}
          >
            <X size={16} color={BRAND.colors.inkMuted} />
          </Pressable>
        </View>
      ) : (
        // Unlinked state - show "None" with dropdown indicator
        <Pressable
          style={({ pressed }) => [styles.placeholderButton, pressed && { opacity: 0.7 }]}
          onPress={handleOpenPicker}
        >
          <Text style={styles.placeholderText}>None</Text>
          <ChevronDown size={16} color={BRAND.colors.inkMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    marginBottom: 8,
  },
  selectedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.mossGreen,
  },
  selectedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  clearButton: {
    padding: 8,
    borderRadius: BRAND.radius.sm,
    backgroundColor: BRAND.colors.linenCream,
  },
  placeholderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  placeholderText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
});
