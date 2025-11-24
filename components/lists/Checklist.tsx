/**
 * components/lists/Checklist.tsx
 *
 * Reusable checklist component for rendering and managing ListItem[] in overlays.
 * Phase 7 Lists: UI component for todos, notes, and habits with list support.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
} from 'react-native';
import { Check, X, Plus } from 'lucide-react-native';
import type { ListItem } from '../../lib/lists/types';
import { lightTokens, darkTokens, spacing, borderRadius } from '../../design/tokens';

export interface ChecklistProps {
  items: ListItem[];
  onToggle: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  onUpdateText?: (id: string, newText: string) => void;
  editable?: boolean;
  compact?: boolean;
}

export function Checklist({
  items,
  onToggle,
  onAdd,
  onRemove,
  onUpdateText,
  editable = true,
  compact = false,
}: ChecklistProps) {
  const colorMode = useColorScheme();
  const isDark = colorMode === 'dark';
  const tokens = isDark ? darkTokens : lightTokens;

  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleAddItem = () => {
    const trimmed = newItemText.trim();
    if (trimmed) {
      onAdd(trimmed);
      setNewItemText('');
    }
  };

  const handleStartEdit = (item: ListItem) => {
    if (onUpdateText) {
      setEditingId(item.id);
      setEditingText(item.text);
    }
  };

  const handleSaveEdit = () => {
    if (editingId && onUpdateText) {
      const trimmed = editingText.trim();
      if (trimmed) {
        onUpdateText(editingId, trimmed);
      }
      setEditingId(null);
      setEditingText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const checkboxSize = compact ? 20 : 24;
  const itemPadding = compact ? 10 : 12;
  const fontSize = compact ? 14 : 15;

  return (
    <View style={styles.container}>
      {/* List Items */}
      {items.map((item, index) => {
        const isEditing = editingId === item.id;

        return (
          <View
            key={item.id}
            style={[
              styles.itemContainer,
              {
                paddingVertical: itemPadding,
                borderBottomWidth: index < items.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: tokens.colors.border,
                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF',
              },
            ]}
          >
            {/* Checkbox */}
            <Pressable
              onPress={() => editable && onToggle(item.id)}
              style={({ pressed }) => [
                styles.checkbox,
                {
                  width: checkboxSize,
                  height: checkboxSize,
                  borderRadius: checkboxSize / 4,
                  borderWidth: 2,
                  borderColor: item.checked ? tokens.colors.moss : tokens.colors.border,
                  backgroundColor: item.checked ? tokens.colors.moss : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
              disabled={!editable}
            >
              {item.checked && <Check size={checkboxSize - 8} color="#FFFFFF" strokeWidth={3} />}
            </Pressable>

            {/* Item Text or Edit Input */}
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  value={editingText}
                  onChangeText={setEditingText}
                  onSubmitEditing={handleSaveEdit}
                  onBlur={handleSaveEdit}
                  autoFocus
                  style={[
                    styles.editInput,
                    {
                      fontSize,
                      color: tokens.colors.text,
                      borderColor: tokens.colors.border,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
                    },
                  ]}
                  placeholder="Item text..."
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => editable && onUpdateText && handleStartEdit(item)}
                style={styles.textContainer}
                disabled={!editable || !onUpdateText}
              >
                <Text
                  style={[
                    styles.itemText,
                    {
                      fontSize,
                      color: item.checked
                        ? isDark
                          ? 'rgba(255,255,255,0.4)'
                          : '#9CA3AF'
                        : tokens.colors.text,
                      textDecorationLine: item.checked ? 'line-through' : 'none',
                    },
                  ]}
                  numberOfLines={3}
                >
                  {item.text}
                </Text>
              </Pressable>
            )}

            {/* Remove Button */}
            {editable && !isEditing && (
              <Pressable
                onPress={() => onRemove(item.id)}
                hitSlop={8}
                style={({ pressed }) => [styles.removeButton, { opacity: pressed ? 0.5 : 0.6 }]}
              >
                <X size={16} color={isDark ? 'rgba(255,255,255,0.6)' : '#6B7280'} />
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Add New Item Input */}
      {editable && (
        <View
          style={[
            styles.addItemContainer,
            {
              paddingTop: items.length > 0 ? itemPadding : 0,
              borderTopWidth: items.length > 0 ? StyleSheet.hairlineWidth : 0,
              borderTopColor: tokens.colors.border,
            },
          ]}
        >
          <View style={[styles.checkbox, { width: checkboxSize, height: checkboxSize }]}>
            <Plus size={checkboxSize - 8} color={tokens.colors.subtle} />
          </View>

          <TextInput
            value={newItemText}
            onChangeText={setNewItemText}
            onSubmitEditing={handleAddItem}
            placeholder="Add item..."
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'}
            returnKeyType="done"
            blurOnSubmit={false}
            style={[
              styles.addInput,
              {
                fontSize,
                color: tokens.colors.text,
              },
            ]}
          />
        </View>
      )}

      {/* List Stats (if items exist) */}
      {items.length > 0 && (
        <View style={styles.statsContainer}>
          <Text
            style={[
              styles.statsText,
              {
                color: tokens.colors.subtle,
                fontSize: compact ? 12 : 13,
              },
            ]}
          >
            {items.filter((i) => i.checked).length} of {items.length} complete
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  checkbox: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 24,
  },
  itemText: {
    lineHeight: 20,
  },
  removeButton: {
    padding: 4,
    flexShrink: 0,
  },
  editContainer: {
    flex: 1,
  },
  editInput: {
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
    fontWeight: '400',
  },
  addItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    fontWeight: '400',
  },
  statsContainer: {
    paddingTop: 8,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  statsText: {
    fontWeight: '500',
  },
});
