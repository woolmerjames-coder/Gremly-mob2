/**
 * TimelineView - Date-grouped reverse-chronological feed
 *
 * Replaces AllItemsTable as the default Hub view. Groups items by the day
 * they were dropped ("Today", "Yesterday", "Feb 6", etc.) with type filter
 * pills and compact item rows showing type dot, title, space, and metadata.
 *
 * Hub V2 (Feb 2026)
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { getDateService } from '../../lib/date';
import { format } from 'date-fns';
import type { Todo, Habit, Note, Space } from '../../lib/types';

// ═══════════════════════════════════════════════════════════════════
// BRAND COLORS (matches AllItemsTable / brand.ts)
// ═══════════════════════════════════════════════════════════════════

const BRAND = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  sageMist: '#BFD8C0',
  goldenPear: '#E0C47A',
  charcoalInk: '#222222',
  mutedSageText: '#768879',
  white: '#FFFFFF',
  gray100: '#F3F3F3',
  gray200: '#E5E5E5',
  gray400: '#999999',
  periwinkle: '#9CA6E0',
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type FilterType = 'all' | 'todos' | 'habits' | 'notes';

type TimelineItem = {
  id: string;
  type: 'todo' | 'habit' | 'note';
  title: string;
  subtitle?: string;
  createdAt: string; // ISO string
  dateKey: string; // YYYY-MM-DD for grouping
  spaceName: string | null;
  spaceId: string | null;
  tags: string[];
  status: 'active' | 'completed' | 'overdue';
  /** Note subtype for icon differentiation */
  subtype?: string | null;
  /** Mood array for journal entries */
  mood?: string[] | null;
  /** People linked to this item */
  people?: string[];
  raw: Todo | Habit | Note;
};

type DayGroup = {
  dateKey: string;
  label: string;
  items: TimelineItem[];
};

export interface TimelineViewProps {
  onItemPress: (item: Todo | Habit | Note) => void;
  onSpacePress?: (spaceId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a YYYY-MM-DD date key into a human-readable day label
 */
function formatDayLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';

  // Parse the date key for display
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const now = getDateService().now();
  const sameYear = date.getFullYear() === now.getFullYear();

  // Within last 7 days: show day name + date ("Thu, Feb 6")
  const daysDiff = getDateService().daysBetween(dateKey, getDateService().today());
  if (daysDiff <= 6) {
    return format(date, 'EEE, MMM d');
  }

  // Same year: "Feb 6"
  if (sameYear) {
    return format(date, 'MMM d');
  }

  // Different year: "Feb 6, 2025"
  return format(date, 'MMM d, yyyy');
}

/**
 * Get the YYYY-MM-DD date key from an ISO timestamp
 */
function getDateKey(isoString: string): string {
  if (!isoString) return '1970-01-01';
  return isoString.split('T')[0];
}

/**
 * Get yesterday's date key
 */
function getYesterdayKey(todayKey: string): string {
  const [y, m, d] = todayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return getDateService().toLocalDate(date);
}

/**
 * Get type dot color
 */
function getTypeDotColor(type: 'todo' | 'habit' | 'note', subtype?: string | null): string {
  if (type === 'todo') return BRAND.mossGreen;
  if (type === 'habit') return BRAND.periwinkle;
  // Notes: differentiate subtypes
  if (subtype === 'journal') return BRAND.goldenPear;
  if (subtype === 'idea') return BRAND.periwinkle;
  return BRAND.mutedSageText;
}

/**
 * Get a short type label
 */
function getTypeLabel(type: 'todo' | 'habit' | 'note', subtype?: string | null): string {
  if (type === 'todo') return 'To-Do';
  if (type === 'habit') return 'Habit';
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  if (subtype === 'event') return 'Event';
  return 'Note';
}

/**
 * Get status for an item
 */
function getStatus(item: Todo | Habit | Note): 'active' | 'completed' | 'overdue' {
  const dateService = getDateService();
  const today = dateService.today();

  if (item.type === 'todo') {
    const todo = item as Todo;
    if (todo.completed_at) return 'completed';
    if (todo.due_day && todo.due_day < today) return 'overdue';
    return 'active';
  }

  if (item.type === 'habit') {
    if (item.archived) return 'completed';
    return 'active';
  }

  if (item.archived) return 'completed';
  return 'active';
}

/**
 * Mood color mapping
 */
const MOOD_COLORS: Record<string, string> = {
  great: '#4CAF50',
  good: '#81C784',
  okay: BRAND.gray400,
  low: BRAND.periwinkle,
  tired: BRAND.gray400,
  anxious: BRAND.periwinkle,
  overwhelmed: BRAND.periwinkle,
  frustrated: '#666',
  scattered: BRAND.gray400,
  grateful: '#81C784',
  hopeful: '#4CAF50',
  focused: '#81C784',
  calm: '#81C784',
};

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function TimelineView({ onItemPress, onSpacePress }: TimelineViewProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Get data from store
  const todos = useGremlyStore((s): Todo[] => s.todos) ?? [];
  const habits = useGremlyStore((s): Habit[] => s.habits) ?? [];
  const notes = useGremlyStore((s): Note[] => s.notes) ?? [];
  const spaces = useGremlyStore((s): Space[] => s.spaces) ?? [];

  const dateService = getDateService();
  const todayKey = dateService.today();
  const yesterdayKey = getYesterdayKey(todayKey);

  // Space lookup
  const spaceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const space of spaces) {
      map.set(space.id, space.name);
    }
    return map;
  }, [spaces]);

  // Build unified timeline items
  const allItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    for (const todo of todos) {
      if (todo.archived) continue;
      items.push({
        id: todo.id,
        type: 'todo',
        title: todo.name || 'Untitled',
        createdAt: todo.created_at ?? '',
        dateKey: getDateKey(todo.created_at ?? ''),
        spaceName: todo.space_id ? (spaceMap.get(todo.space_id) ?? null) : null,
        spaceId: todo.space_id ?? null,
        tags: todo.tags ?? [],
        status: getStatus(todo),
        raw: todo,
      });
    }

    for (const habit of habits) {
      if (habit.archived) continue;
      items.push({
        id: habit.id,
        type: 'habit',
        title: habit.name || 'Untitled',
        createdAt: habit.created_at ?? '',
        dateKey: getDateKey(habit.created_at ?? ''),
        spaceName: null,
        spaceId: null,
        tags: habit.tags ?? [],
        status: getStatus(habit),
        raw: habit,
      });
    }

    for (const note of notes) {
      if (note.archived) continue;
      const title = note.title || note.body?.slice(0, 60) || 'Untitled';
      items.push({
        id: note.id,
        type: 'note',
        title,
        subtitle:
          note.subtype === 'journal' && note.body && note.body.length > 60
            ? note.body.slice(0, 80) + '…'
            : undefined,
        createdAt: note.created_at ?? '',
        dateKey: getDateKey(note.created_at ?? ''),
        spaceName: note.space_id ? (spaceMap.get(note.space_id) ?? null) : null,
        spaceId: note.space_id ?? null,
        tags: note.tags ?? [],
        status: getStatus(note),
        subtype: note.subtype,
        mood: note.mood,
        raw: note,
      });
    }

    // Sort newest first
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }, [todos, habits, notes, spaceMap]);

  // Apply type filter
  const filteredItems = useMemo(() => {
    if (filter === 'all') return allItems;
    if (filter === 'todos') return allItems.filter((i) => i.type === 'todo');
    if (filter === 'habits') return allItems.filter((i) => i.type === 'habit');
    if (filter === 'notes') return allItems.filter((i) => i.type === 'note');
    return allItems;
  }, [allItems, filter]);

  // Group by day
  const dayGroups = useMemo<DayGroup[]>(() => {
    const groupMap = new Map<string, TimelineItem[]>();
    const groupOrder: string[] = [];

    for (const item of filteredItems) {
      if (!groupMap.has(item.dateKey)) {
        groupMap.set(item.dateKey, []);
        groupOrder.push(item.dateKey);
      }
      groupMap.get(item.dateKey)!.push(item);
    }

    return groupOrder.map((dateKey) => ({
      dateKey,
      label: formatDayLabel(dateKey, todayKey, yesterdayKey),
      items: groupMap.get(dateKey) ?? [],
    }));
  }, [filteredItems, todayKey, yesterdayKey]);

  // Filter chip counts
  const counts = useMemo(() => {
    let todoCount = 0;
    let habitCount = 0;
    let noteCount = 0;
    for (const item of allItems) {
      if (item.type === 'todo') todoCount++;
      else if (item.type === 'habit') habitCount++;
      else noteCount++;
    }
    return { all: allItems.length, todos: todoCount, habits: habitCount, notes: noteCount };
  }, [allItems]);

  const handleItemPress = useCallback(
    (item: TimelineItem) => {
      onItemPress(item.raw);
    },
    [onItemPress],
  );

  // Filter chips config
  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'todos', label: 'Todos', count: counts.todos },
    { key: 'habits', label: 'Habits', count: counts.habits },
    { key: 'notes', label: 'Notes', count: counts.notes },
  ];

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
            {f.count > 0 && filter !== f.key && <Text style={styles.filterCount}>{f.count}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* Timeline */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {dayGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items yet</Text>
            <Text style={styles.emptyHint}>Drop a thought to get started</Text>
          </View>
        ) : (
          dayGroups.map((group) => (
            <View key={group.dateKey} style={styles.dayGroup}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{group.label}</Text>
                <Text style={styles.dayCount}>{group.items.length}</Text>
              </View>

              {/* Items in this day */}
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.6}
                >
                  {/* Type indicator dot */}
                  <View
                    style={[
                      styles.typeDot,
                      { backgroundColor: getTypeDotColor(item.type, item.subtype) },
                    ]}
                  />

                  {/* Content */}
                  <View style={styles.itemContent}>
                    {/* Title row */}
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.typeChip,
                          {
                            backgroundColor:
                              item.type === 'todo'
                                ? `${BRAND.mossGreen}15`
                                : item.type === 'habit'
                                  ? `${BRAND.periwinkle}20`
                                  : `${BRAND.goldenPear}25`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            {
                              color:
                                item.type === 'todo'
                                  ? BRAND.mossGreen
                                  : item.type === 'habit'
                                    ? '#6B74B8'
                                    : '#B8860B',
                            },
                          ]}
                        >
                          {getTypeLabel(item.type, item.subtype)}
                        </Text>
                      </View>
                    </View>

                    {/* Subtitle (journal preview) */}
                    {item.subtitle && (
                      <Text style={styles.itemSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    )}

                    {/* Metadata row: mood, space, overdue badge */}
                    <View style={styles.metaRow}>
                      {/* Mood chips */}
                      {item.mood &&
                        Array.isArray(item.mood) &&
                        item.mood.length > 0 &&
                        item.mood.slice(0, 2).map((m, idx) => (
                          <View
                            key={`${item.id}-mood-${idx}`}
                            style={[
                              styles.moodChip,
                              { backgroundColor: `${MOOD_COLORS[m] || BRAND.gray400}20` },
                            ]}
                          >
                            <View
                              style={[
                                styles.moodDot,
                                { backgroundColor: MOOD_COLORS[m] || BRAND.gray400 },
                              ]}
                            />
                            <Text style={styles.moodText}>{m}</Text>
                          </View>
                        ))}

                      {/* Space chip */}
                      {item.spaceName && (
                        <TouchableOpacity
                          style={styles.spaceChip}
                          onPress={() => item.spaceId && onSpacePress?.(item.spaceId)}
                          activeOpacity={0.7}
                          disabled={!onSpacePress}
                        >
                          <Text style={styles.spaceText} numberOfLines={1}>
                            {item.spaceName}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Overdue badge */}
                      {item.status === 'overdue' && (
                        <View style={styles.overdueChip}>
                          <Text style={styles.overdueText}>Overdue</Text>
                        </View>
                      )}

                      {/* Completed badge */}
                      {item.status === 'completed' && (
                        <View
                          style={[styles.overdueChip, { backgroundColor: `${BRAND.sageMist}40` }]}
                        >
                          <Text style={[styles.overdueText, { color: BRAND.mossGreen }]}>Done</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.sageMist,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: BRAND.mossGreen,
    borderColor: BRAND.mossGreen,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.mutedSageText,
  },
  filterTextActive: {
    color: BRAND.white,
  },
  filterCount: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.gray400,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // Day group
  dayGroup: {
    marginBottom: 4,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.charcoalInk,
    letterSpacing: 0.1,
  },
  dayCount: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.gray400,
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: BRAND.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.gray100,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 10,
  },
  itemContent: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.charcoalInk,
  },
  typeChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 13,
    color: BRAND.mutedSageText,
    marginTop: 2,
  },

  // Metadata row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
    flexWrap: 'wrap',
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  moodDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  moodText: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.mutedSageText,
  },
  spaceChip: {
    backgroundColor: `${BRAND.mossGreen}10`,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 100,
  },
  spaceText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.mossGreen,
  },
  overdueChip: {
    backgroundColor: `${BRAND.goldenPear}25`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overdueText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B8860B',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.mutedSageText,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: BRAND.gray400,
  },
});
