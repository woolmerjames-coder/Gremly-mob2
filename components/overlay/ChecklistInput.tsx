import React, { useMemo, useCallback } from 'react';
import { View, Pressable, TextInput, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Text } from '../../ui';
import { lightTokens, darkTokens, borderRadius as tokenRadius } from '../../design/tokens';

// Max height for expanded checklist: 40% of screen height (matches OverlayExpandedEditor)
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CHECKLIST_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.4);

/**
 * ChecklistInput - Interactive checkbox list for list-type logs
 * Replaces plain TextInput when effectiveLogSubtype === 'list'
 */
type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type ChecklistInputProps = {
  text: string;
  onChangeText: (text: string) => void;
  colorMode: 'light' | 'dark' | null | undefined;
  onFocus?: () => void;
  onBlur?: () => void;
  hasCamera?: boolean;
  /** Optional: make the checklist taller for expanded mode */
  expanded?: boolean;
};

/**
 * Strips leading checklist markers from text to prevent accumulation.
 * Removes patterns like "[x] ", "[ ] ", "- ", "• " from the beginning.
 */
function cleanItemText(rawText: string): string {
  let cleaned = rawText.trim();
  // Remove all leading "[x] " or "[ ] " patterns (handles accumulation)
  while (/^\[[xX ]\]\s*/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[[xX ]\]\s*/, '');
  }
  // Remove leading dash or bullet if present
  cleaned = cleaned.replace(/^[-•]\s*/, '');
  return cleaned.trim();
}

/**
 * Parses text into checklist items.
 * Supports formats:
 * - Comma-separated (≥3 items): "eggs, milk, bananas, yoghurt"
 * - Inline: "- eggs - milk - cereal"
 * - Newline with dashes: "- eggs\n- milk"
 * - Newline with bullets: "• eggs\n• milk"
 * - Checkbox format: "[ ] eggs\n[x] milk"
 */
export function parseChecklistText(text: string): ChecklistItem[] {
  const safeText = text || '';
  const parsed: ChecklistItem[] = [];

  // Special case: comma-separated list with no newlines (≥3 items to avoid false positives)
  if (!safeText.includes('\n') && safeText.includes(',')) {
    const parts = safeText
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      return parts.map((part, idx) => ({
        id: `item-${idx}`,
        text: cleanItemText(part),
        checked: false,
      }));
    }
  }

  // Try inline format: "- eggs - milk - cereal"
  if (safeText.includes(' - ')) {
    const parts = safeText.split(' - ').filter((part) => part.trim().length > 0);
    if (parts.length >= 2) {
      return parts.map((part, idx) => ({
        id: `item-${idx}`,
        text: cleanItemText(part),
        checked: false,
      }));
    }
  }

  // Try newline format: "- eggs\n- milk\n- cereal"
  const lines = safeText.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length >= 2) {
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      // Check for checkbox format: [ ] or [x]
      const checkboxMatch = trimmed.match(/^\[([xX ])\]\s*(.*)$/);
      if (checkboxMatch) {
        parsed.push({
          id: `item-${idx}`,
          text: cleanItemText(checkboxMatch[2]),
          checked: checkboxMatch[1].toLowerCase() === 'x',
        });
      }
      // Check for dash format: - item
      else if (trimmed.startsWith('- ')) {
        parsed.push({
          id: `item-${idx}`,
          text: cleanItemText(trimmed.substring(2)),
          checked: false,
        });
      }
      // Check for bullet format: • item
      else if (trimmed.startsWith('• ')) {
        parsed.push({
          id: `item-${idx}`,
          text: cleanItemText(trimmed.substring(2)),
          checked: false,
        });
      }
    });
  }

  return parsed.length > 0
    ? parsed
    : [{ id: 'item-0', text: cleanItemText(safeText), checked: false }];
}

/**
 * Converts checklist items back to text in checkbox format
 */
export function serializeChecklistItems(items: ChecklistItem[]): string {
  return items.map((item) => `[${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
}

export function ChecklistInput({
  text,
  onChangeText,
  colorMode,
  onFocus,
  onBlur,
  hasCamera = false,
  expanded = false,
}: ChecklistInputProps) {
  const isDark = colorMode === 'dark';

  // Parse text into checklist items
  const items = useMemo(() => parseChecklistText(text), [text]);

  const handleToggle = useCallback(
    (itemId: string) => {
      const itemIndex = parseInt(itemId.split('-')[1], 10);
      const newItems = [...items];
      newItems[itemIndex] = { ...newItems[itemIndex], checked: !newItems[itemIndex].checked };

      // Reconstruct text in checkbox format
      const newText = serializeChecklistItems(newItems);
      onChangeText(newText);
    },
    [items, onChangeText],
  );

  // Edit the text of a specific item
  const handleEditItemText = useCallback(
    (itemId: string, newItemText: string) => {
      const newItems = items.map((item) =>
        item.id === itemId ? { ...item, text: cleanItemText(newItemText) } : item,
      );

      // Rebuild the underlying text representation
      const newText = serializeChecklistItems(newItems);
      onChangeText(newText);
    },
    [items, onChangeText],
  );

  // Add a new empty item at the end
  const handleAddNewItem = useCallback(() => {
    const newItem: ChecklistItem = {
      id: `item-${items.length}`,
      checked: false,
      text: '',
    };

    const newItems = [...items, newItem];
    const newText = serializeChecklistItems(newItems);
    onChangeText(newText);
  }, [items, onChangeText]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? darkTokens.colors.deep : '#FAFAFA',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
          paddingRight: hasCamera ? 56 : 16,
          minHeight: expanded ? 150 : 120,
          // Use maxHeight when expanded to prevent overflow, remove unbounded flex
          maxHeight: expanded ? CHECKLIST_MAX_HEIGHT : undefined,
        },
      ]}
      onTouchStart={() => onFocus?.()}
      onTouchEnd={() => onBlur?.()}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <View key={item.id} style={styles.itemRow}>
              {/* Checkbox - only this is pressable */}
              <Pressable
                onPress={() => handleToggle(item.id)}
                style={({ pressed }) => [styles.checkboxPressable, { opacity: pressed ? 0.7 : 1 }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked }}
                accessibilityLabel={`Toggle ${item.text}`}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: item.checked
                        ? '#7C9885'
                        : isDark
                          ? 'rgba(255,255,255,0.3)'
                          : '#CCCCCC',
                      backgroundColor: item.checked ? '#7C9885' : 'transparent',
                    },
                  ]}
                >
                  {item.checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </Pressable>

              {/* Editable item text */}
              <TextInput
                style={[
                  styles.itemTextInput,
                  {
                    color: item.checked
                      ? isDark
                        ? 'rgba(255,255,255,0.5)'
                        : '#999999'
                      : isDark
                        ? darkTokens.colors.text
                        : lightTokens.colors.text,
                    textDecorationLine: item.checked ? 'line-through' : 'none',
                  },
                ]}
                value={item.text}
                onChangeText={(newText) => handleEditItemText(item.id, newText)}
                placeholder={isLast ? 'Add item...' : ''}
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                multiline={false}
                blurOnSubmit={false}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (isLast) {
                    handleAddNewItem();
                  }
                }}
                accessibilityLabel={`Edit item ${item.text}`}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: tokenRadius.md,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkboxPressable: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemText: {
    flex: 1,
    fontSize: 16,
  },
  itemTextInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
    margin: 0,
  },
});

export default ChecklistInput;
