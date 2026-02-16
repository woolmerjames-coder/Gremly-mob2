/**
 * TodoLinkSheet
 *
 * Bottom sheet for linking a todo to a calendar event.
 * Displays a searchable, scrollable list of active (non-archived,
 * non-completed) todos. On selection, calls onSelect(eventId, todoId).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Todo } from '../../lib/types';

/* ─── constants ─── */

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_LIST_HEIGHT = SCREEN_HEIGHT * 0.5;

const SAGE_TINT = '#F0F4F3';
const CHARCOAL = '#222222';
const MUTED = '#888888';
const DIVIDER = '#F0EDE8';
const HANDLE_COLOR = '#D5D2CC';
const PRESSED_BG = '#F9F6F1';

/* ─── types ─── */

export interface TodoLinkSheetProps {
  visible: boolean;
  eventId: string | null;
  onClose: () => void;
  onSelect: (eventId: string, todoId: string) => void;
}

/* ─── component ─── */

export default function TodoLinkSheet({ visible, eventId, onClose, onSelect }: TodoLinkSheetProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const todos = useGremlyStore((s) => s.todos);
  const spaces = useGremlyStore((s) => s.spaces);

  const spacesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const space of spaces) {
      map.set(space.id, space.name);
    }
    return map;
  }, [spaces]);

  const filteredTodos = useMemo(() => {
    const active = todos.filter((t): t is Todo => !t.archived && !t.completed_at);
    if (!search.trim()) return active;
    const q = search.toLowerCase();
    return active.filter((t) => {
      const name = (t.name || t.title || '').toLowerCase();
      return name.includes(q);
    });
  }, [todos, search]);

  const handleSelect = useCallback(
    (todoId: string) => {
      if (!eventId) return;
      onSelect(eventId, todoId);
    },
    [eventId, onSelect],
  );

  const handleClose = useCallback(() => {
    setSearch('');
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: Todo }) => {
      const title = item.name || item.title || 'Untitled';
      const spaceName = item.space_id ? spacesMap.get(item.space_id) : null;

      return (
        <Pressable
          style={({ pressed }) => [styles.todoRow, pressed && { backgroundColor: PRESSED_BG }]}
          onPress={() => handleSelect(item.id)}
        >
          <Text style={styles.todoTitle} numberOfLines={1}>
            {title}
          </Text>
          {spaceName && (
            <View style={styles.spaceTag}>
              <Text style={styles.spaceTagText} numberOfLines={1}>
                {spaceName}
              </Text>
            </View>
          )}
        </Pressable>
      );
    },
    [spacesMap, handleSelect],
  );

  const keyExtractor = useCallback((item: Todo) => item.id, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* dim overlay */}
        <Pressable style={styles.overlay} onPress={handleClose} />

        {/* card */}
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Link a todo</Text>
            <Text style={styles.headerSubtitle}>Select a todo to connect to this event</Text>
          </View>

          {/* search */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search todos..."
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />

          {/* list */}
          <View style={{ maxHeight: MAX_LIST_HEIGHT }}>
            <FlatList
              data={filteredTodos}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              ItemSeparatorComponent={Separator}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No matching todos</Text>
                </View>
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─── separator ─── */

function Separator() {
  return <View style={styles.separator} />;
}

/* ─── styles ─── */

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  /* handle */
  handleRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HANDLE_COLOR,
  },

  /* header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: CHARCOAL,
  },
  headerSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },

  /* search */
  searchInput: {
    fontSize: 14,
    color: CHARCOAL,
    backgroundColor: SAGE_TINT,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },

  /* todo rows */
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  todoTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: CHARCOAL,
    flex: 1,
  },
  spaceTag: {
    backgroundColor: SAGE_TINT,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  spaceTagText: {
    fontSize: 11,
    fontWeight: '500',
    color: MUTED,
    maxWidth: 80,
  },
  separator: {
    height: 1,
    backgroundColor: DIVIDER,
    marginLeft: 16,
  },

  /* empty */
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
  },
});
