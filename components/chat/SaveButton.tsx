/**
 * SaveButton - Animated save suggestion button for Space Chat
 *
 * Appears after assistant messages when saveable content is detected.
 * Has three visual states:
 *   - Initial: "Save this" with save icon
 *   - Loading: "Saving..." with animation
 *   - Confirmed: "Saved as [Type] ✓" with [Edit] and [X] buttons
 *
 * @example
 * ```tsx
 * <SaveButton
 *   suggestedType="todo"
 *   visible={showSaveButton}
 *   state="initial"
 *   onSave={() => handleSave()}
 *   onEdit={() => handleEdit()}
 *   onDismiss={() => handleDismiss()}
 *   disabled={isSaving}
 * />
 * ```
 */

import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Bookmark, CheckCircle, Pencil } from 'lucide-react-native';
import type { SaveableType } from '../../lib/chat/saveableTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SaveButtonState = 'initial' | 'loading' | 'confirmed';

/** Simplified type for saved items (maps to SaveableType internally) */
export type SavedItemType = 'habit' | 'todo' | 'log';

export interface SaveButtonProps {
  /** What type of entity will be saved (used for confirmed state display) */
  suggestedType?: SaveableType;
  /** Current visual state of the button */
  state?: SaveButtonState;
  /** Simplified saved type for confirmed state (alternative to suggestedType) */
  savedType?: SavedItemType;
  /** The ID of the saved item (for Edit to open overlay) */
  savedItemId?: string;
  /** The name of the entity this was saved to (for confirmed state) */
  entityName?: string;
  /** Called when user taps Save (instant save) - only in initial state */
  onSave: () => void;
  /** Called when user taps Edit - only in confirmed state */
  onEdit: () => void;
  /** Called when user dismisses (X button) - only in confirmed state */
  onDismiss: () => void;
  /** Whether button is visible */
  visible: boolean;
  /** Disable interaction during saving */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Display Configuration (for confirmed state only)
// ─────────────────────────────────────────────────────────────────────────────

const CONFIRMED_LABELS: Record<SaveableType, string> = {
  todo: 'Saved as To-Do',
  habit: 'Saved as Habit',
  'log-general': 'Saved as Note',
  'log-idea': 'Saved as Idea',
  'log-journal': 'Saved as Journal',
};

/** Mapping from simplified SavedItemType to display label */
const SAVED_TYPE_LABELS: Record<SavedItemType, string> = {
  todo: 'Saved as To-Do',
  habit: 'Saved as Habit',
  log: 'Saved as Note',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SaveButton({
  suggestedType,
  state = 'initial',
  savedType,
  savedItemId: _savedItemId,
  entityName,
  onSave,
  onEdit,
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

  // Get the display label for confirmed state
  const getConfirmedLabel = (): string => {
    // If entityName is provided, show "Saved to [Entity Name]"
    if (entityName) {
      // Truncate long names
      const truncatedName = entityName.length > 25 ? entityName.slice(0, 25) + '...' : entityName;
      return `Saved to ${truncatedName}`;
    }
    // Prefer savedType if provided
    if (savedType) {
      return SAVED_TYPE_LABELS[savedType] || 'Saved';
    }
    // Fall back to suggestedType
    if (suggestedType) {
      return CONFIRMED_LABELS[suggestedType] || 'Saved';
    }
    return 'Saved';
  };

  // Render based on current state
  const renderContent = () => {
    switch (state) {
      case 'loading':
        return (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#8BA888" style={styles.loadingSpinner} />
            <Text style={styles.loadingText}>Saving...</Text>
          </View>
        );

      case 'confirmed':
        return (
          <View style={styles.confirmedSimple}>
            <CheckCircle size={16} color="#4A7C59" style={styles.checkIcon} />
            <Text style={styles.confirmedSimpleText}>{getConfirmedLabel()}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.dismissButtonSimple,
                pressed && styles.dismissButtonPressed,
              ]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={styles.dismissTextSimple}>×</Text>
            </Pressable>
          </View>
        );

      case 'initial':
      default:
        return (
          <Pressable
            style={({ pressed }) => [
              styles.saveThisButton,
              pressed && styles.saveThisButtonPressed,
              disabled && styles.saveThisButtonDisabled,
            ]}
            onPress={() => {
              console.log('[SaveButton] Save this button pressed!');
              onSave();
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Save this content"
          >
            <Bookmark size={18} color="#FFFFFF" style={styles.saveIcon} />
            <Text style={[styles.saveThisText, disabled && styles.saveThisTextDisabled]}>
              Save this
            </Text>
          </Pressable>
        );
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} accessibilityRole="none">
      {renderContent()}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFEF5', // Warm cream
    minWidth: 200,
    maxWidth: 400,
    alignSelf: 'flex-start',
    marginVertical: 8,
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

  // Initial State: "Save this" button
  saveThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8BA888', // Sage green
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveThisButtonPressed: {
    backgroundColor: '#7A9777', // Darker sage on press
  },
  saveThisButtonDisabled: {
    backgroundColor: '#C4C4C4',
  },
  saveIcon: {
    marginRight: 8,
  },
  saveThisText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  saveThisTextDisabled: {
    color: '#F0F0F0',
  },

  // Loading State
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingSpinner: {
    marginRight: 8,
  },
  loadingText: {
    fontSize: 15,
    color: '#8BA888',
    fontWeight: '500',
  },

  // Confirmed State
  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkIcon: {
    marginRight: 8,
  },
  confirmedText: {
    fontSize: 14,
    color: '#2E5540',
    fontWeight: '600',
  },
  // Simpler confirmed state styles (for entity chat)
  confirmedSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 124, 89, 0.1)', // Light sage green background
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 180, // Ensures enough room for "Saved as To-Do" or entity names
  },
  confirmedSimpleText: {
    fontSize: 13,
    color: '#4A7C59',
    fontWeight: '500',
    flex: 1,
    marginLeft: 6,
  },
  dismissButtonSimple: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  dismissTextSimple: {
    fontSize: 18,
    color: '#999',
    fontWeight: '300',
  },
  confirmedButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  editButtonConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#8BA888',
  },
  editButtonConfirmedPressed: {
    backgroundColor: 'rgba(139, 168, 136, 0.1)',
  },
  editIcon: {
    marginRight: 4,
  },
  editButtonConfirmedText: {
    color: '#8BA888',
    fontSize: 13,
    fontWeight: '600',
  },
  dismissButtonConfirmed: {
    width: 28,
    height: 28,
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
