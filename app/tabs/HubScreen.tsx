/**
 * Hub Screen - Polished UI with sleek cards and segmented tabs
 * Central hub showing recent activity, spaces, and sorting tray
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { z } from 'zod';
import {
  LayoutGrid,
  BookOpen,
  BarChart3,
  X,
  Sparkles,
  Calendar,
  Lightbulb,
} from 'lucide-react-native';

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
import Chip from '../../components/ui/Chip';
import EmptyState from '../../components/EmptyState';
import { selectUnsortedForReview } from '../../lib/selectors/spaceSelectors';
import {
  selectNeedsAttentionItems,
  type NeedsAttentionItem,
} from '../../lib/selectors/hubSelectors';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { getNoteLabel } from '../../lib/canonicalTypes';
import { normalizeSearchTagArray, normalizeSearchTagInput } from '../../lib/tags/search';
import { parseSearchTokens } from '../../lib/tags/parseSearch';
import TagFilterBar from '../../components/tags/TagFilterBar';
import { eventBus } from '../../lib/events';
import {
  groupJournalsByMonth,
  formatJournalDate as formatJournalDateHelper,
  getJournalPreview,
  computeLast30DaysRange,
} from '../../lib/hub/hubHelpers';

type Tab = 'Habits' | 'To-Dos' | 'Journal' | 'Notes' | 'Lists' | 'People';

/**
 * Feature flag for Hub V1 redesign (December 2024)
 * When true, renders the new Hub sections:
 * - "So you don't forget..." (needs-attention)
 * - Recent Journals rail
 * - Popular Tags
 * - Browse by Space
 * - Archived drawer
 */
const HUB_V1 = true;

// Hub V1 Filter Types
type HubV1TypeFilter = 'todo' | 'habit' | 'note' | 'space';
type HubV1TimeRange = 'week' | 'month' | '3months' | 'all';
type HubV1StatusFilter = 'active' | 'completed' | 'all';
type HubV1View = 'all' | 'journals';

const TIME_RANGE_LABELS: Record<HubV1TimeRange, string> = {
  week: 'This Week',
  month: 'This Month',
  '3months': 'Last 3 Months',
  all: 'All Time',
};

const STATUS_LABELS: Record<HubV1StatusFilter, string> = {
  active: 'Active',
  completed: 'Completed',
  all: 'All',
};

/**
 * Compute ISO date range based on time filter selection
 */
function computeTimeRange(range: HubV1TimeRange): {
  createdAfter?: string;
  createdBefore?: string;
} {
  if (range === 'all') return {};

  const now = new Date();
  let start: Date;

  switch (range) {
    case 'week':
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      break;
    case '3months':
      start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      break;
    default:
      return {};
  }

  return {
    createdAfter: start.toISOString(),
    // createdBefore is optional - we want everything up to now
  };
}

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
  const [globalUnsortedItems, setGlobalUnsortedItems] = useState<AppRecord[]>([]); // Store global unsorted for sheet
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [notesSubfilter, setNotesSubfilter] = useState<'all' | 'idea' | 'list' | 'reference'>(
    'all',
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [itemTags, setItemTags] = useState<Map<string, Tag[]>>(new Map());
  const hasFetchedTagsRef = useRef(false);
  const [listsData, setListsData] = useState<{
    shopping: { incomplete: number; total: number };
    packing: { incomplete: number; total: number };
  }>({
    shopping: { incomplete: 0, total: 0 },
    packing: { incomplete: 0, total: 0 },
  });

  // Hub V1 filter state
  const [hubV1Types, setHubV1Types] = useState<Set<HubV1TypeFilter>>(
    new Set(['todo', 'habit', 'note', 'space']),
  );
  const [hubV1TimeRange, setHubV1TimeRange] = useState<HubV1TimeRange>('month');
  const [hubV1Status, setHubV1Status] = useState<HubV1StatusFilter>('active');
  const [hubV1Items, setHubV1Items] = useState<AppRecord[]>([]);
  const [hubV1Loading, setHubV1Loading] = useState(false);
  const [hubView, setHubView] = useState<HubV1View>('all');
  // Save previous type selections when switching to Journal View
  const savedTypesRef = useRef<Set<HubV1TypeFilter> | null>(null);
  // Analyze journals modal state
  const [analyzeModalVisible, setAnalyzeModalVisible] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeJournalCount, setAnalyzeJournalCount] = useState(0);

  const phase8Enabled = process.env.EXPO_PUBLIC_FEATURE_BUDDY === 'true';

  useEffect(() => {
    setTags([]);
    hasFetchedTagsRef.current = false;
  }, [phase8Enabled]);

  useEffect(() => {
    let cancelled = false;

    if (tags.length === 0) {
      hasFetchedTagsRef.current = false;
    }

    const loadTags = async () => {
      if (!repo || tags.length > 0 || hasFetchedTagsRef.current) {
        return;
      }

      try {
        hasFetchedTagsRef.current = true;
        if (phase8Enabled) {
          const phase8Tags = await (repo as any).listTags();
          if (!cancelled) {
            setTags(
              phase8Tags.map((t: any) => ({
                id: t.id,
                name: t.name,
                color: colors.deepTeal,
              })),
            );
          }
        } else {
          const allTags = await repo.listTags();
          if (!cancelled) {
            setTags(allTags);
          }
        }
      } catch (error) {
        console.error('[Hub] Failed to load tags:', error);
        if (!cancelled) {
          setTags([]);
        }
      }
    };

    void loadTags();

    return () => {
      cancelled = true;
    };
  }, [repo, tags.length, phase8Enabled]);

  const noteLabelPlural = getNoteLabel({ plural: true });

  const { text: parsedText, tagNames: parsedSearchTags } = useMemo(
    () => parseSearchTokens(search),
    [search],
  );

  const mergedTagNames = useMemo(
    () => normalizeSearchTagArray([...selectedTagFilters, ...parsedSearchTags]),
    [selectedTagFilters, parsedSearchTags],
  );

  const availableTagNames = useMemo(() => {
    const normalized = tags.map((tag) => normalizeSearchTagInput(tag.name));
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const name of normalized) {
      if (name && !seen.has(name)) {
        seen.add(name);
        deduped.push(name);
      }
    }
    return deduped.sort();
  }, [tags]);

  const handleTagFilterChange = useCallback((next: string[]) => {
    setSelectedTagFilters(normalizeSearchTagArray(next));
  }, []);

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
        private: item.type === 'note' ? ((item as any).private ?? false) : undefined, // Phase L7: Private mode
      };
    },
    [itemTags, scope.type, spaces],
  );

  // Load data
  const load = useCallback(async () => {
    if (!user) {
      setError('Please sign in to view your items');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const tagCount = mergedTagNames.length;
    let loadSucceeded = false;

    try {
      // Load spaces, tags, and unsorted count
      const allSpaces = await repo.listSpaces();
      setSpaces(allSpaces);

      // Load ALL items (all types, all scopes) for unsorted count calculation
      // This ensures the unsorted banner shows the global count across all tabs
      const [allHabits, allTodos, allNotes] = await Promise.all([
        repo.listByType('habit', {}),
        repo.listByType('todo', {}),
        repo.listByType('note', {}),
      ]);
      const allItemsForUnsorted = [...allHabits, ...allTodos, ...allNotes] as AppRecord[];
      const globalUnsorted = selectUnsortedForReview(allItemsForUnsorted);

      if (__DEV__) {
        console.log('[HubUnsorted] Global count calculation:', {
          totalItems: allItemsForUnsorted.length,
          unsortedCount: globalUnsorted.length,
          byType: {
            habits: allHabits.length,
            todos: allTodos.length,
            notes: allNotes.length,
          },
          scope: 'all',
          filters: 'none (global count)',
        });
      }

      setUnsortedCount(globalUnsorted.length);
      setGlobalUnsortedItems(globalUnsorted); // Store for sheet      // Build scope options for listByType
      const scopeOpts =
        scope.type === 'unassigned'
          ? { unassignedOnly: true }
          : scope.type === 'space'
            ? { spaceId: scope.spaceId }
            : {}; // everywhere

      // Add tag filtering if tags are selected or parsed from search
      const filterOpts =
        mergedTagNames.length > 0 ? { ...scopeOpts, tagNames: mergedTagNames } : scopeOpts;

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
        loadSucceeded = true;
        return;
      } else if (tab === 'Lists') {
        // Load lists data for shopping and packing
        try {
          const [shoppingList, packingList] = await Promise.all([
            repo.getOrCreateList('shopping', { userId: undefined, spaceId: null }),
            repo.getOrCreateList('packing', { userId: undefined, spaceId: null }),
          ]);

          const [shoppingItems, packingItems] = await Promise.all([
            repo.listItems(shoppingList.id),
            repo.listItems(packingList.id),
          ]);

          setListsData({
            shopping: {
              incomplete: shoppingItems.filter((item) => !item.completed_at).length,
              total: shoppingItems.length,
            },
            packing: {
              incomplete: packingItems.filter((item) => !item.completed_at).length,
              total: packingItems.length,
            },
          });
        } catch (error) {
          console.error('[Hub] Failed to load lists data:', error);
          setListsData({
            shopping: { incomplete: 0, total: 0 },
            packing: { incomplete: 0, total: 0 },
          });
        }

        setItems([]);
        setLoading(false);
        loadSucceeded = true;
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

      if (phase8Enabled) {
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
      loadSucceeded = true;
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
      if (loadSucceeded && tagCount > 0) {
        eventBus.emit('TagFilterApplied', { tagCount });
      }
    }
  }, [repo, user, tab, scope, notesSubfilter, mergedTagNames, phase8Enabled]);

  // Hub V1 data loading with filters
  const loadHubV1Data = useCallback(async () => {
    if (!user || !HUB_V1) return;

    setHubV1Loading(true);

    try {
      const timeRange = computeTimeRange(hubV1TimeRange);
      const statusOpt = hubV1Status;

      const results: AppRecord[] = [];

      // When in Journal View, only load journals (notes with subtype 'journal')
      if (hubView === 'journals') {
        const journals = await repo.listByType('note', {
          ...timeRange,
          status: statusOpt,
          subtypes: ['journal'],
        });
        results.push(...journals);
      } else {
        // All Items view: Load each selected type with filters
        if (hubV1Types.has('todo')) {
          const todos = await repo.listByType('todo', {
            ...timeRange,
            status: statusOpt,
          });
          results.push(...todos);
        }

        if (hubV1Types.has('habit')) {
          const habits = await repo.listByType('habit', {
            ...timeRange,
            status: statusOpt,
          });
          results.push(...habits);
        }

        if (hubV1Types.has('note')) {
          const notes = await repo.listByType('note', {
            ...timeRange,
            status: statusOpt,
          });
          results.push(...notes);
        }
      }

      // Sort by created_at DESC (most recent first)
      results.sort((a, b) => {
        const dateA = a.created_at || '';
        const dateB = b.created_at || '';
        return dateB.localeCompare(dateA);
      });

      setHubV1Items(results);
    } catch (err) {
      if (__DEV__) {
        console.error('[HubV1] Failed to load data:', err);
      }
    } finally {
      setHubV1Loading(false);
    }
  }, [repo, user, hubV1Types, hubV1TimeRange, hubV1Status, hubView]);

  // Load Hub V1 data when filters change
  useEffect(() => {
    if (HUB_V1) {
      void loadHubV1Data();
    }
  }, [loadHubV1Data]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = addOverlaySavedListener(() => {
      void load();
    });
    return off;
  }, [load]);

  // Reset notes subfilter when switching away from Notes tab
  useEffect(() => {
    if (tab !== 'Notes') {
      setNotesSubfilter('all');
    }
  }, [tab]);

  // Filter by search (items are already filtered by tab via load())
  const filteredAll = useMemo(() => {
    if (tab === 'People') return [];

    let filtered = items;

    if (phase8Enabled && mergedTagNames.length > 0) {
      const wanted = new Set(mergedTagNames);
      filtered = filtered.filter((item) => {
        const itemTagsList = itemTags.get(item.id) || [];
        return itemTagsList.some((tag) => wanted.has(normalizeSearchTagInput(tag.name)));
      });
    }

    const textNeedle = parsedText?.trim();
    if (!textNeedle) return filtered;
    const needle = textNeedle.toLowerCase();
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
  }, [items, parsedText, tab, mergedTagNames, itemTags, phase8Enabled]);

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
  // For the in-page "Needs Sorting" section, we use the filtered view
  const unsortedForReview = useMemo(() => {
    const result = selectUnsortedForReview(items);

    if (__DEV__) {
      console.log('[HubUnsorted] In-page needs sorting calculation:', {
        currentTab: tab,
        currentScope: scope.type,
        totalItemsInView: items.length,
        unsortedInView: result.length,
        filters: { tab, scope: scope.type, search, tagNames: mergedTagNames },
      });
    }

    return result;
  }, [items, tab, scope, search, mergedTagNames]);

  // For the review sheet, use global unsorted items (all types, all scopes)
  const unsortedItems = useMemo(() => {
    const items = globalUnsortedItems.map(toUnsortedItem);

    if (__DEV__) {
      console.log('[HubUnsorted] Sheet items prepared:', {
        totalGlobalUnsorted: globalUnsortedItems.length,
        sheetItemsReady: items.length,
      });
    }

    return items;
  }, [globalUnsortedItems, toUnsortedItem]); // Note: unsortedCount is now set globally in load() function
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

  // =========================================================================
  // Hub V1 Search Computation (moved outside renderHubV1 for hook rules)
  // =========================================================================
  const isSearchMode = search.trim().length > 0;

  // Compute search results for Hub V1 (search across hubV1Items)
  const searchResults = useMemo(() => {
    if (!isSearchMode) return [];

    // Search across Hub V1 filtered items
    const allItemsForSearch = hubV1Items;

    // Apply text search
    const textNeedle = parsedText?.trim()?.toLowerCase();
    if (!textNeedle) return allItemsForSearch.map(toHubItem);

    return allItemsForSearch
      .filter((item) => {
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
        return haystack.includes(textNeedle);
      })
      .map(toHubItem);
  }, [isSearchMode, hubV1Items, parsedText, toHubItem]);

  const hasResults = searchResults.length > 0;

  // =========================================================================
  // Hub V1 Renderer (new design)
  // =========================================================================
  const renderHubV1 = () => {
    // Toggle type filter
    const toggleTypeFilter = (type: HubV1TypeFilter) => {
      setHubV1Types((prev) => {
        const next = new Set(prev);
        if (next.has(type)) {
          // Don't allow deselecting all types
          if (next.size > 1) {
            next.delete(type);
          }
        } else {
          next.add(type);
        }
        return next;
      });
    };

    return (
      <SafeAreaView style={styles.safe} testID="hub-screen">
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text style={[typeStyles.h1, { marginTop: spacing.sm }]}>Hub</Text>

          {/* Search Input */}
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              placeholder="Search your mind..."
              placeholderTextColor={colors.gray400}
              value={search}
              onChangeText={setSearch}
              testID="hub-search"
              returnKeyType="search"
            />
          </View>

          {/* View Toggle: All Items | Journal View */}
          <View style={hubV1Styles.viewToggleContainer} testID="hub-view-toggle">
            {(['all', 'journals'] as const).map((mode) => {
              const isActive = hubView === mode;
              const label = mode === 'all' ? 'All Items' : 'Journal View';
              const IconComponent = mode === 'all' ? LayoutGrid : BookOpen;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    if (mode === hubView) return;
                    if (mode === 'journals') {
                      // Switching to Journal View: save current type selections
                      savedTypesRef.current = new Set(hubV1Types);
                      setHubV1Types(new Set(['note'])); // Lock to notes only
                    } else {
                      // Switching to All Items: restore saved type selections
                      if (savedTypesRef.current) {
                        setHubV1Types(savedTypesRef.current);
                        savedTypesRef.current = null;
                      }
                    }
                    setHubView(mode);
                  }}
                  style={hubV1Styles.viewToggleTab}
                  testID={`hub-view-toggle-${mode}`}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <IconComponent
                    size={16}
                    color={isActive ? colors.deepTeal : colors.gray400}
                    style={{ marginRight: spacing.xs }}
                  />
                  <Text
                    style={[
                      hubV1Styles.viewToggleTabText,
                      isActive
                        ? hubV1Styles.viewToggleTabActive
                        : hubV1Styles.viewToggleTabInactive,
                    ]}
                  >
                    {label}
                  </Text>
                  {isActive && <View style={hubV1Styles.viewToggleUnderline} />}
                </Pressable>
              );
            })}
          </View>

          {/* Filter Controls */}
          <View style={hubV1Styles.filterContainer}>
            {/* Type Chips (multi-select) */}
            <View style={hubV1Styles.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[
                    hubV1Styles.filterChip,
                    hubV1Types.has('todo') && hubV1Styles.filterChipActive,
                    hubView === 'journals' && hubV1Styles.filterChipDisabled,
                  ]}
                  onPress={() => toggleTypeFilter('todo')}
                  disabled={hubView === 'journals'}
                  testID="filter-type-todo"
                >
                  <Text
                    style={[
                      hubV1Styles.filterChipText,
                      hubV1Types.has('todo') && hubV1Styles.filterChipTextActive,
                      hubView === 'journals' && hubV1Styles.filterChipTextDisabled,
                    ]}
                  >
                    To-Dos
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    hubV1Styles.filterChip,
                    hubV1Types.has('habit') && hubV1Styles.filterChipActive,
                    hubView === 'journals' && hubV1Styles.filterChipDisabled,
                  ]}
                  onPress={() => toggleTypeFilter('habit')}
                  disabled={hubView === 'journals'}
                  testID="filter-type-habit"
                >
                  <Text
                    style={[
                      hubV1Styles.filterChipText,
                      hubV1Types.has('habit') && hubV1Styles.filterChipTextActive,
                      hubView === 'journals' && hubV1Styles.filterChipTextDisabled,
                    ]}
                  >
                    Habits
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    hubV1Styles.filterChip,
                    hubView === 'journals'
                      ? hubV1Styles.filterChipActive
                      : hubV1Types.has('note') && hubV1Styles.filterChipActive,
                  ]}
                  onPress={() => toggleTypeFilter('note')}
                  disabled={hubView === 'journals'}
                  testID="filter-type-note"
                >
                  <Text
                    style={[
                      hubV1Styles.filterChipText,
                      hubView === 'journals'
                        ? hubV1Styles.filterChipTextActive
                        : hubV1Types.has('note') && hubV1Styles.filterChipTextActive,
                    ]}
                  >
                    {hubView === 'journals' ? 'Journals' : 'Logs'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    hubV1Styles.filterChip,
                    hubV1Types.has('space') && hubV1Styles.filterChipActive,
                    hubView === 'journals' && hubV1Styles.filterChipDisabled,
                  ]}
                  onPress={() => toggleTypeFilter('space')}
                  disabled={hubView === 'journals'}
                  testID="filter-type-space"
                >
                  <Text
                    style={[
                      hubV1Styles.filterChipText,
                      hubV1Types.has('space') && hubV1Styles.filterChipTextActive,
                      hubView === 'journals' && hubV1Styles.filterChipTextDisabled,
                    ]}
                  >
                    Spaces
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Time + Status Dropdowns Row */}
            <View style={hubV1Styles.dropdownRow}>
              {/* Time Range Dropdown */}
              <TouchableOpacity
                style={hubV1Styles.dropdown}
                onPress={() => {
                  // Cycle through time ranges for now (TODO: proper picker)
                  const ranges: HubV1TimeRange[] = ['week', 'month', '3months', 'all'];
                  const currentIdx = ranges.indexOf(hubV1TimeRange);
                  const nextIdx = (currentIdx + 1) % ranges.length;
                  setHubV1TimeRange(ranges[nextIdx]);
                }}
                testID="filter-time-dropdown"
              >
                <Text style={hubV1Styles.dropdownText}>{TIME_RANGE_LABELS[hubV1TimeRange]}</Text>
                <Text style={hubV1Styles.dropdownArrow}>▾</Text>
              </TouchableOpacity>

              {/* Status Dropdown */}
              <TouchableOpacity
                style={hubV1Styles.dropdown}
                onPress={() => {
                  // Cycle through statuses for now (TODO: proper picker)
                  const statuses: HubV1StatusFilter[] = ['active', 'completed', 'all'];
                  const currentIdx = statuses.indexOf(hubV1Status);
                  const nextIdx = (currentIdx + 1) % statuses.length;
                  setHubV1Status(statuses[nextIdx]);
                }}
                testID="filter-status-dropdown"
              >
                <Text style={hubV1Styles.dropdownText}>{STATUS_LABELS[hubV1Status]}</Text>
                <Text style={hubV1Styles.dropdownArrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Loading indicator */}
          {hubV1Loading && (
            <View style={{ padding: spacing.md }}>
              <Text style={[typeStyles.body, { textAlign: 'center', color: colors.gray600 }]}>
                Loading...
              </Text>
            </View>
          )}

          {isSearchMode ? (
            // =================================================================
            // SEARCH MODE
            // =================================================================
            <View style={hubV1Styles.searchModeContainer}>
              {hasResults ? (
                <>
                  <Text style={hubV1Styles.resultCount}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </Text>
                  {searchResults.map((item) => (
                    <HubItemCard
                      key={item.id}
                      item={item}
                      onPress={() => handleItemPress(item)}
                      onSpacePress={(spaceId) => navigation.navigate('SpaceHome', { spaceId })}
                      testID={`search-result-${item.id}`}
                    />
                  ))}
                  {/* Search archived items link */}
                  <TouchableOpacity
                    style={hubV1Styles.searchArchivedLink}
                    onPress={() => navigation.navigate('ArchivedItems', { searchQuery: search })}
                    testID="search-archived-link"
                  >
                    <Text style={hubV1Styles.searchArchivedLinkText}>
                      Search archived items too
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                // No results empty state
                <View style={hubV1Styles.noResultsContainer}>
                  <Text style={hubV1Styles.noResultsTitle}>No results found</Text>
                  <Text style={hubV1Styles.noResultsSubtitle}>Try one of these:</Text>
                  <View style={hubV1Styles.suggestionsList}>
                    <Text style={hubV1Styles.suggestionItem}>• Check your spelling</Text>
                    <Text style={hubV1Styles.suggestionItem}>
                      • Use fewer or different keywords
                    </Text>
                    <Text style={hubV1Styles.suggestionItem}>
                      • Search with #tags for better results
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={hubV1Styles.archivedRow}
                    onPress={() => navigation.navigate('ArchivedItems', { searchQuery: search })}
                    testID="no-results-archived-link"
                  >
                    <Text style={hubV1Styles.archivedRowText}>📦 Check archived items</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            // =================================================================
            // HUB MODE (idle state)
            // =================================================================
            <View style={hubV1Styles.hubModeContainer}>
              {hubView === 'journals' ? (
                // ===============================================================
                // JOURNAL VIEW: Timeline grouped by month
                // ===============================================================
                (() => {
                  // Get journal entries from hubV1Items
                  const journalEntries = hubV1Items
                    .filter(
                      (item) =>
                        item.type === 'note' &&
                        (item as import('../../lib/types').Note).subtype === 'journal',
                    )
                    .map((item) => {
                      const note = item as import('../../lib/types').Note;
                      return {
                        id: note.id,
                        date: note.date || '',
                        created_at: note.created_at || '',
                        body: note.body,
                        mood: note.mood,
                        _record: note, // Keep reference for opening overlay
                      };
                    });

                  const monthGroups = groupJournalsByMonth(journalEntries);

                  // Mood color mapping (subtle dots)
                  const moodColors: Record<string, string> = {
                    ecstatic: colors.success,
                    happy: colors.mint,
                    neutral: colors.gray400,
                    low: colors.periwinkle,
                    sad: colors.gray600,
                    tired: colors.gray400,
                  };

                  if (journalEntries.length === 0) {
                    return (
                      <View style={hubV1Styles.journalViewEmpty} testID="journal-view-empty">
                        <Text style={hubV1Styles.journalViewEmptyTitle}>No journals yet</Text>
                        <Text style={hubV1Styles.journalViewEmptyHint}>
                          Try dropping something like "Had a good day today."
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View style={hubV1Styles.journalViewContainer} testID="journal-view-timeline">
                      {/* Analyze CTA Card */}
                      <TouchableOpacity
                        style={hubV1Styles.analyzeCta}
                        onPress={async () => {
                          setAnalyzeModalVisible(true);
                          setAnalyzeLoading(true);
                          setAnalyzeJournalCount(0);

                          try {
                            // Fetch journals from last 30 days
                            const queryOpts = computeLast30DaysRange();
                            const journals = await repo.listByType('note', queryOpts);
                            // Sort oldest to newest for analysis
                            journals.sort((a, b) => {
                              const dateA = a.created_at || '';
                              const dateB = b.created_at || '';
                              return dateA.localeCompare(dateB);
                            });
                            setAnalyzeJournalCount(journals.length);
                          } catch (err) {
                            if (__DEV__) {
                              console.error('[Hub] Failed to fetch journals for analysis:', err);
                            }
                          } finally {
                            setAnalyzeLoading(false);
                          }
                        }}
                        activeOpacity={0.8}
                        testID="journal-analyze-cta"
                      >
                        <BarChart3
                          size={20}
                          color={colors.deepTeal}
                          style={{ marginRight: spacing.sm }}
                        />
                        <Text style={hubV1Styles.analyzeCtaText}>Analyze last 30 days</Text>
                      </TouchableOpacity>

                      {monthGroups.map((group) => (
                        <View key={group.monthKey} style={hubV1Styles.journalMonthGroup}>
                          <Text style={hubV1Styles.journalMonthHeader}>{group.label}</Text>
                          {group.journals.map((journal) => {
                            const record = hubV1Items.find((i) => i.id === journal.id);
                            return (
                              <TouchableOpacity
                                key={journal.id}
                                style={hubV1Styles.journalTimelineRow}
                                onPress={() => {
                                  if (record) {
                                    overlayController.openEdit({ record });
                                  }
                                }}
                                testID={`journal-timeline-${journal.id}`}
                              >
                                <View style={hubV1Styles.journalTimelineDate}>
                                  <Text style={hubV1Styles.journalTimelineDateText}>
                                    {formatJournalDateHelper(journal.date || journal.created_at)}
                                  </Text>
                                </View>
                                {journal.mood && (
                                  <View
                                    style={[
                                      hubV1Styles.journalTimelineMood,
                                      {
                                        backgroundColor: moodColors[journal.mood] || colors.gray400,
                                      },
                                    ]}
                                  />
                                )}
                                <Text style={hubV1Styles.journalTimelinePreview} numberOfLines={1}>
                                  {getJournalPreview(journal.body, 60) || 'No content'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  );
                })()
              ) : (
                // ===============================================================
                // ALL ITEMS VIEW: Original Hub sections
                // ===============================================================
                <>
                  {/* Section 1: So you don't forget... */}
                  {(() => {
                    // Compute needs-attention items
                    const todos = hubV1Items.filter(
                      (item) => item.type === 'todo',
                    ) as import('../../lib/types').Todo[];
                    const notes = hubV1Items.filter(
                      (item) => item.type === 'note',
                    ) as import('../../lib/types').Note[];
                    const needsAttentionItems = selectNeedsAttentionItems(todos, notes, {
                      nowIso: new Date().toISOString(),
                      todoStaleDays: 5,
                      ideaStaleDays: 7,
                      includeNoSpace: false,
                    }).slice(0, 3); // Max 3 items

                    // Format reason text for display
                    const formatReasonLabel = (item: NeedsAttentionItem): string => {
                      if (item.reason === 'todo_missing_due_date_stale') {
                        return `No due date · ${item.ageInDays} days ago`;
                      }
                      if (item.reason === 'idea_stale') {
                        return `Idea · ${item.ageInDays} days ago`;
                      }
                      if (item.reason === 'no_space_assigned') {
                        return `No space · ${item.ageInDays} days ago`;
                      }
                      return `${item.ageInDays} days ago`;
                    };

                    return (
                      <View style={hubV1Styles.section}>
                        <View style={hubV1Styles.sectionHeader}>
                          <Text style={hubV1Styles.sectionTitle}>So you don't forget…</Text>
                          {needsAttentionItems.length > 0 && (
                            <View style={hubV1Styles.countBadge}>
                              <Text style={hubV1Styles.countBadgeText}>
                                {needsAttentionItems.length}
                              </Text>
                            </View>
                          )}
                        </View>
                        {needsAttentionItems.length > 0 ? (
                          needsAttentionItems.map((attentionItem) => {
                            const record = attentionItem.item;
                            const hubItem = toHubItem(record);
                            return (
                              <TouchableOpacity
                                key={record.id}
                                style={hubV1Styles.attentionRow}
                                onPress={() => {
                                  overlayController.openEdit({ record });
                                }}
                                testID={`attention-item-${record.id}`}
                              >
                                <View style={hubV1Styles.attentionContent}>
                                  <Text style={hubV1Styles.attentionTitle} numberOfLines={1}>
                                    {hubItem.title}
                                  </Text>
                                  <Text style={hubV1Styles.attentionReason}>
                                    {formatReasonLabel(attentionItem)}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        ) : (
                          <View style={hubV1Styles.attentionEmptyState}>
                            <Text style={hubV1Styles.attentionEmptyText}>
                              Nothing floating around — you're on top of it ✨
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Section 2: Recent Journals */}
                  {(() => {
                    // Filter journal entries from hubV1Items
                    const journalEntries = hubV1Items
                      .filter(
                        (item) =>
                          item.type === 'note' &&
                          (item as import('../../lib/types').Note).subtype === 'journal',
                      )
                      .slice(0, 7) as import('../../lib/types').Note[];

                    // Mood color mapping (subtle dots)
                    const moodColors: Record<string, string> = {
                      ecstatic: colors.success,
                      happy: colors.mint,
                      neutral: colors.gray400,
                      low: colors.periwinkle,
                      sad: colors.gray600,
                      tired: colors.gray400,
                    };

                    // Format date for display
                    const formatJournalDate = (dateStr: string): string => {
                      const date = new Date(dateStr);
                      const now = new Date();
                      const diffMs = now.getTime() - date.getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                      if (diffDays === 0) return 'Today';
                      if (diffDays === 1) return 'Yesterday';
                      if (diffDays < 7)
                        return date.toLocaleDateString('en-US', { weekday: 'short' });
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    };

                    // Get first line preview
                    const getPreview = (body: string | null | undefined): string => {
                      if (!body) return '';
                      const firstLine = body.split('\n')[0].trim();
                      return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
                    };

                    return (
                      <View style={hubV1Styles.section}>
                        <Text style={hubV1Styles.sectionTitle}>Recent Journals</Text>
                        {journalEntries.length > 0 ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={hubV1Styles.journalRail}
                            contentContainerStyle={hubV1Styles.journalRailContent}
                          >
                            {journalEntries.map((journal) => (
                              <TouchableOpacity
                                key={journal.id}
                                style={hubV1Styles.journalCard}
                                onPress={() => {
                                  overlayController.openEdit({ record: journal });
                                }}
                                testID={`journal-card-${journal.id}`}
                              >
                                <View style={hubV1Styles.journalCardHeader}>
                                  <Text style={hubV1Styles.journalCardDate}>
                                    {formatJournalDate(journal.date || journal.created_at)}
                                  </Text>
                                  {journal.mood && (
                                    <View
                                      style={[
                                        hubV1Styles.moodDot,
                                        {
                                          backgroundColor:
                                            moodColors[journal.mood] || colors.gray400,
                                        },
                                      ]}
                                    />
                                  )}
                                </View>
                                <Text style={hubV1Styles.journalCardPreview} numberOfLines={2}>
                                  {getPreview(journal.body) || 'No content'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        ) : (
                          <View style={hubV1Styles.journalEmptyState}>
                            <Text style={hubV1Styles.journalEmptyText}>
                              No journals yet. Try dropping something like "Had a good day today."
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Section 3: Popular Tags */}
                  {(() => {
                    // Compute tag usage counts from hubV1Items
                    const tagUsageMap = new Map<string, number>();

                    for (const item of hubV1Items) {
                      const itemTagArray = (item as any).tags as string[] | null | undefined;
                      if (Array.isArray(itemTagArray)) {
                        for (const tagName of itemTagArray) {
                          const normalized = tagName.toLowerCase().trim();
                          if (normalized) {
                            tagUsageMap.set(normalized, (tagUsageMap.get(normalized) || 0) + 1);
                          }
                        }
                      }
                    }

                    // Sort by usage count descending
                    const sortedTags = Array.from(tagUsageMap.entries()).sort(
                      (a, b) => b[1] - a[1],
                    );

                    const visibleTags = sortedTags.slice(0, 5);
                    const remainingCount = Math.max(0, sortedTags.length - 5);

                    // Check if a tag is currently selected
                    const isTagSelected = (tagName: string): boolean => {
                      return selectedTagFilters.some(
                        (f) => f.toLowerCase() === tagName.toLowerCase(),
                      );
                    };

                    // Toggle tag filter
                    const handleTagPress = (tagName: string) => {
                      const normalized = tagName.toLowerCase();
                      if (isTagSelected(normalized)) {
                        setSelectedTagFilters((prev) =>
                          prev.filter((t) => t.toLowerCase() !== normalized),
                        );
                      } else {
                        setSelectedTagFilters((prev) => [...prev, normalized]);
                      }
                    };

                    return (
                      <View style={hubV1Styles.section}>
                        <Text style={hubV1Styles.sectionTitle}>Popular Tags</Text>
                        {visibleTags.length > 0 ? (
                          <View style={hubV1Styles.tagsContainer}>
                            {visibleTags.map(([tagName, count]) => (
                              <TouchableOpacity
                                key={tagName}
                                style={[
                                  hubV1Styles.tagChip,
                                  isTagSelected(tagName) && hubV1Styles.tagChipSelected,
                                ]}
                                onPress={() => handleTagPress(tagName)}
                                testID={`popular-tag-${tagName}`}
                              >
                                <Text
                                  style={[
                                    hubV1Styles.tagChipText,
                                    isTagSelected(tagName) && hubV1Styles.tagChipTextSelected,
                                  ]}
                                >
                                  #{tagName}
                                </Text>
                                <Text
                                  style={[
                                    hubV1Styles.tagChipCount,
                                    isTagSelected(tagName) && hubV1Styles.tagChipCountSelected,
                                  ]}
                                >
                                  {count}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            {remainingCount > 0 && (
                              <TouchableOpacity
                                style={hubV1Styles.tagChipMore}
                                onPress={() => {
                                  // TODO Phase 3: Open full tags modal
                                  if (__DEV__) {
                                    console.log('[Hub] TODO: Open full tags modal');
                                  }
                                }}
                                testID="popular-tags-more"
                              >
                                <Text style={hubV1Styles.tagChipMoreText}>
                                  +{remainingCount} more
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : (
                          <View style={hubV1Styles.tagsEmptyState}>
                            <Text style={hubV1Styles.tagsEmptyText}>
                              No tags yet. Add #tags to your items to organize them.
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Section 4: Browse by Space (secondary styling) */}
                  {(() => {
                    // Compute item counts per space from hubV1Items
                    const spaceCounts = new Map<string, number>();
                    for (const item of hubV1Items) {
                      if (item.space_id) {
                        spaceCounts.set(item.space_id, (spaceCounts.get(item.space_id) || 0) + 1);
                      }
                    }

                    return (
                      <View style={hubV1Styles.section}>
                        <Text style={hubV1Styles.sectionTitleSecondary}>Browse by Space</Text>
                        {spaces.length > 0 ? (
                          <View style={hubV1Styles.spacesGrid}>
                            {spaces.map((space) => (
                              <TouchableOpacity
                                key={space.id}
                                style={hubV1Styles.spaceCard}
                                onPress={() =>
                                  navigation.navigate('SpaceHome', { spaceId: space.id })
                                }
                                testID={`hub-space-card-${space.id}`}
                              >
                                <Text style={hubV1Styles.spaceCardName} numberOfLines={1}>
                                  {space.name}
                                </Text>
                                <Text style={hubV1Styles.spaceCardCount}>
                                  {spaceCounts.get(space.id) || 0} items
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <View style={hubV1Styles.spacesEmptyState}>
                            <Text style={hubV1Styles.spacesEmptyText}>No spaces yet</Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Section 5: Archived drawer */}
                  <TouchableOpacity
                    style={hubV1Styles.archivedRow}
                    onPress={() => navigation.navigate('ArchivedItems', undefined)}
                    testID="hub-archived-btn"
                  >
                    <Text style={hubV1Styles.archivedRowText}>📦 Check archived items</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Analyze Journals Modal */}
        <Modal
          visible={analyzeModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setAnalyzeModalVisible(false)}
          testID="journal-analyze-modal"
        >
          <View style={hubV1Styles.analyzeModalContainer}>
            {/* Header */}
            <View style={hubV1Styles.analyzeModalHeader}>
              <Text style={hubV1Styles.analyzeModalTitle}>Journal Insights</Text>
              <TouchableOpacity
                onPress={() => setAnalyzeModalVisible(false)}
                style={hubV1Styles.analyzeModalClose}
                testID="journal-analyze-modal-close"
              >
                <X size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={hubV1Styles.analyzeModalContent}>
              {analyzeLoading ? (
                <View style={hubV1Styles.analyzeLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.deepTeal} />
                  <Text style={hubV1Styles.analyzeLoadingText}>Analyzing your journals...</Text>
                </View>
              ) : (
                <>
                  {/* Journal count summary */}
                  <Text style={hubV1Styles.analyzeJournalCount} testID="analyze-journal-count">
                    Based on {analyzeJournalCount} journal
                    {analyzeJournalCount !== 1 ? ' entries' : ' entry'}
                  </Text>

                  {/* Themes Section */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <Sparkles size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>Themes</Text>
                    </View>
                    <View style={hubV1Styles.analyzePlaceholder}>
                      <Text style={hubV1Styles.analyzePlaceholderText}>
                        Common themes from your journals will appear here.
                      </Text>
                    </View>
                  </View>

                  {/* Patterns Section */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <BarChart3 size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>Patterns</Text>
                    </View>
                    <View style={hubV1Styles.analyzePlaceholder}>
                      <Text style={hubV1Styles.analyzePlaceholderText}>
                        Recurring patterns in your writing will appear here.
                      </Text>
                    </View>
                  </View>

                  {/* When you journal Section */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <Calendar size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>When you journal</Text>
                    </View>
                    <View style={hubV1Styles.analyzePlaceholder}>
                      <Text style={hubV1Styles.analyzePlaceholderText}>
                        Insights about your journaling habits will appear here.
                      </Text>
                    </View>
                  </View>

                  {/* Gentle suggestion Section */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <Lightbulb size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>Gentle suggestion</Text>
                    </View>
                    <View style={hubV1Styles.analyzePlaceholder}>
                      <Text style={hubV1Styles.analyzePlaceholderText}>
                        A personalized suggestion based on your journals will appear here.
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            {/* Footer with disclaimer */}
            <View style={hubV1Styles.analyzeModalFooter}>
              <Text style={hubV1Styles.analyzeModalDisclaimer}>
                This is a reflection, not a diagnosis. If something doesn't feel right, ignore it.
              </Text>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  };

  // =========================================================================
  // Render
  // =========================================================================
  if (HUB_V1) {
    return renderHubV1();
  }

  // Legacy Hub UI (preserved below)
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
                placeholder="Search or add tags (#anxious *journal @alice)"
                placeholderTextColor={colors.gray400}
                value={search}
                onChangeText={setSearch}
                testID="hub-search"
              />
            </View>

            {availableTagNames.length > 0 && (
              <View style={{ marginTop: spacing.sm, marginHorizontal: spacing.md }}>
                <TagFilterBar
                  selected={selectedTagFilters}
                  available={availableTagNames}
                  onChange={handleTagFilterChange}
                  testID="hub-tag-filter"
                />
              </View>
            )}

            {/* Unsorted Banner */}
            {unsortedCount > 0 && !bannerDismissed && (
              <TouchableOpacity
                style={styles.unsortedBanner}
                onPress={() => {
                  if (__DEV__) {
                    console.log('[HubUnsorted] Opening sheet:', {
                      bannerCount: unsortedCount,
                      sheetItemsAvailable: unsortedItems.length,
                      currentTab: tab,
                      currentScope: scope.type,
                    });
                  }
                  // Refetch to ensure we have the latest unsorted items
                  load();
                  setReviewSheetVisible(true);
                }}
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
                title={`No ${noteLabelPlural} yet`}
                subtitle="Capture ideas, lists, and references."
              />
            )}
            {tab === 'Lists' &&
              !loading &&
              !error &&
              listsData.shopping.total === 0 &&
              listsData.packing.total === 0 && (
                <EmptyState
                  testID="empty-lists"
                  title="No Lists yet"
                  subtitle="Create shopping and packing lists."
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
            {!isEmpty && !error && tab !== 'People' && tab !== 'Lists' && (
              <View style={styles.section}>
                <Text style={typeStyles.h2}>{tab === 'Notes' ? noteLabelPlural : tab}</Text>
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

            {/* Lists tab content */}
            {tab === 'Lists' && !loading && (
              <View style={styles.section}>
                <Text style={[typeStyles.h2, { marginBottom: spacing.md }]}>Lists</Text>

                {/* Shopping List Card */}
                <TouchableOpacity
                  style={styles.listCard}
                  onPress={() => navigation.navigate('Lists')}
                  testID="shopping-list-card"
                >
                  <Text style={styles.listCardTitle}>🛒 Shopping</Text>
                  <Text style={styles.listCardSubtitle}>
                    {listsData.shopping.incomplete} items
                    {listsData.shopping.total > 0 && ` • ${listsData.shopping.total} total`}
                  </Text>
                </TouchableOpacity>

                {/* Packing List Card */}
                <TouchableOpacity
                  style={styles.listCard}
                  onPress={() => navigation.navigate('Lists')}
                  testID="packing-list-card"
                >
                  <Text style={styles.listCardTitle}>🎒 Packing</Text>
                  <Text style={styles.listCardSubtitle}>
                    {listsData.packing.incomplete} items
                    {listsData.packing.total > 0 && ` • ${listsData.packing.total} total`}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        data={tab === 'People' || tab === 'Lists' ? [] : allItems}
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
          !isEmpty && !error && tab !== 'People' && tab !== 'Lists' ? (
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
      {overlayController.state.visible &&
        (overlayController.state.mode === 'create' || overlayController.state.mode === 'edit') && (
          <UnifiedCreateOverlay
            visible={overlayController.state.visible}
            mode={overlayController.state.mode}
            initialEntity={overlayController.state.initialEntity}
            initialSpaceId={overlayController.state.initialSpaceId}
            onClose={overlayController.close}
            onSaved={handleOverlaySaved}
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
  listCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  listCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  listCardSubtitle: {
    fontSize: 14,
    color: colors.gray600,
  },
});

// Hub V1 specific styles
const hubV1Styles = StyleSheet.create({
  // View Toggle (All Items | Journal View)
  viewToggleContainer: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  viewToggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  viewToggleTabText: {
    fontSize: 15,
    textAlign: 'center',
  },
  viewToggleTabActive: {
    color: colors.deepTeal,
    fontWeight: '600',
  },
  viewToggleTabInactive: {
    color: colors.gray400,
    fontWeight: '400',
  },
  viewToggleUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: 60,
    backgroundColor: colors.deepTeal,
    borderRadius: 1,
  },
  hubModeContainer: {
    marginTop: spacing.lg,
  },
  searchModeContainer: {
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  sectionTitleSecondary: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray600,
    marginBottom: spacing.sm,
  },
  placeholderSection: {
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    padding: spacing.lg,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: colors.gray400,
    fontStyle: 'italic',
  },
  resultCount: {
    fontSize: 14,
    color: colors.gray600,
    marginBottom: spacing.sm,
  },
  archivedRow: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  archivedRowText: {
    fontSize: 15,
    color: colors.gray600,
    fontWeight: '500',
  },
  // Search archived link (lightweight, under search results)
  searchArchivedLink: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  searchArchivedLinkText: {
    fontSize: 14,
    color: colors.gray400,
    fontWeight: '400',
  },
  // No results empty state
  noResultsContainer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  noResultsSubtitle: {
    fontSize: 14,
    color: colors.gray600,
    marginBottom: spacing.md,
  },
  suggestionsList: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  suggestionItem: {
    fontSize: 14,
    color: colors.gray600,
    marginBottom: spacing.xs,
  },
  // Filter controls
  filterContainer: {
    marginTop: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginRight: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray600,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  filterChipDisabled: {
    opacity: 0.4,
  },
  filterChipTextDisabled: {
    color: colors.gray400,
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  dropdownText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
    marginRight: spacing.xs,
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.gray400,
  },
  // Section header with count badge
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  countBadge: {
    marginLeft: spacing.sm,
    backgroundColor: colors.gray200,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.lg,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray600,
  },
  // Attention row (needs attention items)
  attentionRow: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  attentionContent: {
    flex: 1,
  },
  attentionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
    marginBottom: 2,
  },
  attentionReason: {
    fontSize: 13,
    color: colors.gray600,
  },
  attentionEmptyState: {
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  attentionEmptyText: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
  },
  // Journal rail
  journalRail: {
    marginHorizontal: -spacing.md, // Extend to edges
  },
  journalRailContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  journalCard: {
    width: 140,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  journalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  journalCardDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  moodDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  journalCardPreview: {
    fontSize: 13,
    color: colors.gray600,
    lineHeight: 18,
  },
  journalEmptyState: {
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  journalEmptyText: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
  },
  // Popular Tags section
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.gray200,
    gap: spacing.xs,
  },
  tagChipSelected: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  tagChipTextSelected: {
    color: colors.white,
  },
  tagChipCount: {
    fontSize: 12,
    color: colors.gray400,
  },
  tagChipCountSelected: {
    color: colors.white,
    opacity: 0.8,
  },
  tagChipMore: {
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  tagChipMoreText: {
    fontSize: 13,
    color: colors.gray600,
    fontWeight: '500',
  },
  tagsEmptyState: {
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  tagsEmptyText: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
  },
  // Browse by Space section (secondary/de-emphasized styling)
  spacesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  spaceCard: {
    backgroundColor: colors.gray100,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 100,
  },
  spaceCardName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray600,
    marginBottom: 2,
  },
  spaceCardCount: {
    fontSize: 11,
    color: colors.gray400,
  },
  spacesEmptyState: {
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  spacesEmptyText: {
    fontSize: 13,
    color: colors.gray400,
    textAlign: 'center',
  },
  // Journal View Timeline styles
  journalViewContainer: {
    marginTop: spacing.md,
  },
  journalViewEmpty: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  journalViewEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  journalViewEmptyHint: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
  },
  journalMonthGroup: {
    marginTop: spacing.lg,
  },
  journalMonthHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  journalTimelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
  },
  journalTimelineDate: {
    width: 72,
    marginRight: spacing.sm,
  },
  journalTimelineDateText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray600,
  },
  journalTimelineMood: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  journalTimelinePreview: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
  },
  // Analyze CTA styles
  analyzeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  analyzeCtaText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.deepTeal,
  },
  // Analyze Modal styles
  analyzeModalContainer: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  analyzeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
  },
  analyzeModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
  },
  analyzeModalClose: {
    position: 'absolute',
    right: spacing.md,
    padding: spacing.xs,
  },
  analyzeModalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  analyzeLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  analyzeLoadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.gray600,
  },
  analyzeJournalCount: {
    fontSize: 14,
    color: colors.gray600,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  analyzeSection: {
    marginBottom: spacing.xl,
  },
  analyzeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  analyzeSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginLeft: spacing.sm,
  },
  analyzePlaceholder: {
    backgroundColor: colors.gray100,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  analyzePlaceholderText: {
    fontSize: 14,
    color: colors.gray400,
    fontStyle: 'italic',
  },
  analyzeModalFooter: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray200,
    backgroundColor: colors.cream,
  },
  analyzeModalDisclaimer: {
    fontSize: 12,
    color: colors.gray400,
    textAlign: 'center',
    lineHeight: 18,
  },
});
