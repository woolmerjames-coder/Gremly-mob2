/**
 * KeyDatesSection - Collapsible section of event notes for a Space
 *
 * Features:
 * - Collapsed by default (shows goal if exists, otherwise next upcoming event)
 * - Expanded shows all events with KeyDateRow
 * - Simple "+ Add Key Date" link
 * - Warm, scannable styling matching Space sections
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Calendar, ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { BRAND } from '../../design/brand';
import { useEventsForSpace, useItemsLinkedToEvent } from '../../lib/store/selectors';
import KeyDateRow from './KeyDateRow';
import type { Note } from '../../lib/types';

export interface KeyDatesSectionProps {
  spaceId: string;
  onEventPress: (event: Note) => void;
  onAddPress: () => void;
  /** Loading state for new event being created */
  pendingEvent?: string | null;
}

/**
 * Wrapper that uses the selector and passes count to KeyDateRow
 */
function KeyDateRowWithCount({ event, onPress }: { event: Note; onPress: (event: Note) => void }) {
  const linked = useItemsLinkedToEvent(event.id);
  const count = linked.todos.length + linked.notes.length + linked.habits.length;

  return (
    <KeyDateRow
      event={event}
      onPress={onPress}
      linkedItemCount={count}
      isGoal={event.is_goal === true}
    />
  );
}

export default function KeyDatesSection({
  spaceId,
  onEventPress,
  onAddPress,
  pendingEvent,
}: KeyDatesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const events = useEventsForSpace(spaceId); // Goals are excluded by selector
  const [loadingDots, setLoadingDots] = useState('');

  // Animated dots for loading state (matches SpaceHomeScreen pattern)
  useEffect(() => {
    if (!pendingEvent) {
      setLoadingDots('');
      return;
    }
    const interval = setInterval(() => {
      setLoadingDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [pendingEvent]);

  // Auto-expand when there's a pending event so user sees the loading row
  useEffect(() => {
    if (pendingEvent && !expanded) {
      setExpanded(true);
    }
  }, [pendingEvent]);

  // Get the next upcoming event for preview
  const nextEvent = events.length > 0 ? events[0] : null;

  // Format the preview text (next event only, goals shown in header)
  const previewContent = useMemo(() => {
    if (nextEvent && nextEvent.target_date) {
      // Show next event: "Feb 12 · Title"
      const date = parseISO(nextEvent.target_date);
      const dateStr = format(date, 'MMM d');
      const title = nextEvent.title || 'Untitled Event';
      return `${dateStr} · ${title}`;
    }
    if (nextEvent && !nextEvent.target_date) {
      // Dateless event
      return nextEvent.title || 'Untitled Event';
    }
    return null;
  }, [nextEvent]);

  // Empty state - just show add link
  if (events.length === 0) {
    return (
      <View style={styles.container} testID="key-dates-section">
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Calendar size={16} color={BRAND.colors.inkMuted} />
            <Text style={styles.headerText}>Key Dates</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addLink, pressed && { opacity: 0.6 }]}
            onPress={onAddPress}
            hitSlop={8}
          >
            <Plus size={14} color={BRAND.colors.mossGreen} />
            <Text style={styles.addLinkText}>Add</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Collapsed state - show header with next event preview
  if (!expanded) {
    return (
      <View style={styles.container} testID="key-dates-section">
        <Pressable style={styles.collapsedRow} onPress={() => setExpanded(true)}>
          <View style={styles.headerLeft}>
            <Calendar size={16} color={BRAND.colors.inkMuted} />
            <Text style={styles.headerText}>
              Key Dates <Text style={styles.countText}>({events.length})</Text>
            </Text>
          </View>
          {previewContent && (
            <Text style={styles.previewText} numberOfLines={1}>
              {previewContent}
            </Text>
          )}
          <ChevronDown size={16} color={BRAND.colors.inkMuted} />
        </Pressable>
      </View>
    );
  }

  // Expanded state
  return (
    <View style={styles.container} testID="key-dates-section">
      {/* Header */}
      <Pressable style={styles.expandedHeader} onPress={() => setExpanded(false)}>
        <View style={styles.headerLeft}>
          <Calendar size={16} color={BRAND.colors.inkMuted} />
          <Text style={styles.headerText}>
            Key Dates <Text style={styles.countText}>({events.length})</Text>
          </Text>
        </View>
        <ChevronUp size={16} color={BRAND.colors.inkMuted} />
      </Pressable>

      {/* Event list */}
      <View style={styles.eventList}>
        {/* Pending event loading row - matches SpaceHomeScreen optimistic card pattern */}
        {pendingEvent && (
          <View style={styles.pendingRow}>
            <View style={styles.pendingContent}>
              <Text style={styles.pendingTitle} numberOfLines={1}>
                {pendingEvent}
              </Text>
              <Text style={styles.pendingMessage}>Working on it{loadingDots}</Text>
            </View>
            <ActivityIndicator size="small" color={BRAND.colors.mossGreen} />
          </View>
        )}
        {events.map((event) => (
          <KeyDateRowWithCount key={event.id} event={event} onPress={onEventPress} />
        ))}
      </View>

      {/* Add link */}
      <Pressable
        style={({ pressed }) => [
          styles.addLink,
          styles.addLinkExpanded,
          pressed && { opacity: 0.6 },
        ]}
        onPress={onAddPress}
        hitSlop={8}
      >
        <Plus size={14} color={BRAND.colors.mossGreen} />
        <Text style={styles.addLinkText}>Add Key Date</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  countText: {
    fontWeight: '400',
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewText: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    marginLeft: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventList: {
    paddingLeft: 22, // Align with header text (icon width + gap)
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addLinkExpanded: {
    paddingLeft: 22,
    marginTop: 4,
  },
  addLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  // Pending event loading row (matches SpaceHomeScreen optimistic card pattern)
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
    marginBottom: 4,
  },
  pendingContent: {
    flex: 1,
    marginRight: 8,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    opacity: 0.7,
  },
  pendingMessage: {
    fontSize: 12,
    color: BRAND.colors.mossGreen,
    fontStyle: 'italic',
    marginTop: 1,
  },
});
