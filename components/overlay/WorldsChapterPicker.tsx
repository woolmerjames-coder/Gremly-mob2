/**
 * WorldsChapterPicker — multi-select bottom sheet for linking an entity
 * to chapters (grouped by world). Replaces the legacy SpaceSelectorBottomSheet
 * for the Worlds row in the unified overlay (F.4).
 *
 * Commits on Save: inserts/deletes drop_chapter_links in Supabase, then
 * updates Zustand state immediately so chips re-render without a full reload.
 * Closed-chapter links are not in the picker list and are never touched.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { useActiveChaptersGroupedByWorld } from '../../lib/store/chaptersSelectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAuth } from '../../providers/AuthProvider';
import type { DropType } from '../../lib/supabase/types';
import { nowTimestamp } from '../../lib/date/DateService';

interface WorldsChapterPickerProps {
  visible: boolean;
  entityId: string | null;
  entityDropType: DropType;
  onClose: () => void;
}

export function WorldsChapterPicker({
  visible,
  entityId,
  entityDropType,
  onClose,
}: WorldsChapterPickerProps) {
  const groups = useActiveChaptersGroupedByWorld();
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const { userId } = useAuth();

  // Set of chapter IDs selected in the picker
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Set of chapter IDs that were linked when the sheet opened (closed-chapter
  // links excluded — those are invisible to the picker)
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Populate selections from current dropChapterLinks whenever the sheet opens
  useEffect(() => {
    if (!visible) return;
    if (!entityId) {
      setSelected(new Set());
      setInitialSelected(new Set());
      return;
    }
    // Collect all IDs the active-chapters list knows about (open chapters only)
    const activeChapterIds = new Set<string>();
    for (const g of groups) {
      for (const c of g.chapters) activeChapterIds.add(c.id);
    }
    // Pre-select only active-chapter links (closed ones are invisible)
    const linked = new Set<string>();
    for (const link of dropChapterLinks) {
      if (link.drop_id === entityId && activeChapterIds.has(link.chapter_id)) {
        linked.add(link.chapter_id);
      }
    }
    setSelected(new Set(linked));
    setInitialSelected(new Set(linked));
    setSaveError(null);
    setSaving(false);
  }, [visible, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((chapterId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!entityId || !userId || saving) return;
    setSaving(true);
    setSaveError(null);

    const toAdd = [...selected].filter((id) => !initialSelected.has(id));
    const toRemove = [...initialSelected].filter((id) => !selected.has(id));

    try {
      const { supabase } = await import('../../lib/supabase/client');

      // Insert new links
      if (toAdd.length > 0) {
        const rows = toAdd.map((chapterId) => ({
          drop_id: entityId,
          drop_type: entityDropType,
          chapter_id: chapterId,
          owner_id: userId,
          relevance_score: 1.0,
          assigned_by: 'user' as const,
          reason: null,
        }));
        const { error } = await supabase.from('drop_chapter_links').upsert(rows, {
          onConflict: 'drop_id,chapter_id',
          ignoreDuplicates: true,
        });
        if (error) throw error;
      }

      // Delete removed links
      for (const chapterId of toRemove) {
        const { error } = await supabase
          .from('drop_chapter_links')
          .delete()
          .eq('drop_id', entityId)
          .eq('chapter_id', chapterId);
        if (error) throw error;
      }

      // Update Zustand immediately so chips re-render
      useGremlyStore.setState((state) => {
        let links = state.dropChapterLinks.filter(
          (l) => !(l.drop_id === entityId && toRemove.includes(l.chapter_id)),
        );
        for (const chapterId of toAdd) {
          links = [
            ...links,
            {
              drop_id: entityId,
              drop_type: entityDropType,
              chapter_id: chapterId,
              owner_id: userId,
              relevance_score: 1.0,
              assigned_by: 'user' as const,
              reason: null,
              created_at: nowTimestamp(),
              last_confirmed_at: null,
            },
          ];
        }
        return { dropChapterLinks: links };
      });

      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Try again.');
      setSaving(false);
    }
  }, [entityId, userId, entityDropType, selected, initialSelected, saving, onClose]);

  const totalActive = groups.reduce((n, g) => n + g.chapters.length, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.head}>
            <Text style={styles.title}>Add to Worlds & Chapters</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={lightTokens.colors.warmGrey} />
            </Pressable>
          </View>

          {/* Body */}
          {totalActive === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active chapters yet.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {groups.map((group) => (
                <View key={group.worldId}>
                  {/* World section header */}
                  <View style={styles.sectionHeader}>
                    <View style={[styles.worldDot, { backgroundColor: group.worldAccentColor }]} />
                    <Text style={styles.sectionLabel}>{group.worldName.toUpperCase()}</Text>
                  </View>

                  {/* Chapter rows */}
                  {group.chapters.map((chapter) => {
                    const isSelected = selected.has(chapter.id);
                    return (
                      <Pressable
                        key={chapter.id}
                        onPress={() => toggle(chapter.id)}
                        style={({ pressed }) => [
                          styles.chapterRow,
                          pressed && styles.chapterRowPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            isSelected && {
                              backgroundColor: group.worldAccentColor,
                              borderColor: group.worldAccentColor,
                            },
                          ]}
                        >
                          {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={2.5} />}
                        </View>
                        <Text
                          style={[styles.chapterTitle, isSelected && styles.chapterTitleSelected]}
                        >
                          {chapter.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Error */}
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !entityId}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.worldsCardBorder,
    marginBottom: 14,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: lightTokens.colors.worldsInk,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingTop: 16,
  },
  worldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  chapterRowPressed: {
    opacity: 0.6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: lightTokens.colors.worldsCardBorder,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterTitle: {
    flex: 1,
    fontSize: 15,
    color: lightTokens.colors.worldsInk,
    fontFamily: 'Inter-Regular',
  },
  chapterTitleSelected: {
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
  },
  error: {
    fontSize: 13,
    color: lightTokens.colors.blockerRed,
    marginTop: 8,
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightTokens.colors.worldsCardBorder,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    color: lightTokens.colors.worldsInkSoft,
    fontFamily: 'Inter-Medium',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: lightTokens.colors.worldsInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
});
