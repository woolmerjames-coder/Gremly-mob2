/**
 * AllItemsTable - Table view for All Items in Hub
 *
 * Shows todos, habits, and logs in a compact table format with:
 * - Filter chips (All / Todos / Habits / Logs)
 * - Columns: Status, Title, Due, Sweep, Space, Captured
 * - Sorted by captured date (newest first)
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { getDateService } from '../../lib/date';
import { getSweepPrediction } from '../../lib/store/sweepHelpers';
import type { Todo, Habit, Note, Space } from '../../lib/types';

// ═══════════════════════════════════════════════════════════════════
// BRAND COLORS
// ═══════════════════════════════════════════════════════════════════

const BRAND = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  sageMist: '#BFD8C0',
  goldenPear: '#E0C47A',
  charcoalInk: '#222222',
  mutedSageText: '#768879',
  white: '#FFFFFF',
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type FilterType = 'all' | 'todos' | 'habits' | 'logs';

type UnifiedItem = {
  id: string;
  type: 'todo' | 'habit' | 'note';
  title: string;
  createdAt: string;
  dueLabel: string;
  sweepLabel: string;
  spaceId: string | null;
  spaceName: string | null;
  status: 'active' | 'completed' | 'overdue';
  raw: Todo | Habit | Note;
};

interface AllItemsTableProps {
  onItemPress: (item: Todo | Habit | Note) => void;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format captured date as relative time
 */
function formatCaptured(createdAt: string): string {
  const dateService = getDateService();
  const today = dateService.getCurrentDate();
  const createdDate = createdAt.split('T')[0];
  const daysDiff = dateService.daysBetween(createdDate, today);

  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  if (daysDiff <= 6) return `${daysDiff}d ago`;
  if (daysDiff <= 13) return '1w ago';
  if (daysDiff <= 20) return '2w ago';
  if (daysDiff <= 27) return '3w ago';

  const months = Math.floor(daysDiff / 30);
  if (months <= 1) return '1mo ago';
  return `${months}mo ago`;
}

/**
 * Get due label for an item
 */
function getDueLabel(item: Todo | Habit | Note): string {
  const dateService = getDateService();
  const today = dateService.getCurrentDate();

  if (item.type === 'todo') {
    const todo = item as Todo;
    if (!todo.due_day) return '-';
    if (todo.due_day === today) return 'Today';
    return dateService.formatForChip(todo.due_day);
  }

  if (item.type === 'habit') {
    const habit = item as Habit;
    // Show cadence
    if (habit.cadence === 'daily') return 'Daily';
    if (habit.cadence === 'weekly') return 'Weekly';
    if (habit.cadence === 'monthly') return 'Monthly';
    // Check days_active for custom schedules
    if (habit.days_active) {
      const count = habit.days_active.filter(Boolean).length;
      if (count > 0 && count < 7) return `${count}x/wk`;
    }
    return 'Daily';
  }

  // Notes don't have due dates
  return '-';
}

/**
 * Get status for an item
 */
function getStatus(item: Todo | Habit | Note): 'active' | 'completed' | 'overdue' {
  const dateService = getDateService();
  const today = dateService.getCurrentDate();

  if (item.type === 'todo') {
    const todo = item as Todo;
    if (todo.completed_at) return 'completed';
    if (todo.due_day && todo.due_day < today) return 'overdue';
    return 'active';
  }

  if (item.type === 'habit') {
    const habit = item as Habit;
    if (habit.archived) return 'completed';
    return 'active';
  }

  // Notes
  const note = item as Note;
  if (note.archived) return 'completed';
  return 'active';
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AllItemsTable({ onItemPress }: AllItemsTableProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Get data from store (with fallbacks for safety)
  const todos = useGremlyStore((s): Todo[] => s.todos) ?? [];
  const habits = useGremlyStore((s): Habit[] => s.habits) ?? [];
  const notes = useGremlyStore((s): Note[] => s.notes) ?? [];
  const spaces = useGremlyStore((s): Space[] => s.spaces) ?? [];

  // Build space lookup
  const spaceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const space of spaces) {
      map.set(space.id, space.name);
    }
    return map;
  }, [spaces]);

  // Unify all items
  const allItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];

    // Add todos
    for (const todo of todos) {
      if (todo.archived) continue;
      const sweep = getSweepPrediction(todo);
      items.push({
        id: todo.id,
        type: 'todo',
        title: todo.name,
        createdAt: todo.created_at ?? '',
        dueLabel: getDueLabel(todo),
        sweepLabel: sweep.label,
        spaceId: todo.space_id ?? null,
        spaceName: todo.space_id ? (spaceMap.get(todo.space_id) ?? null) : null,
        status: getStatus(todo),
        raw: todo,
      });
    }

    // Add habits
    for (const habit of habits) {
      if (habit.archived) continue;
      const sweep = getSweepPrediction(habit);
      items.push({
        id: habit.id,
        type: 'habit',
        title: habit.name,
        createdAt: habit.created_at ?? '',
        dueLabel: getDueLabel(habit),
        sweepLabel: sweep.label,
        spaceId: null,
        spaceName: null,
        status: getStatus(habit),
        raw: habit,
      });
    }

    // Add notes (logs)
    for (const note of notes) {
      if (note.archived) continue;
      const sweep = getSweepPrediction(note);
      items.push({
        id: note.id,
        type: 'note',
        title: note.title || note.body?.slice(0, 50) || 'Untitled',
        createdAt: note.created_at ?? '',
        dueLabel: getDueLabel(note),
        sweepLabel: sweep.label,
        spaceId: note.space_id ?? null,
        spaceName: note.space_id ? (spaceMap.get(note.space_id) ?? null) : null,
        status: getStatus(note),
        raw: note,
      });
    }

    // Sort by created date, newest first
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return items;
  }, [todos, habits, notes, spaceMap]);

  // Apply filter
  const filteredItems = useMemo(() => {
    if (filter === 'all') return allItems;
    if (filter === 'todos') return allItems.filter((i) => i.type === 'todo');
    if (filter === 'habits') return allItems.filter((i) => i.type === 'habit');
    if (filter === 'logs') return allItems.filter((i) => i.type === 'note');
    return allItems;
  }, [allItems, filter]);

  // Filter chips
  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'todos', label: 'Todos' },
    { key: 'habits', label: 'Habits' },
    { key: 'logs', label: 'Logs' },
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
          </TouchableOpacity>
        ))}
      </View>

      {/* Table header */}
      <View style={styles.headerRow}>
        <View style={styles.statusCol} />
        <Text style={[styles.headerText, styles.titleCol]}>Title</Text>
        <Text style={[styles.headerText, styles.dueCol]}>Due</Text>
        <Text style={[styles.headerText, styles.sweepCol]}>Sweep</Text>
        <Text style={[styles.headerText, styles.capturedCol]}>Added</Text>
      </View>

      {/* Items */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items yet</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={() => onItemPress(item.raw)}
              activeOpacity={0.7}
            >
              {/* Status dot */}
              <View style={styles.statusCol}>
                <View
                  style={[
                    styles.statusDot,
                    item.status === 'active' && styles.statusActive,
                    item.status === 'completed' && styles.statusCompleted,
                    item.status === 'overdue' && styles.statusOverdue,
                  ]}
                />
              </View>

              {/* Title */}
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>

              {/* Due */}
              <Text style={styles.due}>{item.dueLabel}</Text>

              {/* Sweep */}
              <Text style={styles.sweep} numberOfLines={1}>
                {item.sweepLabel}
              </Text>

              {/* Space chip (inline if exists) */}
              {item.spaceName && (
                <View style={styles.spaceChip}>
                  <Text style={styles.spaceText} numberOfLines={1}>
                    {item.spaceName}
                  </Text>
                </View>
              )}

              {/* Captured */}
              <Text style={styles.captured}>{formatCaptured(item.createdAt)}</Text>
            </TouchableOpacity>
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
    backgroundColor: BRAND.linenCream,
  },
  // Filter chips
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.sageMist,
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
  // Header row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.sageMist,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.mutedSageText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusCol: {
    width: 16,
  },
  titleCol: {
    flex: 1,
  },
  dueCol: {
    width: 50,
    textAlign: 'center',
  },
  sweepCol: {
    width: 70,
    textAlign: 'center',
  },
  capturedCol: {
    width: 55,
    textAlign: 'right',
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BRAND.white,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.linenCream,
  },
  // Status dot
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: BRAND.mossGreen,
  },
  statusCompleted: {
    backgroundColor: BRAND.sageMist,
  },
  statusOverdue: {
    backgroundColor: BRAND.goldenPear,
  },
  // Title
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.charcoalInk,
    marginLeft: 8,
    marginRight: 8,
  },
  // Columns
  due: {
    width: 50,
    fontSize: 13,
    color: BRAND.mutedSageText,
    textAlign: 'center',
  },
  sweep: {
    width: 70,
    fontSize: 13,
    color: BRAND.mutedSageText,
    textAlign: 'center',
  },
  // Space chip
  spaceChip: {
    backgroundColor: BRAND.mossGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 60,
    marginRight: 6,
  },
  spaceText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.white,
  },
  // Captured
  captured: {
    width: 55,
    fontSize: 12,
    fontStyle: 'italic',
    color: BRAND.mutedSageText,
    textAlign: 'right',
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
    color: BRAND.mutedSageText,
  },
});
