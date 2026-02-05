/**
 * KeyDatesSection - Collapsible section of event notes for a Space
 *
 * Features:
 * - Collapsed by default (shows goal if exists, otherwise next upcoming event)
 * - Expanded shows all events with KeyDateRow
 * - Simple "+ Add Key Date" link
 * - Warm, scannable styling matching Space sections
 */

import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Calendar, ChevronDown, ChevronUp, Plus, Star } from 'lucide-react-native';
import { format, parseISO, differenceInDays } from 'date-fns';
import { BRAND } from '../../design/brand';
import { useEventsForSpace, useItemsLinkedToEvent } from '../../lib/store/selectors';
import { getTodayDayString } from '../../lib/date';
import KeyDateRow from './KeyDateRow';
import type { Note } from '../../lib/types';

export interface KeyDatesSectionProps {
  spaceId: string;
  onEventPress: (event: Note) => void;
  onAddPress: () => void;
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
}: KeyDatesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const events = useEventsForSpace(spaceId);

  // Find goal event (first one with is_goal=true, already sorted first by selector)
  const goalEvent = events.find((e) => e.is_goal === true);

  // Get the next upcoming event (first non-goal since goals are sorted first)
  const nextEvent = events.length > 0 ? events[0] : null;

  // Format countdown for goal preview
  const getGoalCountdown = (event: Note): string | null => {
    if (!event.target_date) return null;
    const today = getTodayDayString();
    const days = differenceInDays(parseISO(event.target_date), parseISO(today));

    if (days === 0) return 'Today';
    if (days < 0) return `${Math.abs(days)} days ago`;
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  // Format the preview text based on whether there's a goal
  const previewContent = useMemo(() => {
    if (goalEvent && goalEvent.target_date) {
      // Show goal: "★ Title · X days"
      const title = goalEvent.title || 'Goal';
      const countdown = getGoalCountdown(goalEvent);
      return {
        isGoal: true,
        title,
        countdown,
      };
    }

    if (nextEvent && nextEvent.target_date) {
      // Show next event: "Feb 12 · Title"
      const date = parseISO(nextEvent.target_date);
      const dateStr = format(date, 'MMM d');
      const title = nextEvent.title || 'Untitled Event';
      return {
        isGoal: false,
        text: `${dateStr} · ${title}`,
      };
    }

    return null;
  }, [goalEvent, nextEvent]);

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

  // Collapsed state - show header with goal or next event preview
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
          {previewContent &&
            (previewContent.isGoal ? (
              <View style={styles.goalPreview}>
                <Star size={12} color={BRAND.colors.goldenPear} fill={BRAND.colors.goldenPear} />
                <Text style={styles.goalPreviewTitle} numberOfLines={1}>
                  {previewContent.title}
                </Text>
                {previewContent.countdown && (
                  <Text style={styles.goalPreviewCountdown}>· {previewContent.countdown}</Text>
                )}
              </View>
            ) : (
              <Text style={styles.previewText} numberOfLines={1}>
                {previewContent.text}
              </Text>
            ))}
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
  goalPreview: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 4,
  },
  goalPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    flexShrink: 1,
  },
  goalPreviewCountdown: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.goldenPear,
    marginLeft: 2,
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
});
