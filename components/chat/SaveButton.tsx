/**
 * SaveButton - Animated save suggestion button for Space Chat
 *
 * Appears after assistant messages when saveable content is detected.
 * Shows type-specific icon and label with Save/Dismiss actions.
 *
 * @example
 * ```tsx
 * <SaveButton
 *   suggestedType="todo"
 *   visible={showSaveButton}
 *   onSave={() => handleSave()}
 *   onDismiss={() => handleDismiss()}
 *   disabled={isSaving}
 * />
 * ```
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, Platform } from 'react-native';
import type { SaveableType } from '../../lib/chat/saveableTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveButtonProps {
  /** What type of entity will be saved */
  suggestedType: SaveableType;
  /** Called when user taps Save */
  onSave: () => void;
  /** Called when user dismisses (X button or swipe) */
  onDismiss: () => void;
  /** Whether button is visible */
  visible: boolean;
  /** Disable interaction during saving */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Display Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface TypeDisplay {
  emoji: string;
  label: string;
}

const TYPE_DISPLAY: Record<SaveableType, TypeDisplay> = {
  todo: { emoji: '📋', label: 'Save as task' },
  habit: { emoji: '🔁', label: 'Save as habit' },
  'log-general': { emoji: '📝', label: 'Save as note' },
  'log-list': { emoji: '📝', label: 'Save as list' },
  'log-idea': { emoji: '💡', label: 'Save as idea' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SaveButton({
  suggestedType,
  onSave,
  onDismiss,
  visible,
  disabled = false,
}: SaveButtonProps): React.JSX.Element | null {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fadeAnim = useMemo(() => new Animated.Value(visible ? 1 : 0), []);

  // Fade in/out animation when visibility changes
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  // Don't render if not visible (after fade out)
  if (!visible) {
    return null;
  }

  const display = TYPE_DISPLAY[suggestedType] || TYPE_DISPLAY['log-general'];
  const accessibilityLabelText = `${display.label}. Tap to save this ${suggestedType === 'todo' ? 'task' : suggestedType === 'habit' ? 'habit' : 'note'} to your collection.`;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} accessibilityRole="none">
      {/* Type Icon & Label */}
      <View style={styles.labelContainer}>
        <Text style={styles.emoji}>{display.emoji}</Text>
        <Text style={styles.labelText}>{display.label}</Text>
      </View>

      {/* Save Button */}
      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.saveButtonPressed,
          disabled && styles.saveButtonDisabled,
        ]}
        onPress={onSave}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabelText}
        accessibilityHint="Saves this content to your Gremly collection"
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.saveButtonText, disabled && styles.saveButtonTextDisabled]}>Save</Text>
      </Pressable>

      {/* Dismiss Button */}
      <Pressable
        style={({ pressed }) => [styles.dismissButton, pressed && styles.dismissButtonPressed]}
        onPress={onDismiss}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Dismiss save suggestion"
        accessibilityHint="Hides this save suggestion"
      >
        <Text style={styles.dismissText}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFEF5', // Warm cream
    maxWidth: 320,
    alignSelf: 'flex-start',
    marginVertical: 8,
    marginHorizontal: 16,
    // Shadow - iOS
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emoji: {
    fontSize: 18,
    marginRight: 8,
  },
  labelText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#8BA888', // Sage green
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  saveButtonPressed: {
    backgroundColor: '#7A9777', // Darker sage on press
  },
  saveButtonDisabled: {
    backgroundColor: '#C4C4C4',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#F0F0F0',
  },
  dismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  dismissButtonPressed: {
    opacity: 0.5,
  },
  dismissText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '400',
  },
});
