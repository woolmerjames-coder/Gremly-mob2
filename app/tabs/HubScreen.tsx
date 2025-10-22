/**
 * Hub Screen - Polished UI with sleek cards and segmented tabs
 * Central hub showing recent activity, spaces, and sorting tray
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { z } from 'zod';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import SegmentedTabs from '../../components/SegmentedTabs';
import ScopeSelector, { type ScopeOption } from '../../components/ScopeSelector';
import HubItemCard, { type HubItem } from '../../components/HubItemCard';
import UnsortedReviewSheet, { type UnsortedItem } from '../../components/UnsortedReviewSheet';
import PeopleList, { type PersonWithCounts } from '../../components/people/PeopleList';
import { colors, radii, spacing } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { AppRecord, Space, Person, Tag } from '../../lib/types';
import { SheetManager } from 'react-native-actions-sheet';
import TagFilterBar from '../../components/filters/TagFilterBar';
import Chip from '../../components/ui/Chip';
import EmptyState from '../../components/EmptyState';
import { selectUnsortedForReview } from '../../lib/selectors/spaceSelectors';

type Tab = 'Habits' | 'To-Dos' | 'Journal' | 'Notes' | 'People';

// Helper to condense long text into short titles
export function suggestShortTitle(text: string, maxWords = 5): string {
  if (!text) return 'Untitled';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  return words.slice(0, maxWords).join(' ');
}

export default function HubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const repo = useRepo();
  const { user } = useAuth();

  // Unified overlay controller
  const overlayController = useUnifiedOverlayController();

  // State
  const [items, setItems] = useState<AppRecord[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleWithCounts, setPeopleWithCounts] = useState<PersonWithCounts[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Habits');
  const [scope, setScope] = useState<ScopeOption>({ type: 'everywhere', label: 'Everywhere' });
  const [search, setSearch] = useState('');
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

      let title =
        item.type === 'habit' || item.type === 'todo'
          ? 'name' in item
            ? item.name
            : ''
          : item.title || '';
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

      // Get space name and determine if we should show space chip
      // Only show space chip when scope is "Everywhere" and item has a space
      const showSpaceChip = scope.type === 'everywhere';
      let spaceName: string | undefined;
      if (showSpaceChip && item.space_id) {
        const space = spaces.find((s) => s.id === item.space_id);
        spaceName = space?.name;
      }

      return {
        id: item.id,
        kind,
        title,
        note,
        date: dateFormatted,
        placedBy: item.ai_placed ? 'ai' : 'user',
        tags,
        spaceName,
        showSpaceChip,
        spaceId: item.space_id, // Add space_id for navigation
      };
    },
    [itemTags, scope.type, spaces],
  );

  // Load data
  const load = useCallback(async () => {
    if (!user) {
      setError('Please sign in to view your items');
      return;
    }

    setLoading(true);
    setError(null);

    // Phase 8 feature flag check (used throughout this function)
    const usePhase8 = process.env.EXPO_PUBLIC_FEATURE_BUDDY === 'true';

    try {
      // Load spaces, tags, and unsorted count
      const allSpaces = await repo.listSpaces();
      setSpaces(allSpaces);

      // Phase 8: Load tags from new Phase 8 table if feature enabled
      if (usePhase8) {
        try {
          const phase8Tags = await (repo as any).listTags();
          // Convert Phase 8 tags to old Tag format for compatibility
          setTags(
            phase8Tags.map((t: any) => ({
              id: t.id,
              name: t.name,
              color: colors.deepTeal, // Phase 8 tags don't have color yet
            })),
          );
        } catch (error) {
          console.error('[Hub] Failed to load Phase 8 tags:', error);
          setTags([]);
        }
      } else {
        const allTags = await repo.listTags();
        setTags(allTags);
      }

      // Load ALL items (all types, all scopes) for unsorted count calculation
      // This ensures the unsorted banner shows the global count across all tabs
      const [allHabits, allTodos, allNotes] = await Promise.all([
        repo.listByType('habit', {}),
        repo.listByType('todo', {}),
        repo.listByType('note', {}),
      ]);
      const allItemsForUnsorted = [...allHabits, ...allTodos, ...allNotes] as AppRecord[];
      const globalUnsorted = selectUnsortedForReview(allItemsForUnsorted);
      setUnsortedCount(globalUnsorted.length);

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

        // Compute linked counts client-side (Phase 7: no entity_people table yet)
        // Fetch all items to count links (reserved for Phase 8 implementation)
        void (await repo.listByType('habit', scopeOpts));
        void (await repo.listByType('todo', scopeOpts));
        void (await repo.listByType('note', { ...scopeOpts, subtypes: ['journal'] }));
        void (await repo.listByType('note', {
          ...scopeOpts,
          subtypes: ['idea', 'list', 'reference'],
        }));

        // For Phase 7, since listLinkedPeople is a stub, we'll use placeholder counts
        // In a real implementation, we'd query entity_people table or use listLinkedPeople
        const peopleWithCountsData: PersonWithCounts[] = await Promise.all(
          allPeople.map(async (person) => {
            // Stub: listLinkedPeople returns empty array for now
            // Future: when entity_people table exists, this will return actual links
            const linkedHabits = await repo.listLinkedPeople({ type: 'habit', id: person.id });
            const linkedTodos = await repo.listLinkedPeople({ type: 'todo', id: person.id });
            const linkedJournal = await repo.listLinkedPeople({ type: 'note', id: person.id });
            const linkedNotes = await repo.listLinkedPeople({ type: 'note', id: person.id });

            // Since stub returns empty, counts will be 0 for Phase 7
            // This structure is ready for when entity_people linking is implemented
            return {
              ...person,
              linkedCounts: {
                habits: linkedHabits.length,
                todos: linkedTodos.length,
                journal: linkedJournal.length,
                notes: linkedNotes.length,
              },
            };
          }),
        );

        setPeopleWithCounts(peopleWithCountsData);
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

      // Phase 8: Fetch linked tags using new method if feature enabled
      const tagsMap = new Map<string, Tag[]>();

      if (usePhase8) {
        // Use Phase 8 listItemTags method
        await Promise.all(
          records.map(async (record) => {
            try {
              const linkedTags = await (repo as any).listItemTags(record.id);
              if (linkedTags.length > 0) {
                // Convert Phase 8 tags to old Tag format
                tagsMap.set(
                  record.id,
                  linkedTags.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    color: colors.deepTeal,
                  })),
                );
              }
            } catch (err) {
              console.error(`[Hub] Failed to load Phase 8 tags for ${record.id}:`, err);
            }
          }),
        );
      } else {
        // Use old listLinkedTags method
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
              console.error(`[Hub] Failed to load tags for ${record.id}:`, err);
            }
          }),
        );
      }

      setItemTags(tagsMap);
    } catch (err) {
      // Check if it's a ZodError for better dev experience
      const isZodError = err instanceof z.ZodError;
      const message = isZodError
        ? '[Hub] Schema mismatch: see console for details'
        : err instanceof Error
          ? err.message
          : 'Failed to load hub data';

      if (__DEV__) {
        console.error('Failed to load hub data:', err);
        if (isZodError) {
          console.error('[Hub] ZodError details:', err.errors);
        }
      }

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

    let filtered = items;

    // Phase 8: Client-side tag filtering when tags are selected
    if (selectedTagIds.length > 0) {
      const usePhase8 = process.env.EXPO_PUBLIC_FEATURE_BUDDY === 'true';
      if (usePhase8) {
        // Filter items by selected tags (item must have at least one selected tag)
        filtered = filtered.filter((item) => {
          const itemTagsList = itemTags.get(item.id) || [];
          return itemTagsList.some((tag) => selectedTagIds.includes(tag.id));
        });
      }
    }

    // Then apply search filter
    if (!search.trim()) return filtered;
    const needle = search.toLowerCase();
    return filtered.filter((item) => {
      const titleText =
        item.type === 'habit' || item.type === 'todo'
          ? 'name' in item
            ? item.name
            : ''
          : 'title' in item
            ? item.title
            : '';
      const haystack =
        `${titleText ?? ''} ${'body' in item ? (item.body ?? '') : ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, search, tab, selectedTagIds, itemTags]);

  // Convert AppRecord to UnsortedItem (for review sheet)
  const toUnsortedItem = useCallback((item: AppRecord): UnsortedItem => {
    let title =
      item.type === 'habit' || item.type === 'todo'
        ? 'name' in item
          ? item.name
          : ''
        : 'title' in item
          ? item.title
          : '';
    if (item.type === 'note' && item.body && !title) {
      title = suggestShortTitle(item.body);
    }
    if (!title || !title.trim()) {
      title = 'Untitled';
    }

    return {
      id: item.id,
      type: item.type as 'habit' | 'todo' | 'note',
      title,
      subtype: item.type === 'note' ? item.subtype : undefined,
    };
  }, []);

  // Use unified selector for unsorted items (banner + sheet)
  const unsortedForReview = useMemo(() => selectUnsortedForReview(items), [items]);

  const unsortedItems = useMemo(
    () => unsortedForReview.map(toUnsortedItem),
    [unsortedForReview, toUnsortedItem],
  );

  // Note: unsortedCount is now set globally in load() function
  // This ensures the banner shows the total across all tabs, not just the current tab

  // Split into needs sorting and everything else
  const needsSorting = useMemo(
    () =>
      filteredAll.filter((item) => unsortedForReview.some((u) => u.id === item.id)).map(toHubItem),
    [filteredAll, unsortedForReview, toHubItem],
  );

  const allItems = useMemo(
    () =>
      filteredAll.filter((item) => !unsortedForReview.some((u) => u.id === item.id)).map(toHubItem),
    [filteredAll, unsortedForReview, toHubItem],
  );

  // Handlers
  const handleItemPress = useCallback(
    (item: HubItem) => {
      const record = items.find((r) => r.id === item.id);
      if (record) {
        // Get current spaceId from scope
        const spaceId = scope.type === 'space' ? scope.spaceId : undefined;
        overlayController.openEdit({ record, spaceId });
      }
    },
    [items, scope, overlayController],
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
      // Phase 8 polish: Prevent duplicates explicitly
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      // Guard against accidental duplicates
      if (prev.find((id) => id === tagId)) {
        console.warn('Tag already selected:', tagId);
        return prev;
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

        // Close sheet if no more items to review
        if (unsortedForReview.length <= 1) {
          setReviewSheetVisible(false);
          setBannerDismissed(false); // Ensure banner shows again if new items appear
        }
      } catch (err) {
        console.error('[HubScreen] Failed to confirm unsorted item:', err);
      }
    },
    [repo, load, unsortedForReview],
  );

  const handleOverlaySaved = useCallback(async () => {
    // Reload data after overlay save
    await load();
  }, [load]);

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
                <Chip
                  label="All"
                  selected={notesSubfilter === 'all'}
                  onPress={() => setNotesSubfilter('all')}
                  testID="notes-filter-all"
                />
                <Chip
                  label="Ideas"
                  selected={notesSubfilter === 'idea'}
                  onPress={() => setNotesSubfilter('idea')}
                  testID="notes-filter-idea"
                />
                <Chip
                  label="Lists"
                  selected={notesSubfilter === 'list'}
                  onPress={() => setNotesSubfilter('list')}
                  testID="notes-filter-list"
                />
                <Chip
                  label="Reference"
                  selected={notesSubfilter === 'reference'}
                  onPress={() => setNotesSubfilter('reference')}
                  testID="notes-filter-reference"
                />
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
                onClearAll={() => setSelectedTagIds([])}
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

            {/* Empty states per tab */}
            {tab === 'Habits' && isEmpty && !loading && !error && (
              <EmptyState
                testID="empty-habits"
                title="No Habits yet"
                subtitle="Try a simple daily nudge."
              />
            )}
            {tab === 'To-Dos' && isEmpty && !loading && !error && (
              <EmptyState
                testID="empty-todos"
                title="No To-Dos yet"
                subtitle="Start small. Add one thing for today."
              />
            )}
            {tab === 'Journal' && isEmpty && !loading && !error && (
              <EmptyState
                testID="empty-journal"
                title="No Journal entries"
                subtitle="Write one line to begin."
              />
            )}
            {tab === 'Notes' && isEmpty && !loading && !error && (
              <EmptyState
                testID="empty-notes"
                title="No Notes yet"
                subtitle="Capture ideas, lists, and references."
              />
            )}
            {tab === 'People' && people.length === 0 && !loading && !error && (
              <EmptyState
                testID="empty-people"
                title="No People yet"
                subtitle="Add contacts in Phase 8."
              />
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
                <Text style={[typeStyles.h2, { marginBottom: spacing.md }]}>People</Text>
                <PeopleList
                  people={peopleWithCounts}
                  onPersonPress={(person) => {
                    // Future: Navigate to person detail view
                    console.log('[HubScreen] Person pressed:', person.name);
                  }}
                  testID="people-list"
                />
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
            onSpacePress={(spaceId) => navigation.navigate('SpaceHome', { spaceId })}
            testID={`item-${item.id}`}
          />
        )}
        ListFooterComponent={
          !isEmpty && !error && tab !== 'People' ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                const spaceId =
                  scope.type === 'space'
                    ? scope.spaceId
                    : scope.type === 'unassigned'
                      ? null
                      : undefined;
                overlayController.openCreate({ spaceId });
              }}
              testID="add-more-btn"
            >
              <Text style={styles.addText}>Add More</Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'] }}
      />

      {/* Unified Create/Edit Overlay */}
      <UnifiedCreateOverlay
        visible={overlayController.state.visible}
        mode={overlayController.state.mode}
        initialEntity={overlayController.state.initialEntity}
        initialSpaceId={overlayController.state.initialSpaceId}
        onClose={overlayController.close}
        onSaved={handleOverlaySaved}
      />

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
