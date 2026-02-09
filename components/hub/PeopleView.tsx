/**
 * PeopleView - Browse items by person
 *
 * Shows all people discovered via Phase 2 enrichment (people extraction).
 * Tapping a person expands to show all items linked to them.
 * Powered by linked_people on entities + useDiscoveredPeople selector.
 *
 * Hub V2 (Feb 2026)
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ChevronRight, User, Users, X } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
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
  gray100: '#F3F3F3',
  gray200: '#E5E5E5',
  gray400: '#999999',
  periwinkle: '#9CA6E0',
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type PersonSummary = {
  name: string;
  itemCount: number;
  todoCount: number;
  habitCount: number;
  noteCount: number;
};

type LinkedItem = {
  id: string;
  type: 'todo' | 'habit' | 'note';
  title: string;
  subtype?: string | null;
  createdAt: string;
  raw: Todo | Habit | Note;
};

export interface PeopleViewProps {
  onItemPress: (item: Todo | Habit | Note) => void;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getTypeLabel(type: 'todo' | 'habit' | 'note', subtype?: string | null): string {
  if (type === 'todo') return 'To-Do';
  if (type === 'habit') return 'Habit';
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  if (subtype === 'event') return 'Event';
  return 'Note';
}

function getTypeDotColor(type: 'todo' | 'habit' | 'note', subtype?: string | null): string {
  if (type === 'todo') return BRAND.mossGreen;
  if (type === 'habit') return BRAND.periwinkle;
  if (subtype === 'journal') return BRAND.goldenPear;
  return BRAND.mutedSageText;
}

/**
 * Normalize a person name for matching (lowercase, trim)
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function PeopleView({ onItemPress }: PeopleViewProps) {
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  // Get data from store
  const todos = useGremlyStore((s): Todo[] => s.todos) ?? [];
  const habits = useGremlyStore((s): Habit[] => s.habits) ?? [];
  const notes = useGremlyStore((s): Note[] => s.notes) ?? [];

  // Build people index from linked_people across all items
  const { people, itemsByPerson } = useMemo(() => {
    const personMap = new Map<
      string,
      {
        name: string;
        todoCount: number;
        habitCount: number;
        noteCount: number;
        items: LinkedItem[];
      }
    >();

    const processItem = (item: Todo | Habit | Note, type: 'todo' | 'habit' | 'note') => {
      if (item.archived) return;

      // People names live in views.people as string[] (from Phase 2 enrichment)
      const views = (item as { views?: { people?: string[]; [key: string]: any } }).views;
      const peopleNames = views?.people;
      if (!peopleNames || !Array.isArray(peopleNames) || peopleNames.length === 0) return;

      const title =
        type === 'todo'
          ? (item as Todo).name
          : type === 'habit'
            ? (item as Habit).name
            : (item as Note).title || (item as Note).body?.slice(0, 60) || 'Untitled';

      for (const personName of peopleNames) {
        if (!personName || typeof personName !== 'string') continue;
        const key = normalizeName(personName);

        if (!personMap.has(key)) {
          personMap.set(key, {
            name: personName,
            todoCount: 0,
            habitCount: 0,
            noteCount: 0,
            items: [],
          });
        }

        const entry = personMap.get(key)!;
        if (type === 'todo') entry.todoCount++;
        else if (type === 'habit') entry.habitCount++;
        else entry.noteCount++;

        entry.items.push({
          id: item.id,
          type,
          title,
          subtype: type === 'note' ? (item as Note).subtype : undefined,
          createdAt: item.created_at ?? '',
          raw: item,
        });
      }
    };

    for (const todo of todos) processItem(todo, 'todo');
    for (const habit of habits) processItem(habit, 'habit');
    for (const note of notes) processItem(note, 'note');

    // Sort people by total item count (most mentioned first)
    const sortedPeople: PersonSummary[] = [...personMap.values()]
      .map((p) => ({
        name: p.name,
        itemCount: p.todoCount + p.habitCount + p.noteCount,
        todoCount: p.todoCount,
        habitCount: p.habitCount,
        noteCount: p.noteCount,
      }))
      .sort((a, b) => b.itemCount - a.itemCount);

    // Build lookup for items by person
    const itemsLookup = new Map<string, LinkedItem[]>();
    for (const [key, value] of personMap.entries()) {
      // Sort items newest first
      value.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      itemsLookup.set(key, value.items);
    }

    return { people: sortedPeople, itemsByPerson: itemsLookup };
  }, [todos, habits, notes]);

  // Get items for selected person
  const selectedItems = useMemo(() => {
    if (!selectedPerson) return [];
    return itemsByPerson.get(normalizeName(selectedPerson)) ?? [];
  }, [selectedPerson, itemsByPerson]);

  const handlePersonPress = useCallback((name: string) => {
    setSelectedPerson((prev) => (prev === name ? null : name));
  }, []);

  const handleBack = useCallback(() => {
    setSelectedPerson(null);
  }, []);

  // ─── Detail view for selected person ───
  if (selectedPerson) {
    return (
      <View style={styles.container}>
        {/* Back header */}
        <TouchableOpacity style={styles.backHeader} onPress={handleBack} activeOpacity={0.7}>
          <X size={18} color={BRAND.mutedSageText} />
          <View style={styles.personAvatar}>
            <User size={16} color={BRAND.mossGreen} />
          </View>
          <Text style={styles.backHeaderName}>{selectedPerson}</Text>
          <Text style={styles.backHeaderCount}>{selectedItems.length} items</Text>
        </TouchableOpacity>

        {/* Items for this person */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {selectedItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.linkedItemRow}
              onPress={() => onItemPress(item.raw)}
              activeOpacity={0.6}
            >
              <View
                style={[
                  styles.typeDot,
                  { backgroundColor: getTypeDotColor(item.type, item.subtype) },
                ]}
              />
              <View style={styles.linkedItemContent}>
                <Text style={styles.linkedItemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.linkedItemType}>{getTypeLabel(item.type, item.subtype)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ─── People list ───
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {people.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Users size={32} color={BRAND.gray400} />
            <Text style={styles.emptyText}>No people discovered yet</Text>
            <Text style={styles.emptyHint}>Mention someone in a drop and they'll appear here</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>
              {people.length} {people.length === 1 ? 'person' : 'people'} mentioned
            </Text>
            {people.map((person) => (
              <TouchableOpacity
                key={person.name}
                style={styles.personRow}
                onPress={() => handlePersonPress(person.name)}
                activeOpacity={0.6}
              >
                {/* Avatar */}
                <View style={styles.personAvatar}>
                  <User size={18} color={BRAND.mossGreen} />
                </View>

                {/* Name + counts */}
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <View style={styles.personCounts}>
                    {person.todoCount > 0 && (
                      <Text style={styles.personCountText}>
                        {person.todoCount} to-do{person.todoCount !== 1 ? 's' : ''}
                      </Text>
                    )}
                    {person.habitCount > 0 && (
                      <Text style={styles.personCountText}>
                        {person.habitCount} habit{person.habitCount !== 1 ? 's' : ''}
                      </Text>
                    )}
                    {person.noteCount > 0 && (
                      <Text style={styles.personCountText}>
                        {person.noteCount} note{person.noteCount !== 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Chevron */}
                <ChevronRight size={18} color={BRAND.gray400} />
              </TouchableOpacity>
            ))}
          </>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.gray400,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Person row
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BRAND.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.gray100,
  },
  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${BRAND.sageMist}60`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.charcoalInk,
  },
  personCounts: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  personCountText: {
    fontSize: 12,
    color: BRAND.mutedSageText,
  },

  // Back header
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.gray100,
    gap: 8,
  },
  backHeaderName: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.charcoalInk,
    flex: 1,
  },
  backHeaderCount: {
    fontSize: 13,
    color: BRAND.mutedSageText,
  },

  // Linked item row (detail view)
  linkedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginRight: 10,
  },
  linkedItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkedItemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.charcoalInk,
    marginRight: 8,
  },
  linkedItemType: {
    fontSize: 12,
    color: BRAND.mutedSageText,
    fontWeight: '500',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.mutedSageText,
  },
  emptyHint: {
    fontSize: 13,
    color: BRAND.gray400,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
