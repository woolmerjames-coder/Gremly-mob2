/**
 * WorldsChapterPicker — multi-select bottom sheet for linking an entity
 * to worlds AND chapters independently (F.4 fix).
 *
 * Layout: world pill chips (top) + flat active-chapter list with world meta (below).
 * Worlds and chapters are toggled independently.
 * Save diffs and persists drop_world_links + drop_chapter_links separately.
 * Closed-chapter links are preserved (invisible to picker).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { selectWorldPalette } from '../../lib/store/worldsSelectors';
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
  const worlds = useGremlyStore((s) => s.worlds);
  const chapters = useGremlyStore((s) => s.chapters);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const { userId } = useAuth();

  // All worlds sorted alphabetically with palette colours
  const sortedWorlds = useMemo(() => {
    const sorted = [...worlds].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.map((w) => {
      const palette = selectWorldPalette({ worlds } as any, w.id);
      return { worldId: w.id, worldName: w.name, worldAccentColor: palette.dot };
    });
  }, [worlds]);

  // Fast lookup: worldId → { name, accentColor }
  const worldPaletteMap = useMemo(() => {
    const map = new Map<string, { name: string; accentColor: string }>();
    for (const w of sortedWorlds)
      map.set(w.worldId, { name: w.worldName, accentColor: w.worldAccentColor });
    return map;
  }, [sortedWorlds]);

  // Flat list of active chapters sorted by start_date DESC
  const flatChapters = useMemo(() => {
    const active = chapters.filter((c) => c.closed_at == null);
    const result = active.map((c) => {
      const world = worldPaletteMap.get(c.primary_world_id ?? '');
      return {
        id: c.id,
        title: c.title,
        startDate: c.start_date ?? null,
        worldId: c.primary_world_id ?? null,
        worldName: world?.name ?? null,
        worldAccentColor: world?.accentColor ?? null,
      };
    });
    result.sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return b.startDate.localeCompare(a.startDate);
    });
    return result;
  }, [chapters, worldPaletteMap]);

  // Two independent selection sets
  const [selectedWorlds, setSelectedWorlds] = useState<Set<string>>(new Set());
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [initialWorlds, setInitialWorlds] = useState<Set<string>>(new Set());
  const [initialChapters, setInitialChapters] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Populate both sets from Zustand when the sheet opens
  useEffect(() => {
    if (!visible) return;
    if (!entityId) {
      setSelectedWorlds(new Set());
      setSelectedChapters(new Set());
      setInitialWorlds(new Set());
      setInitialChapters(new Set());
      return;
    }

    const wLinked = new Set<string>();
    for (const link of dropWorldLinks) {
      if (link.drop_id === entityId) wLinked.add(link.world_id);
    }
    setSelectedWorlds(new Set(wLinked));
    setInitialWorlds(new Set(wLinked));

    // Only active (open) chapter links — closed-chapter links are preserved silently
    const activeChapterIds = new Set<string>();
    for (const c of flatChapters) activeChapterIds.add(c.id);
    const cLinked = new Set<string>();
    for (const link of dropChapterLinks) {
      if (link.drop_id === entityId && activeChapterIds.has(link.chapter_id)) {
        cLinked.add(link.chapter_id);
      }
    }
    setSelectedChapters(new Set(cLinked));
    setInitialChapters(new Set(cLinked));
    setSaveError(null);
    setSaving(false);
  }, [visible, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleWorld = useCallback((worldId: string) => {
    setSelectedWorlds((prev) => {
      const next = new Set(prev);
      if (next.has(worldId)) next.delete(worldId);
      else next.add(worldId);
      return next;
    });
  }, []);

  const toggleChapter = useCallback((chapterId: string) => {
    setSelectedChapters((prev) => {
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

    const worldsToAdd = [...selectedWorlds].filter((id) => !initialWorlds.has(id));
    const worldsToRemove = [...initialWorlds].filter((id) => !selectedWorlds.has(id));
    const chaptersToAdd = [...selectedChapters].filter((id) => !initialChapters.has(id));
    const chaptersToRemove = [...initialChapters].filter((id) => !selectedChapters.has(id));

    try {
      const { supabase } = await import('../../lib/supabase/client');

      // ── drop_world_links ──────────────────────────────────────────────────
      if (worldsToAdd.length > 0) {
        const rows = worldsToAdd.map((worldId) => ({
          drop_id: entityId,
          drop_type: entityDropType,
          world_id: worldId,
          owner_id: userId,
          relevance_score: 1.0,
          assigned_by: 'user' as const,
          reason: null,
        }));
        const { error } = await supabase.from('drop_world_links').upsert(rows, {
          onConflict: 'drop_id,world_id',
          ignoreDuplicates: true,
        });
        if (error) throw error;
      }
      for (const worldId of worldsToRemove) {
        const { error } = await supabase
          .from('drop_world_links')
          .delete()
          .eq('drop_id', entityId)
          .eq('world_id', worldId);
        if (error) throw error;
      }

      // ── drop_chapter_links ────────────────────────────────────────────────
      if (chaptersToAdd.length > 0) {
        const rows = chaptersToAdd.map((chapterId) => ({
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
      for (const chapterId of chaptersToRemove) {
        const { error } = await supabase
          .from('drop_chapter_links')
          .delete()
          .eq('drop_id', entityId)
          .eq('chapter_id', chapterId);
        if (error) throw error;
      }

      // Update Zustand immediately so chips re-render without a full store reload
      useGremlyStore.setState((state) => {
        let wLinks = state.dropWorldLinks.filter(
          (l) => !(l.drop_id === entityId && worldsToRemove.includes(l.world_id)),
        );
        for (const worldId of worldsToAdd) {
          wLinks = [
            ...wLinks,
            {
              drop_id: entityId,
              drop_type: entityDropType,
              world_id: worldId,
              owner_id: userId,
              relevance_score: 1.0,
              assigned_by: 'user' as const,
              reason: null,
              created_at: nowTimestamp(),
              last_confirmed_at: null,
            },
          ];
        }

        let cLinks = state.dropChapterLinks.filter(
          (l) => !(l.drop_id === entityId && chaptersToRemove.includes(l.chapter_id)),
        );
        for (const chapterId of chaptersToAdd) {
          cLinks = [
            ...cLinks,
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

        return { dropWorldLinks: wLinks, dropChapterLinks: cLinks };
      });

      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Try again.');
      setSaving(false);
    }
  }, [
    entityId,
    userId,
    entityDropType,
    selectedWorlds,
    selectedChapters,
    initialWorlds,
    initialChapters,
    saving,
    onClose,
  ]);

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
          {sortedWorlds.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No worlds yet.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Region 1 — World pills */}
              <View style={styles.pillRow}>
                {sortedWorlds.map((w) => {
                  const checked = selectedWorlds.has(w.worldId);
                  return (
                    <Pressable
                      key={w.worldId}
                      onPress={() => toggleWorld(w.worldId)}
                      style={({ pressed }) => [
                        styles.pill,
                        checked
                          ? {
                              backgroundColor: w.worldAccentColor + '33',
                              borderColor: w.worldAccentColor,
                            }
                          : styles.pillUnselected,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={[styles.pillDot, { backgroundColor: w.worldAccentColor }]} />
                      <Text style={[styles.pillText, checked && styles.pillTextSelected]}>
                        {w.worldName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Section break */}
              {flatChapters.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>ACTIVE CHAPTERS</Text>
                </>
              )}

              {/* Region 2 — Flat chapter list */}
              {flatChapters.map((chapter) => {
                const checked = selectedChapters.has(chapter.id);
                const checkColor = chapter.worldAccentColor ?? lightTokens.colors.worldsInk;
                return (
                  <Pressable
                    key={chapter.id}
                    onPress={() => toggleChapter(chapter.id)}
                    style={({ pressed }) => [styles.chapterRow, pressed && styles.rowPressed]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && { backgroundColor: checkColor, borderColor: checkColor },
                      ]}
                    >
                      {checked && <Check size={12} color="#FFFFFF" strokeWidth={2.5} />}
                    </View>
                    <View style={styles.chapterMeta}>
                      <Text style={[styles.chapterTitle, checked && styles.chapterTitleSelected]}>
                        {chapter.title}
                      </Text>
                      {chapter.worldName ? (
                        <View style={styles.chapterWorldRow}>
                          <View style={[styles.chapterWorldDot, { backgroundColor: checkColor }]} />
                          <Text style={styles.chapterWorldName}>{chapter.worldName}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
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
    paddingTop: 4,
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
  worldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  clusterGap: {
    marginTop: 12,
  },
  worldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  worldName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: lightTokens.colors.worldsInk,
    fontFamily: 'Inter-SemiBold',
  },
  worldNameSelected: {
    color: lightTokens.colors.worldsInk,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  chapterMeta: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
    fontFamily: 'Inter-Medium',
  },
  chapterTitleSelected: {
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
  },
  chapterWorldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  chapterWorldDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chapterWorldName: {
    fontSize: 12,
    fontWeight: '500',
    color: lightTokens.colors.warmGrey,
    fontFamily: 'Inter-Medium',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  pillUnselected: {
    borderColor: lightTokens.colors.worldsCardBorder,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 14,
    color: lightTokens.colors.worldsInk,
    fontFamily: 'Inter-Regular',
  },
  pillTextSelected: {
    color: lightTokens.colors.worldsInk,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightTokens.colors.worldsInk + '2E',
    marginHorizontal: 16,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  rowPressed: {
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
