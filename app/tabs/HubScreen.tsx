/**
 * Hub Screen - Polished UI with sleek cards and segmented tabs
 * Central hub showing recent activity, spaces, and sorting tray
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import SegmentedTabs from '../../components/SegmentedTabs';
import ScopeSelector, { type ScopeOption } from '../../components/ScopeSelector';
import HubItemCard, { type HubItem } from '../../components/HubItemCard';
import UnsortedReviewSheet, { type UnsortedItem } from '../../components/UnsortedReviewSheet';
import { colors, radii, spacing } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';
import { ManualAddOverlay } from '../../components/ManualAddOverlay';
import { toRepoFrequency } from '../../app/schemas/manualAdd';
import type { ManualAddPayload } from '../../app/schemas/manualAdd';
import type { AppRecord, Space, Person, Tag } from '../../lib/types';
import { SheetManager } from 'react-native-actions-sheet';
import TagFilterBar from '../../components/filters/TagFilterBar';

type Tab = 'Habits' | 'To-Dos' | 'Journal' | 'Notes' | 'People';

// Helper to condense long text into short titles
export function suggestShortTitle(text: string, maxWords = 5): string {
  if (!text) return 'Untitled';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  return words.slice(0, maxWords).join(' ');
}

export default function HubScreen() {
  // const navigation = useNavigation<NavigationProp>(); // Unused for now
  const repo = useRepo();
  const { user } = useAuth();

  // State
  const [items, setItems] = useState<AppRecord[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Habits');
  const [scope, setScope] = useState<ScopeOption>({ type: 'everywhere', label: 'Everywhere' });
  const [search, setSearch] = useState('');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editItem, setEditItem] = useState<AppRecord | null>(null);
  const [unsortedCount, setUnsortedCount] = useState(0);
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [notesSubfilter, setNotesSubfilter] = useState<'all' | 'idea' | 'list' | 'reference'>(
    'all',
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [itemTags, setItemTags] = useState<Map<string, Tag[]>>(new Map());

  // Helper to filter out archived items
  // const isVisible = useCallback((item: AppRecord) => !item.archived, []); // Not used after tab-based filtering

  // Convert AppRecord to HubItem
  const toHubItem = useCallback(
    (item: AppRecord): HubItem => {
      let kind: 'habit' | 'todo' | 'note' = 'note';
      if (item.type === 'habit') kind = 'habit';
      else if (item.type === 'todo') kind = 'todo';
      else kind = 'note';

      let title = item.title || '';
      let note: string | undefined;

      // For long text notes, condense title and keep original as note
      if (item.type === 'note' && item.body && item.body.length > 60) {
        title = suggestShortTitle(item.body);
        note = item.body;
      } else if (item.type === 'note' && item.body) {
        title = item.body;
      }

      if (!title.trim()) {
        title = 'Untitled';
      }

      const date = item.updated_at || item.created_at;
      const dateFormatted = date ? new Date(date).toLocaleDateString() : undefined;

      // Get tags for this item (up to 2 for display)
      const tags = itemTags.get(item.id) || [];

      return {
        id: item.id,
        kind,
        title,
        note,
        date: dateFormatted,
        placedBy: item.ai_placed ? 'ai' : 'user',
        tags,
      };
    },
    [itemTags],
  );

  // Load data
  const load = useCallback(async () => {
    if (!user) {
      setError('Please sign in to view your items');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Load spaces, tags, and unsorted count
      const allSpaces = await repo.listSpaces();
      setSpaces(allSpaces);

      const allTags = await repo.listTags();
      setTags(allTags);

      const count = await repo.countUnsorted();
      setUnsortedCount(count);
      if (count === 0) {
        setBannerDismissed(false); // Reset banner when count is 0
      }

      // Build scope options for listByType
      const scopeOpts =
        scope.type === 'unassigned'
          ? { unassignedOnly: true }
          : scope.type === 'space'
            ? { spaceId: scope.spaceId }
            : {}; // everywhere

      // Add tag filtering if tags are selected
      const filterOpts =
        selectedTagIds.length > 0 ? { ...scopeOpts, tagIds: selectedTagIds } : scopeOpts;

      // Load data based on current tab
      let data: AppRecord[] | Person[] = [];

      if (tab === 'Habits') {
        data = await repo.listByType('habit', filterOpts);
      } else if (tab === 'To-Dos') {
        data = await repo.listByType('todo', filterOpts);
      } else if (tab === 'Journal') {
        data = await repo.listByType('note', { ...filterOpts, subtypes: ['journal'] });
      } else if (tab === 'Notes') {
        const subtypes =
          notesSubfilter === 'all' ? ['idea', 'list', 'reference'] : [notesSubfilter];
        data = await repo.listByType('note', {
          ...filterOpts,
          subtypes,
        });
      } else if (tab === 'People') {
        const allPeople = await repo.listPeople();
        setPeople(allPeople);
        setItems([]);
        setLoading(false);
        return;
      }

      // Sort by updated_at (most recent first)
      const records = data as AppRecord[];
      records.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      });

      setItems(records);

      // Fetch linked tags for all items (Phase 7: read-only)
      const tagsMap = new Map<string, Tag[]>();
      await Promise.all(
        records.map(async (record) => {
          try {
            const linkedTags = await repo.listLinkedTags({
              type: record.type,
              id: record.id,
            });
            if (linkedTags.length > 0) {
              tagsMap.set(record.id, linkedTags);
            }
          } catch (err) {
            console.error(`Failed to load tags for ${record.id}:`, err);
          }
        }),
      );
      setItemTags(tagsMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load hub data';
      console.error('Failed to load hub data:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo, user, tab, scope, notesSubfilter, selectedTagIds]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset notes subfilter when switching away from Notes tab
  useEffect(() => {
    if (tab !== 'Notes') {
      setNotesSubfilter('all');
    }
  }, [tab]);

  // Filter by search (items are already filtered by tab via load())
  const filteredAll = useMemo(() => {
    if (tab === 'People') return []; // People handled separately
    if (!search.trim()) return items;
    const needle = search.toLowerCase();
    return items.filter((item) => {
      const haystack =
        `${item.title ?? ''} ${'body' in item ? (item.body ?? '') : ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, search, tab]);

  // Split into needs sorting (AI) and everything else
  const needsSorting = useMemo(
    () => filteredAll.filter((item) => item.ai_placed === true).map(toHubItem),
    [filteredAll, toHubItem],
  );

  const allItems = useMemo(
    () => filteredAll.filter((item) => item.ai_placed !== true).map(toHubItem),
    [filteredAll, toHubItem],
  );

  // Convert AppRecord to UnsortedItem (for review sheet)
  const toUnsortedItem = useCallback((item: AppRecord): UnsortedItem => {
    let title = item.title || '';
    if (item.type === 'note' && item.body && !title) {
      title = suggestShortTitle(item.body);
    }
    if (!title.trim()) {
      title = 'Untitled';
    }

    return {
      id: item.id,
      type: item.type as 'habit' | 'todo' | 'note',
      title,
      subtype: item.type === 'note' ? item.subtype : undefined,
    };
  }, []);

  const unsortedItems = useMemo(
    () => items.filter((item) => item.ai_placed === true).map(toUnsortedItem),
    [items, toUnsortedItem],
  );

  // Handlers
  const handleItemPress = useCallback(
    (item: HubItem) => {
      const record = items.find((r) => r.id === item.id);
      if (record) {
        setEditItem(record);
        setEditMode(true);
      }
    },
    [items],
  );

  const handleMovePress = useCallback(
    async (item: HubItem) => {
      const record = items.find((r) => r.id === item.id);
      if (!record) return;

      try {
        await SheetManager.show('destination-picker', {
          payload: {
            itemId: record.id,
            itemType: record.type,
            itemSubtype: record.type === 'note' ? record.subtype : undefined,
            itemTitle: item.title,
            origin: record.origin ?? null,
          },
        } as never);
        await load();
      } catch (err) {
        console.error('[HubScreen] Move sheet error', err);
      }
    },
    [items, load],
  );

  const handleToggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      return [...prev, tagId];
    });
  }, []);

  const handleConfirmUnsorted = useCallback(
    async (id: string) => {
      try {
        // Flip ai_placed to false to confirm the item
        await repo.update({
          id,
          patch: { ai_placed: false },
        });
        // Reload to refresh the count and lists
        await load();
      } catch (err) {
        console.error('[HubScreen] Failed to confirm unsorted item:', err);
      }
    },
    [repo, load],
  );

  const handleManualAddSubmit = async (payload: ManualAddPayload) => {
    try {
      switch (payload.type) {
        case 'habits':
          if (payload.subType === 'start') {
            await repo.create({
              type: 'habit',
              title: payload.data.name,
              frequency: toRepoFrequency(payload.data.frequency),
              space_id: payload.data.spaceId || null,
              ai_placed: false,
            });
          } else {
            await repo.create({
              type: 'habit',
              title: `Break: ${payload.data.name}`,
              frequency: 'daily',
              space_id: payload.data.spaceId || null,
              ai_placed: false,
            });
          }
          break;
        case 'todos':
          await repo.create({
            type: 'todo',
            title: payload.data.name,
            due_date: payload.data.deadline || null,
            undefined_due: !payload.data.deadline,
            space_id: null,
            ai_placed: false,
          });
          break;
        case 'journal':
          await repo.create({
            type: 'note',
            title: '',
            body: payload.data.entry,
            subtype: 'journal',
            space_id: payload.data.spaceId || null,
            ai_placed: false,
          });
          break;
        case 'catchall':
          console.log('[HubScreen] Catch-all saved by overlay, reloading...');
          break;
      }
      await load();
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

  const isEmpty = items.length === 0;

  return (
    <SafeAreaView style={styles.safe} testID="hub-screen">
      <FlatList
        ListHeaderComponent={
          <View>
            <Text style={[typeStyles.h1, { marginHorizontal: spacing.md, marginTop: spacing.sm }]}>
              Hub
            </Text>

            {/* Scope Selector */}
            <View style={{ marginTop: spacing.md, marginHorizontal: spacing.md }}>
              <ScopeSelector selectedScope={scope} spaces={spaces} onChange={setScope} />
            </View>

            {/* Tabs */}
            <View style={{ marginTop: spacing.md }}>
              <SegmentedTabs value={tab} onChange={setTab} />
            </View>

            {/* Notes Subfilter Pills (only visible on Notes tab) */}
            {tab === 'Notes' && (
              <View style={styles.pillBar}>
                <TouchableOpacity
                  style={[styles.pill, notesSubfilter === 'all' && styles.pillActive]}
                  onPress={() => setNotesSubfilter('all')}
                  testID="notes-filter-all"
                >
                  <Text
                    style={[styles.pillText, notesSubfilter === 'all' && styles.pillTextActive]}
                  >
                    All
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, notesSubfilter === 'idea' && styles.pillActive]}
                  onPress={() => setNotesSubfilter('idea')}
                  testID="notes-filter-idea"
                >
                  <Text
                    style={[styles.pillText, notesSubfilter === 'idea' && styles.pillTextActive]}
                  >
                    Ideas
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, notesSubfilter === 'list' && styles.pillActive]}
                  onPress={() => setNotesSubfilter('list')}
                  testID="notes-filter-list"
                >
                  <Text
                    style={[styles.pillText, notesSubfilter === 'list' && styles.pillTextActive]}
                  >
                    Lists
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, notesSubfilter === 'reference' && styles.pillActive]}
                  onPress={() => setNotesSubfilter('reference')}
                  testID="notes-filter-reference"
                >
                  <Text
                    style={[
                      styles.pillText,
                      notesSubfilter === 'reference' && styles.pillTextActive,
                    ]}
                  >
                    Reference
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.searchWrap}>
              <TextInput
                style={styles.search}
                placeholder="Search the Hub"
                placeholderTextColor={colors.gray400}
                value={search}
                onChangeText={setSearch}
                testID="hub-search"
              />
            </View>

            {/* Tag Filter Bar (only for non-People tabs) */}
            {tab !== 'People' && (
              <TagFilterBar
                tags={tags}
                selectedTagIds={selectedTagIds}
                onToggleTag={handleToggleTag}
                testID="tag-filter-bar"
              />
            )}

            {/* Unsorted Banner */}
            {unsortedCount > 0 && !bannerDismissed && (
              <TouchableOpacity
                style={styles.unsortedBanner}
                onPress={() => setReviewSheetVisible(true)}
                testID="unsorted-banner"
              >
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerText}>
                    🌀 {unsortedCount} Unsorted {unsortedCount === 1 ? 'item' : 'items'} — Review
                  </Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setBannerDismissed(true);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="unsorted-banner-dismiss"
                  >
                    <Text style={styles.bannerDismiss}>✕</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}

            {/* Error state */}
            {error && (
              <View style={styles.errorCard}>
                <Text style={[typeStyles.h2, { textAlign: 'center' }]}>
                  Authentication Required
                </Text>
                <Text
                  style={[
                    typeStyles.body,
                    { color: colors.warning, textAlign: 'center', marginTop: spacing.sm },
                  ]}
                >
                  {error}
                </Text>
              </View>
            )}

            {/* Loading state */}
            {loading && !items.length && !error && (
              <View style={{ padding: spacing.xl }}>
                <Text style={[typeStyles.body, { textAlign: 'center' }]}>Loading...</Text>
              </View>
            )}

            {/* Empty state */}
            {isEmpty && !loading && !error && (
              <View style={styles.emptyCard}>
                <Text style={[typeStyles.h2, { textAlign: 'center' }]}>Nothing here yet</Text>
                <Text style={[typeStyles.body, { textAlign: 'center', marginTop: spacing.sm }]}>
                  Add items to get started.
                </Text>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setOverlayVisible(true)}
                  testID="hub-empty-add"
                >
                  <Text style={styles.addText}>Add More</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Needs Sorting (AI / unsorted) */}
            {!!needsSorting.length && (
              <View style={styles.section}>
                <Text style={typeStyles.h2}>Needs Sorting</Text>
                <Text style={[typeStyles.subtitle, { marginTop: 2 }]}>Quick triage</Text>

                {needsSorting.map((it) => (
                  <HubItemCard
                    key={it.id}
                    item={it}
                    showMove
                    onPress={() => handleItemPress(it)}
                    onMove={() => handleMovePress(it)}
                    testID={`unsorted-${it.id}`}
                  />
                ))}
              </View>
            )}

            {/* Section header for main list */}
            {!isEmpty && !error && tab !== 'People' && (
              <View style={styles.section}>
                <Text style={typeStyles.h2}>{tab}</Text>
                <Text style={[typeStyles.subtitle, { marginTop: 2 }]}>
                  {allItems.length} item(s)
                </Text>
              </View>
            )}

            {/* People tab content */}
            {tab === 'People' && !loading && (
              <View style={styles.section}>
                <Text style={typeStyles.h2}>People</Text>
                {people.length === 0 && (
                  <Text style={[typeStyles.body, { marginTop: spacing.md, color: colors.gray400 }]}>
                    No people added yet
                  </Text>
                )}
                {people.map((person) => (
                  <View key={person.id} style={styles.personCard} testID={`person-${person.id}`}>
                    {person.avatar && <Text style={styles.avatar}>{person.avatar}</Text>}
                    <View style={{ flex: 1 }}>
                      <Text style={typeStyles.body}>{person.name}</Text>
                      {person.email && (
                        <Text style={[typeStyles.meta, { color: colors.gray400 }]}>
                          {person.email}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        data={tab === 'People' ? [] : allItems}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <HubItemCard
            item={item}
            onPress={() => handleItemPress(item)}
            testID={`item-${item.id}`}
          />
        )}
        ListFooterComponent={
          !isEmpty && !error && tab !== 'People' ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setOverlayVisible(true)}
              testID="add-more-btn"
            >
              <Text style={styles.addText}>Add More</Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'] }}
      />

      {/* Manual Add Overlay - Create Mode */}
      <ManualAddOverlay
        visible={overlayVisible}
        defaultTab="habits"
        onClose={() => setOverlayVisible(false)}
        onSubmit={handleManualAddSubmit}
        onCatchAllSaved={() => {
          void load();
        }}
      />

      {/* Manual Add Overlay - Edit Mode */}
      {editItem && (
        <ManualAddOverlay
          visible={editMode}
          mode="edit"
          initialType={editItem.type}
          initialSubtype={editItem.type === 'note' ? editItem.subtype : undefined}
          itemId={editItem.id}
          initialValues={editItem}
          onClose={() => {
            setEditMode(false);
            setEditItem(null);
          }}
          onSaved={() => {
            setEditMode(false);
            setEditItem(null);
            void load();
          }}
        />
      )}

      {/* Unsorted Review Sheet Modal */}
      {reviewSheetVisible && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setReviewSheetVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.sheetContainer}>
            <UnsortedReviewSheet
              items={unsortedItems}
              onConfirm={handleConfirmUnsorted}
              onClose={() => setReviewSheetVisible(false)}
              testID="unsorted-review-sheet"
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  searchWrap: { marginTop: spacing.md },
  search: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  section: { marginTop: spacing.xl },
  errorCard: {
    marginTop: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
  },
  emptyCard: {
    marginTop: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    alignItems: 'center',
  },
  addBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.deepTeal,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  addText: { color: colors.cream, fontWeight: '700', fontSize: 16 },
  personCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    fontSize: 32,
  },
  unsortedBanner: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    backgroundColor: colors.periwinkle,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  bannerDismiss: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    height: '70%',
    backgroundColor: 'transparent',
  },
  pillBar: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  pillActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray600,
  },
  pillTextActive: {
    color: colors.white,
  },
});
