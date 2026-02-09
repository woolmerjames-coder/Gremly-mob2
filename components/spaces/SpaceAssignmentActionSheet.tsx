/**
 * =============================================================================
 * SPACE ASSIGNMENT ACTION SHEET
 * =============================================================================
 *
 * Bottom sheet (~60% height) that slides up when entering a Space with pending
 * assignment suggestions. Less intrusive than the full-screen version.
 *
 * FEATURES:
 * - Shows suggested drops with checkboxes
 * - Pre-selects items with confidence >= 80%
 * - Add: assigns selected drops and accepts suggestions
 * - Skip: declines suggestions without adding
 * - Swipe down to dismiss (same as Skip)
 *
 * =============================================================================
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import ActionSheet, { SheetManager, ScrollView } from 'react-native-actions-sheet';
import { ChevronRight, Check } from 'lucide-react-native';

import { Text } from '../../ui';
import type { SpaceSuggestion, Todo, Habit, Note } from '../../lib/types';
import { useEntitiesByIds, type DropEntity } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

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

export interface SpaceAssignmentSheetPayload {
  spaceId: string;
  spaceName: string;
  suggestions: SpaceSuggestion[];
  onComplete?: () => void;
}

interface SpaceAssignmentActionSheetProps {
  sheetId: string;
  payload?: SpaceAssignmentSheetPayload;
}

function SpaceAssignmentActionSheet({ sheetId, payload }: SpaceAssignmentActionSheetProps) {
  const { spaceId, spaceName, suggestions, onComplete } = payload || {};

  const assignDropsToSpace = useGremlyStore((s) => s.assignDropsToSpace);
  const acceptSuggestion = useGremlyStore((s) => s.acceptSuggestion);
  const declineSuggestion = useGremlyStore((s) => s.declineSuggestion);

  // Get all drop IDs from suggestions
  const allDropIds = useMemo(() => suggestions?.flatMap((s) => s.drop_ids) || [], [suggestions]);

  const entities = useEntitiesByIds(allDropIds);

  // Build confidence map for each drop ID
  const confidenceMap = useMemo(() => {
    const map = new Map<string, number>();
    suggestions?.forEach((s) => {
      s.drop_ids.forEach((id) => {
        map.set(id, Math.max(map.get(id) || 0, s.confidence));
      });
    });
    return map;
  }, [suggestions]);

  // Sort by confidence (higher first)
  const sortedEntities = useMemo(() => {
    return [...entities].sort(
      (a, b) => (confidenceMap.get(b.id) || 0) - (confidenceMap.get(a.id) || 0),
    );
  }, [entities, confidenceMap]);

  // Selection state - pre-select high confidence items (>= 80%)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const selected = new Set<string>();
    allDropIds.forEach((id) => {
      if ((confidenceMap.get(id) || 0) >= 0.8) {
        selected.add(id);
      }
    });
    // If none are high confidence, select all
    if (selected.size === 0) {
      allDropIds.forEach((id) => selected.add(id));
    }
    return selected;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    if (isSubmitting || !spaceId) return;
    setIsSubmitting(true);

    try {
      // Assign selected drops to space
      if (selectedIds.size > 0) {
        await assignDropsToSpace(Array.from(selectedIds), spaceId);
      }

      // Mark suggestions as accepted (ignore errors - DB constraint may not match)
      for (const suggestion of suggestions || []) {
        try {
          await acceptSuggestion(suggestion.id);
        } catch (e) {
          // Ignore individual suggestion errors - already removed from local state
          console.warn('[SpaceAssignmentSheet] Could not accept suggestion:', suggestion.id);
        }
      }

      await SheetManager.hide('space-assignment');
      onComplete?.();
    } catch (err) {
      console.error('[SpaceAssignmentSheet] Error adding items:', err);
      // Still close the sheet even on error
      await SheetManager.hide('space-assignment');
      onComplete?.();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    spaceId,
    selectedIds,
    suggestions,
    assignDropsToSpace,
    acceptSuggestion,
    onComplete,
  ]);

  const handleSkip = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Mark suggestions as declined (ignore errors - DB constraint may not match)
      for (const suggestion of suggestions || []) {
        try {
          await declineSuggestion(suggestion.id);
        } catch (e) {
          // Ignore individual suggestion errors - already removed from local state
          console.warn('[SpaceAssignmentSheet] Could not decline suggestion:', suggestion.id);
        }
      }

      await SheetManager.hide('space-assignment');
      onComplete?.();
    } catch (err) {
      console.error('[SpaceAssignmentSheet] Error skipping:', err);
      // Still close the sheet even on error
      await SheetManager.hide('space-assignment');
      onComplete?.();
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, suggestions, declineSuggestion, onComplete]);

  const selectedCount = selectedIds.size;

  return (
    <ActionSheet
      id={sheetId}
      gestureEnabled
      drawUnderStatusBar={false}
      indicatorStyle={styles.indicator}
      containerStyle={styles.sheetContainer}
      closable
      closeOnPressBack
      closeOnTouchBackdrop
      onClose={handleSkip}
    >
      <View style={styles.content}>
        {/* Header */}
        <Text style={styles.header}>I found items for {spaceName || 'this space'}</Text>
        <Text style={styles.subheader}>
          {sortedEntities.length} item{sortedEntities.length !== 1 ? 's' : ''} might belong here
        </Text>

        {/* Items list */}
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {sortedEntities.map((entity, index) => {
            const isSelected = selectedIds.has(entity.id);
            const confidence = confidenceMap.get(entity.id) || 0;
            const isLast = index === sortedEntities.length - 1;

            return (
              <Pressable
                key={entity.id}
                style={[styles.itemRow, !isLast && styles.itemRowBorder]}
                onPress={() => toggleItem(entity.id)}
              >
                {/* Checkbox */}
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                </View>

                {/* Content */}
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {getDropDisplayTitle(entity)}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {getEntityTypeLabel(entity._type)}
                    {confidence < 0.8 && ` · ${Math.round(confidence * 100)}%`}
                  </Text>
                </View>

                {/* Chevron (decorative) */}
                <ChevronRight size={18} color="#9CA3AF" />
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.addButton, selectedCount === 0 && styles.addButtonDisabled]}
            onPress={handleAdd}
            disabled={selectedCount === 0 || isSubmitting}
          >
            <Text style={styles.addButtonText}>
              {isSubmitting
                ? 'Adding...'
                : `Add ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
            </Text>
          </Pressable>

          <Pressable style={styles.skipButton} onPress={handleSkip} disabled={isSubmitting}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    backgroundColor: '#F9F6F1', // linenCream
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  indicator: {
    backgroundColor: '#D1D5DB',
    width: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontWeight: '600',
    color: '#222222',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  subheader: {
    fontSize: 14,
    color: '#6A6F76',
    textAlign: 'center',
    marginBottom: 20,
  },
  list: {
    maxHeight: 300,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2E5540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#2E5540',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222222',
  },
  itemMeta: {
    fontSize: 13,
    color: '#6A6F76',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  addButton: {
    flex: 1,
    backgroundColor: '#E8F0E9', // sageMist
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E5540', // mossGreen text on sage background
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6A6F76',
  },
});

export default SpaceAssignmentActionSheet;
