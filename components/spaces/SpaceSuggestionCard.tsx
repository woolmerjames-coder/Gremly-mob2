/**
 * =============================================================================
 * SPACE SUGGESTION CARD
 * =============================================================================
 *
 * Card component displayed on SpacesScreen when AI suggests creating a new Space.
 * Shows suggestion details with actions to accept, decline, or view the drops.
 *
 * FEATURES:
 * - Displays suggested space name and reason
 * - Shows count of items that would be assigned
 * - Accept: Creates space, assigns drops, navigates to SpaceHome
 * - Decline: Dismisses the suggestion
 * - View items: Shows inline list of drops
 *
 * =============================================================================
 */

import { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react-native';

import { Text } from '../../ui';
import type { SpaceSuggestion, Todo, Habit, Note } from '../../lib/types';
import { useEntitiesByIds, type DropEntity } from '../../lib/store/selectors';

/** Helper to get display title from a drop entity */
function getDropDisplayTitle(drop: DropEntity): string {
  if (drop._type === 'note') {
    const note = drop as Note;
    // Notes use title or body as fallback
    return note.title || note.body?.slice(0, 50) || 'Untitled note';
  }
  if (drop._type === 'habit') {
    const habit = drop as Habit;
    return habit.name || 'Untitled habit';
  }
  // Todo has name (new) or title (legacy)
  const todo = drop as Todo;
  return todo.name || todo.title || 'Untitled task';
}

interface SpaceSuggestionCardProps {
  suggestion: SpaceSuggestion;
  onAccept: () => void;
  onDecline: () => void;
}

export default function SpaceSuggestionCard({
  suggestion,
  onAccept,
  onDecline,
}: SpaceSuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  // Get the actual entities for the drop_ids
  const drops = useEntitiesByIds(suggestion.drop_ids);

  const handleAccept = useCallback(async () => {
    if (isAccepting) return;
    setIsAccepting(true);
    try {
      await onAccept();
    } finally {
      setIsAccepting(false);
    }
  }, [onAccept, isAccepting]);

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Generate a summary of items
  const itemCount = suggestion.drop_ids.length;
  const itemText = itemCount === 1 ? '1 item' : `${itemCount} items`;

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={14} color="#E0C47A" />
          <Text style={styles.headerText}>Suggested Space</Text>
        </View>
        <Pressable onPress={onDecline} style={styles.dismissButton} hitSlop={8}>
          <X size={18} color="#6A6F76" />
        </Pressable>
      </View>

      {/* Space name */}
      <Text style={styles.spaceName}>"{suggestion.suggested_name}"</Text>

      {/* Reason */}
      <View style={styles.reasonSection}>
        <View style={styles.itemBadge}>
          <Text style={styles.itemBadgeText}>{itemText}</Text>
        </View>
        {suggestion.reason && (
          <Text style={styles.reasonText} numberOfLines={3}>
            {suggestion.reason}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleToggleExpand}
          style={styles.viewItemsButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.viewItemsText}>View items</Text>
          {expanded ? (
            <ChevronUp size={16} color="#2E5540" />
          ) : (
            <ChevronDown size={16} color="#2E5540" />
          )}
        </Pressable>

        <Pressable
          onPress={handleAccept}
          style={[styles.createButton, isAccepting && styles.createButtonDisabled]}
          disabled={isAccepting}
        >
          <Text style={styles.createButtonText}>
            {isAccepting ? 'Creating...' : 'Create Space'}
          </Text>
        </Pressable>
      </View>

      {/* Expanded items list */}
      {expanded && drops.length > 0 && (
        <View style={styles.dropsList}>
          {drops.slice(0, 5).map((drop) => (
            <View key={drop.id} style={styles.dropItem}>
              <Text style={styles.dropType}>
                {drop._type === 'todo' ? '☑️' : drop._type === 'habit' ? '🔄' : '📝'}
              </Text>
              <Text style={styles.dropTitle} numberOfLines={1}>
                {getDropDisplayTitle(drop)}
              </Text>
            </View>
          ))}
          {drops.length > 5 && <Text style={styles.moreItems}>+{drops.length - 5} more items</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E8F0E9',
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#E0C47A', // goldenPear accent
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A6F76',
  },
  dismissButton: {
    padding: 4,
  },
  spaceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  reasonSection: {
    marginBottom: 16,
    gap: 8,
  },
  itemBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  itemBadgeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2E5540',
  },
  reasonText: {
    fontSize: 14,
    color: '#6A6F76',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewItemsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  viewItemsText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E5540',
  },
  createButton: {
    backgroundColor: '#2E5540',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dropsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  dropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  dropType: {
    fontSize: 14,
  },
  dropTitle: {
    fontSize: 14,
    color: '#222222',
    flex: 1,
  },
  moreItems: {
    fontSize: 13,
    color: '#6A6F76',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
