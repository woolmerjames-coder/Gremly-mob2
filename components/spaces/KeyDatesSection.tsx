/**
 * KeyDatesSection - Collapsible section of event notes for a Space
 *
 * Features:
 * - Collapsed by default (shows next upcoming event)
 * - Expanded shows all events with KeyDateRow
 * - "Add Key Date" button
 * - Empty state when no events
 */

import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Calendar, ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { BRAND } from '../../design/brand';
import { useEventsForSpace, useItemsLinkedToEvent } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import KeyDateRow from './KeyDateRow';
import type { Note } from '../../lib/types';

export interface KeyDatesSectionProps {
  spaceId: string;
  onEventPress: (event: Note) => void;
  onAddPress: () => void;
}

/**
 * Helper component to get linked item count for an event
 * Uses the selector hook which requires being inside a component
 */
function LinkedItemCount({ eventId }: { eventId: string }): number {
  const linked = useItemsLinkedToEvent(eventId);
  return linked.todos.length + linked.notes.length + linked.habits.length;
}

/**
 * Wrapper that uses the selector and passes count to KeyDateRow
 */
function KeyDateRowWithCount({ event, onPress }: { event: Note; onPress: (event: Note) => void }) {
  const linked = useItemsLinkedToEvent(event.id);
  const count = linked.todos.length + linked.notes.length + linked.habits.length;

  return <KeyDateRow event={event} onPress={onPress} linkedItemCount={count} />;
}

export default function KeyDatesSection({
  spaceId,
  onEventPress,
  onAddPress,
}: KeyDatesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const events = useEventsForSpace(spaceId);

  // Get the next upcoming event (first one since they're sorted by date ascending)
  const nextEvent = events.length > 0 ? events[0] : null;

  // Format the next event preview text
  const nextEventPreview = useMemo(() => {
    if (!nextEvent || !nextEvent.target_date) return null;
    const date = parseISO(nextEvent.target_date);
    const dateStr = format(date, 'MMM d');
    const title = nextEvent.title || 'Untitled Event';
    return `${title} — ${dateStr}`;
  }, [nextEvent]);

  // Empty state
  if (events.length === 0) {
    return (
      <View style={styles.container} testID="key-dates-section">
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Calendar size={18} color={BRAND.colors.mossGreen} />
            <Text style={styles.headerText}>Key Dates</Text>
          </View>
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No key dates yet</Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
            onPress={onAddPress}
          >
            <Plus size={16} color={BRAND.colors.mossGreen} />
            <Text style={styles.addButtonText}>Add Key Date</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Collapsed state
  if (!expanded) {
    return (
      <View style={styles.container} testID="key-dates-section">
        <Pressable style={styles.collapsedContainer} onPress={() => setExpanded(true)}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Calendar size={18} color={BRAND.colors.mossGreen} />
              <Text style={styles.headerText}>Key Dates ({events.length})</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.expandText}>Expand</Text>
              <ChevronDown size={18} color={BRAND.colors.inkMuted} />
            </View>
          </View>

          {nextEventPreview && (
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Next:</Text>
              <Text style={styles.previewText} numberOfLines={1}>
                {nextEventPreview}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    );
  }

  // Expanded state
  return (
    <View style={styles.container} testID="key-dates-section">
      {/* Header */}
      <Pressable style={styles.header} onPress={() => setExpanded(false)}>
        <View style={styles.headerLeft}>
          <Calendar size={18} color={BRAND.colors.mossGreen} />
          <Text style={styles.headerText}>Key Dates ({events.length})</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.expandText}>Collapse</Text>
          <ChevronUp size={18} color={BRAND.colors.inkMuted} />
        </View>
      </Pressable>

      {/* Event list */}
      <View style={styles.eventList}>
        {events.map((event) => (
          <KeyDateRowWithCount key={event.id} event={event} onPress={onEventPress} />
        ))}
      </View>

      {/* Add button */}
      <Pressable
        style={({ pressed }) => [
          styles.addButton,
          styles.addButtonExpanded,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onAddPress}
      >
        <Plus size={16} color={BRAND.colors.mossGreen} />
        <Text style={styles.addButtonText}>Add Key Date</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    marginHorizontal: 16,
    backgroundColor: BRAND.colors.sageMist + '30', // 30% opacity
    borderRadius: BRAND.radius.lg,
    padding: 16,
  },
  collapsedContainer: {
    // Additional styles for collapsed state if needed
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  expandText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  previewLabel: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  previewText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  eventList: {
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    borderStyle: 'dashed',
  },
  addButtonExpanded: {
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
});
