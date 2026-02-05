/**
 * =============================================================================
 * SPACE ASSIGNMENT SHEET
 * =============================================================================
 *
 * Full-screen sheet that appears when entering a Space that has pending
 * assignment suggestions. User can review and confirm which drops to add.
 *
 * FEATURES:
 * - Shows list of suggested drops with checkboxes
 * - Pre-selects items with confidence >= 80%
 * - Add Selected: assigns drops and marks suggestions accepted
 * - Skip: dismisses suggestions without adding
 * - Option to disable suggestions for this space
 *
 * =============================================================================
 */

import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check } from 'lucide-react-native';

import { Text } from '../../ui';
import MascotIcon from '../../components/MascotIcon';
import type { SpaceSuggestion, Todo, Habit, Note } from '../../lib/types';
import { useEntitiesByIds, type DropEntity } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

interface SpaceAssignmentSheetProps {
  spaceId: string;
  spaceName: string;
  suggestions: SpaceSuggestion[];
  onComplete: () => void;
  onDisableSuggestions: () => void;
}

/** Helper to get display title from a drop entity */
function getDropDisplayTitle(drop: DropEntity): string {
  if (drop._type === 'note') {
    const note = drop as Note;
    return note.title || note.body?.slice(0, 50) || 'Untitled note';
  }
  if (drop._type === 'habit') {
    const habit = drop as Habit;
    return habit.name || 'Untitled habit';
  }
  const todo = drop as Todo;
  return todo.name || todo.title || 'Untitled task';
}

/** Get entity type label for display */
function getEntityTypeLabel(type: 'todo' | 'note' | 'habit'): string {
  switch (type) {
    case 'todo':
      return 'Todo';
    case 'habit':
      return 'Habit';
    case 'note':
      return 'Note';
    default:
      return 'Item';
  }
}

export default function SpaceAssignmentSheet({
  spaceId,
  spaceName,
  suggestions,
  onComplete,
  onDisableSuggestions,
}: SpaceAssignmentSheetProps) {
  const assignDropsToSpace = useGremlyStore((s) => s.assignDropsToSpace);
  const acceptSuggestion = useGremlyStore((s) => s.acceptSuggestion);
  const declineSuggestion = useGremlyStore((s) => s.declineSuggestion);
  const updateSpace = useGremlyStore((s) => s.updateSpace);

  // Collect all drop IDs from all suggestions
  const allDropIds = useMemo(() => suggestions.flatMap((s) => s.drop_ids), [suggestions]);
  const entities = useEntitiesByIds(allDropIds);

  // Build confidence map for each drop ID
  const confidenceMap = useMemo(() => {
    const map = new Map<string, number>();
    suggestions.forEach((s) => {
      s.drop_ids.forEach((id) => {
        map.set(id, Math.max(map.get(id) || 0, s.confidence));
      });
    });
    return map;
  }, [suggestions]);

  // Order by confidence (higher confidence suggestions first)
  const orderedEntities = useMemo(() => {
    return [...entities].sort(
      (a, b) => (confidenceMap.get(b.id) || 0) - (confidenceMap.get(a.id) || 0),
    );
  }, [entities, confidenceMap]);

  // State: pre-select items with confidence >= 80%
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const highConfidence = new Set<string>();
    suggestions.forEach((s) => {
      if (s.confidence >= 0.8) {
        s.drop_ids.forEach((id) => highConfidence.add(id));
      }
    });
    return highConfidence;
  });

  const [disableSuggestions, setDisableSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAddSelected = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Assign selected drops to the space
      if (selectedIds.size > 0) {
        await assignDropsToSpace(Array.from(selectedIds), spaceId);
      }

      // Mark all suggestions as accepted
      for (const suggestion of suggestions) {
        await acceptSuggestion(suggestion.id);
      }

      // Optionally disable suggestions for this space
      if (disableSuggestions) {
        await updateSpace(spaceId, { disable_suggestions: true });
        onDisableSuggestions();
      }

      onComplete();
    } catch (err) {
      console.error('[SpaceAssignmentSheet] Error adding drops:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    selectedIds,
    spaceId,
    suggestions,
    disableSuggestions,
    assignDropsToSpace,
    acceptSuggestion,
    updateSpace,
    onDisableSuggestions,
    onComplete,
  ]);

  const handleSkip = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Decline all suggestions
      for (const suggestion of suggestions) {
        await declineSuggestion(suggestion.id);
      }

      // Optionally disable suggestions for this space
      if (disableSuggestions) {
        await updateSpace(spaceId, { disable_suggestions: true });
        onDisableSuggestions();
      }

      onComplete();
    } catch (err) {
      console.error('[SpaceAssignmentSheet] Error skipping:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    suggestions,
    disableSuggestions,
    spaceId,
    declineSuggestion,
    updateSpace,
    onDisableSuggestions,
    onComplete,
  ]);

  const selectedCount = selectedIds.size;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Dismiss button */}
        <Pressable
          onPress={handleSkip}
          style={styles.dismissButton}
          hitSlop={12}
          disabled={isSubmitting}
        >
          <X size={24} color="#6A6F76" />
        </Pressable>

        {/* Mascot */}
        <View style={styles.mascotContainer}>
          <MascotIcon size={80} />
        </View>

        {/* Header */}
        <Text style={styles.header}>Gremly found items for {spaceName}</Text>
        <Text style={styles.subheader}>These might belong in this space:</Text>

        {/* Items list */}
        <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
          {orderedEntities.map((entity) => {
            const isSelected = selectedIds.has(entity.id);
            const confidence = confidenceMap.get(entity.id) || 0;
            const showConfidence = confidence < 0.8;

            return (
              <Pressable
                key={entity.id}
                onPress={() => toggleSelection(entity.id)}
                style={styles.itemRow}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {getDropDisplayTitle(entity)}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {getEntityTypeLabel(entity._type)}
                    {showConfidence && ` · ${Math.round(confidence * 100)}% match`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Opt-out checkbox */}
        <Pressable onPress={() => setDisableSuggestions((prev) => !prev)} style={styles.optOutRow}>
          <View style={[styles.checkbox, disableSuggestions && styles.checkboxChecked]}>
            {disableSuggestions && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
          </View>
          <Text style={styles.optOutText}>Don't suggest items for this space</Text>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleAddSelected}
          style={[styles.addButton, isSubmitting && styles.addButtonDisabled]}
          disabled={isSubmitting}
        >
          <Text style={styles.addButtonText}>
            {isSubmitting
              ? 'Adding...'
              : selectedCount > 0
                ? `Add Selected (${selectedCount})`
                : 'Add Selected'}
          </Text>
        </Pressable>

        <Pressable onPress={handleSkip} style={styles.skipButton} disabled={isSubmitting}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F1',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  dismissButton: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  mascotContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#222222',
    textAlign: 'center',
    marginBottom: 8,
  },
  subheader: {
    fontSize: 15,
    color: '#6A6F76',
    textAlign: 'center',
    marginBottom: 24,
  },
  itemsList: {
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2E5540',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2E5540',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222222',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 13,
    color: '#6A6F76',
  },
  optOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  optOutText: {
    fontSize: 14,
    color: '#6A6F76',
    marginLeft: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  addButton: {
    backgroundColor: '#2E5540',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2E5540',
  },
});
