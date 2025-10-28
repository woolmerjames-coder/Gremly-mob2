/**
 * EntryCard - Phase 11.6
 * Renders entry cards inline in chat thread
 * Shows created entries or retrieved entries with preview and tap to open
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Note, Todo, Habit, Person } from '../../lib/types';

// Union type for all entry types
type Entry = Note | Todo | Habit | Person;

export interface EntryCardProps {
  entry: Entry & { type: 'note' | 'todo' | 'habit' | 'person' };
  onPress?: (entry: Entry & { type: string }) => void;
  testID?: string;
}

export function EntryCard({ entry, onPress, testID }: EntryCardProps) {
  const getEntryIcon = (type: string): string => {
    switch (type) {
      case 'habit':
        return '⚡';
      case 'todo':
        return '✓';
      case 'note':
        return '📝';
      case 'person':
        return '👤';
      default:
        return '•';
    }
  };

  const getEntryType = (type: string): string => {
    switch (type) {
      case 'habit':
        return 'HABIT';
      case 'todo':
        return 'TASK';
      case 'note':
        return 'NOTE';
      case 'person':
        return 'PERSON';
      default:
        return 'ITEM';
    }
  };

  const getEntryTitle = (): string => {
    if (entry.type === 'person') {
      return (entry as Person).display_name || (entry as Person).name || 'Untitled Person';
    }
    if (entry.type === 'note') {
      return (entry as Note).title || 'Untitled Note';
    }
    if (entry.type === 'todo') {
      return (entry as Todo).name || (entry as Todo).title || 'Untitled Task';
    }
    if (entry.type === 'habit') {
      return (entry as Habit).name || 'Untitled Habit';
    }
    return 'Untitled';
  };

  const getEntryPreview = (): string | null => {
    if (entry.type === 'person') {
      const person = entry as Person;
      const parts: string[] = [];
      if (person.email) parts.push(person.email);
      if (person.notes) {
        const truncated =
          person.notes.length > 50 ? person.notes.substring(0, 50) + '...' : person.notes;
        parts.push(truncated);
      }
      return parts.length > 0 ? parts.join(' • ') : null;
    }
    if (entry.type === 'note') {
      const note = entry as Note;
      if (note.body) {
        return note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body;
      }
    }
    if (entry.type === 'todo') {
      const todo = entry as Todo;
      const parts: string[] = [];
      if (todo.due_date) parts.push(`Due: ${todo.due_date}`);
      if (todo.notes) {
        const truncated = todo.notes.length > 50 ? todo.notes.substring(0, 50) + '...' : todo.notes;
        parts.push(truncated);
      }
      return parts.length > 0 ? parts.join(' • ') : null;
    }
    if (entry.type === 'habit') {
      const habit = entry as Habit;
      const parts: string[] = [];
      if (habit.frequency) parts.push(habit.frequency);
      if (habit.notes) {
        const truncated =
          habit.notes.length > 50 ? habit.notes.substring(0, 50) + '...' : habit.notes;
        parts.push(truncated);
      }
      return parts.length > 0 ? parts.join(' • ') : null;
    }
    return null;
  };

  const handlePress = () => {
    if (onPress) {
      onPress(entry);
    }
  };

  const title = getEntryTitle();
  const preview = getEntryPreview();

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.container}
      activeOpacity={0.7}
      testID={testID}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{getEntryIcon(entry.type)}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.typeLabel}>{getEntryType(entry.type)}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {preview && (
            <Text style={styles.preview} numberOfLines={2}>
              {preview}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F9F6F1', // Linen Cream
    borderLeftWidth: 4,
    borderLeftColor: '#2E5540', // Moss Green
    borderRadius: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E5540', // Moss Green
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222', // Charcoal Ink
    marginBottom: 4,
  },
  preview: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
  chevron: {
    fontSize: 24,
    color: '#BFD8C0', // Sage Mist
    marginLeft: 8,
    marginTop: 8,
  },
});
