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
  Image,
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
  Archive,
  Search,
  Settings,
  Wrench,
} from 'lucide-react-native';

import { useAuth } from '../../providers/AuthProvider';
import SegmentedTabs from '../../components/SegmentedTabs';
import ScopeSelector, { type ScopeOption } from '../../components/ScopeSelector';
import HubItemCard, { type HubItem } from '../../components/HubItemCard';
import { WeekStrip, CalendarDayView } from '../../components/calendar';
import { AllItemsTable } from '../../components/hub';
import { getDateService } from '../../lib/date';
import type { CalendarItem } from '../../lib/store/calendarSelectors';
import UnsortedReviewSheet, { type UnsortedItem } from '../../components/UnsortedReviewSheet';
import PeopleList, { type PersonWithCounts } from '../../components/people/PeopleList';
import { colors, radii, spacing } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';
import { BRAND } from '../../design/brand';
import RitualProgressPopover from '../../components/ritual/RitualProgressPopover';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { AppRecord, Space, Person, Tag, Todo, Habit, Note } from '../../lib/types';
import { SheetManager } from 'react-native-actions-sheet';
import Chip from '../../components/ui/Chip';
import EmptyState from '../../components/EmptyState';
import {
  selectNeedsAttentionItems,
  type NeedsAttentionItem,
} from '../../lib/selectors/hubSelectors';
// Store provides real-time updates - no manual reload listeners needed
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
// Store selectors and hooks
import {
  useHubTodos,
  useHubHabits,
  useHubJournals,
  useHubNotes,
  useDiscoveredPeople,
  useDiscoveredLists,
  useUnsortedItems,
  useActiveSpaces,
  usePopularTags,
  useAllActiveItemsHub,
  filterUnsortedForReview,
} from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

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
type HubV1View = 'all' | 'journals' | 'calendar';

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
  const { user } = useAuth();

  // Unified overlay controller
  const overlayController = useUnifiedOverlayController();

  // ═══════════════════════════════════════════════════════════════════
  // ZUSTAND STORE DATA - single source of truth
  // ═══════════════════════════════════════════════════════════════════
  const storeTodos = useHubTodos();
  const storeHabits = useHubHabits();
  const storeJournals = useHubJournals();
  const storeNotes = useHubNotes();
  const storeSpaces = useActiveSpaces();
  const storeTags = usePopularTags();
  const storeUnsortedItems = useUnsortedItems();
  const discoveredPeople = useDiscoveredPeople();
  const discoveredLists = useDiscoveredLists();
  const storeAllActiveItems = useAllActiveItemsHub();

  // Store mutations
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const storeIsLoading = useGremlyStore((s) => s.isLoading);
  const storeIsInitialized = useGremlyStore((s) => s.isInitialized);
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const todayDropsCount = useGremlyStore((s) => s.todayDropsCount);
  const todaySweepsCount = useGremlyStore((s) => s.todaySweepsCount);

  // ═══════════════════════════════════════════════════════════════════
  // UI STATE (local to this screen)
  // ═══════════════════════════════════════════════════════════════════
  const [error, setError] = useState<string | null>(null);
  const [showRitualProgress, setShowRitualProgress] = useState(false);
  const [tab, setTab] = useState<Tab>('Habits');
  const [scope, setScope] = useState<ScopeOption>({ type: 'everywhere', label: 'Everywhere' });
  const [search, setSearch] = useState('');
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [notesSubfilter, setNotesSubfilter] = useState<'all' | 'idea' | 'list' | 'reference'>(
    'all',
  );
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);

  // Hub V1 filter state
  const [hubV1Types, setHubV1Types] = useState<Set<HubV1TypeFilter>>(
    new Set(['todo', 'habit', 'note', 'space']),
  );
  const [hubV1TimeRange, setHubV1TimeRange] = useState<HubV1TimeRange>('month');
  const [hubV1Status, setHubV1Status] = useState<HubV1StatusFilter>('active');
  const [hubView, setHubView] = useState<HubV1View>('all');
  // Calendar view date state
  const [calendarDate, setCalendarDate] = useState<string>(() => getDateService().getCurrentDate());
  // Save previous type selections when switching to Journal View
  const savedTypesRef = useRef<Set<HubV1TypeFilter> | null>(null);
  // Analyze journals modal state
  const [analyzeModalVisible, setAnalyzeModalVisible] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeJournalCount, setAnalyzeJournalCount] = useState(0);

  // Handler to open settings screen
  const handleOpenNotificationSettings = useCallback(() => {
    navigation.navigate('Settings' as never);
  }, [navigation]);

  // ═══════════════════════════════════════════════════════════════════
  // DERIVED DATA FROM STORE
  // ═══════════════════════════════════════════════════════════════════

  // Lists data derived from discoveredLists
  const listsData = useMemo(() => {
    const shopping = discoveredLists.find((l) => l.type === 'shopping');
    const packing = discoveredLists.find((l) => l.type === 'packing');

    return {
      shopping: shopping
        ? { incomplete: shopping.incompleteCount, total: shopping.totalCount }
        : { incomplete: 0, total: 0 },
      packing: packing
        ? { incomplete: packing.incompleteCount, total: packing.totalCount }
        : { incomplete: 0, total: 0 },
    };
  }, [discoveredLists]);

  // People with counts derived from discoveredPeople
  const peopleWithCounts = useMemo((): PersonWithCounts[] => {
    return discoveredPeople.map((person) => ({
      // Required Person fields with defaults for discovered people
      id: person.id,
      owner_id: '', // Not available from discovered data
      display_name: person.name,
      name: person.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linkedCounts: {
        habits: 0,
        todos: 0,
        journal: 0,
        notes: person.itemCount,
      },
    }));
  }, [discoveredPeople]);

  // ═══════════════════════════════════════════════════════════════════
  // DERIVED DATA FROM STORE - filtered by current tab
  // ═══════════════════════════════════════════════════════════════════
  const items = useMemo((): AppRecord[] => {
    if (tab === 'Habits') return storeHabits;
    if (tab === 'To-Dos') return storeTodos;
    if (tab === 'Journal') return storeJournals;
    if (tab === 'Notes') {
      if (notesSubfilter === 'all') return storeNotes;
      return storeNotes.filter((n) => n.subtype === notesSubfilter);
    }
    return [];
  }, [tab, storeHabits, storeTodos, storeJournals, storeNotes, notesSubfilter]);

  // Apply scope filtering
  const scopedItems = useMemo((): AppRecord[] => {
    if (scope.type === 'everywhere') return items;
    if (scope.type === 'unassigned') return items.filter((item) => !item.space_id);
    if (scope.type === 'space' && scope.spaceId) {
      return items.filter((item) => item.space_id === scope.spaceId);
    }
    return items;
  }, [items, scope]);

  // Hub V1 items - derived from store with filters
  const hubV1Items = useMemo((): AppRecord[] => {
    const timeRange = computeTimeRange(hubV1TimeRange);
    let results: AppRecord[] = [];

    if (hubView === 'journals') {
      results = [...storeJournals];
    } else {
      if (hubV1Types.has('todo')) results.push(...storeTodos);
      if (hubV1Types.has('habit')) results.push(...storeHabits);
      if (hubV1Types.has('note')) results.push(...storeNotes);
    }

    // Apply time range filter
    if (timeRange.createdAfter) {
      results = results.filter((item) => (item.created_at ?? '') >= timeRange.createdAfter!);
    }

    // Apply status filter
    if (hubV1Status === 'active') {
      results = results.filter((item) => !item.archived);
    } else if (hubV1Status === 'completed') {
      results = results.filter((item) => item.archived);
    }

    // Sort by created_at DESC
    results.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

    return results;
  }, [
    storeJournals,
    storeTodos,
    storeHabits,
    storeNotes,
    hubView,
    hubV1Types,
    hubV1TimeRange,
    hubV1Status,
  ]);

  // Use store spaces
  const spaces = storeSpaces;

  // Use store tags (convert PopularTag[] to Tag[] for compatibility)
  const tags = useMemo(() => {
    return storeTags.map((pt) => ({ id: pt.name, name: pt.name, color: colors.deepTeal }) as Tag);
  }, [storeTags]);

  // Unsorted count from store
  const unsortedCount = storeUnsortedItems.length;

  // Global unsorted items for sheet
  const globalUnsortedItems = storeUnsortedItems;

  // Loading state
  const loading = storeIsLoading;

  const phase8Enabled = process.env.EXPO_PUBLIC_FEATURE_BUDDY === 'true';

  // Tags are now derived from store - no need to load separately

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

      // Get tags for this item from the item's tags field (store data)
      const itemTagsArray = (item as { tags?: string[] }).tags ?? [];
      const tags = itemTagsArray.map((tagName) => ({
        id: tagName,
        name: tagName,
        color: colors.deepTeal,
        owner_id: '',
        created_at: '',
        updated_at: '',
      })) as Tag[];

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
    [scope.type, spaces],
  );

  // Reset notes subfilter when switching away from Notes tab
  useEffect(() => {
    if (tab !== 'Notes') {
      setNotesSubfilter('all');
    }
  }, [tab]);

  // Filter by search (items are already filtered by tab via derived state)
  const filteredAll = useMemo(() => {
    if (tab === 'People') return [];

    let filtered = scopedItems;

    if (phase8Enabled && mergedTagNames.length > 0) {
      const wanted = new Set(mergedTagNames);
      filtered = filtered.filter((item) => {
        const itemTagsArray = (item as { tags?: string[] }).tags ?? [];
        return itemTagsArray.some((tagName) => wanted.has(normalizeSearchTagInput(tagName)));
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
  }, [scopedItems, parsedText, tab, mergedTagNames, phase8Enabled]);

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
    const result = filterUnsortedForReview(items);

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
  }, [globalUnsortedItems, toUnsortedItem]); // Note: unsortedCount now comes from store selector
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
      const record = scopedItems.find((r) => r.id === item.id);
      if (record) {
        // Get current spaceId from scope
        const spaceId = scope.type === 'space' ? scope.spaceId : undefined;
        overlayController.openEdit({ record, spaceId });
      }
    },
    [scopedItems, scope, overlayController],
  );

  const handleMovePress = useCallback(
    async (item: HubItem) => {
      const record = scopedItems.find((r) => r.id === item.id);
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
        // Store auto-updates via EventBus - no manual reload needed
      } catch (err) {
        console.error('[HubScreen] Move sheet error', err);
      }
    },
    [scopedItems],
  );

  const handleConfirmUnsorted = useCallback(
    async (id: string) => {
      try {
        // Find the item to determine its type
        const item = storeUnsortedItems.find((i) => i.id === id);
        if (!item) {
          console.error('[HubScreen] Item not found for confirmation:', id);
          return;
        }

        // Flip ai_placed to false to confirm the item using appropriate store mutation
        if (item.type === 'todo') {
          await updateTodo(id, { ai_placed: false });
        } else if (item.type === 'habit') {
          await updateHabit(id, { ai_placed: false });
        } else if (item.type === 'note') {
          await updateNote(id, { ai_placed: false });
        }

        // Close sheet if no more items to review
        if (storeUnsortedItems.length <= 1) {
          setReviewSheetVisible(false);
          setBannerDismissed(false); // Ensure banner shows again if new items appear
        }
      } catch (err) {
        console.error('[HubScreen] Failed to confirm unsorted item:', err);
      }
    },
    [storeUnsortedItems, updateTodo, updateHabit, updateNote],
  );

  const handleOverlaySaved = useCallback(() => {
    // Store auto-updates via EventBus - no manual reload needed
  }, []);

  const isEmpty = scopedItems.length === 0;

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
  // Hub V1 Memoized Derived Data (avoid recomputing on every render)
  // =========================================================================

  // Memoize journal entries for Journal View
  const journalEntries = useMemo(() => {
    return hubV1Items
      .filter(
        (item) =>
          item.type === 'note' && (item as import('../../lib/types').Note).subtype === 'journal',
      )
      .map((item) => {
        const note = item as import('../../lib/types').Note;
        return {
          id: note.id,
          date: note.date || '',
          created_at: note.created_at || '',
          body: note.body,
          mood: note.mood,
        };
      });
  }, [hubV1Items]);

  // Memoize grouped journals for Journal View timeline
  const groupedJournals = useMemo(() => {
    return groupJournalsByMonth(journalEntries);
  }, [journalEntries]);

  // Memoize needs-attention items (max 2, only shown if qualifying items exist)
  const needsAttentionItems = useMemo(() => {
    const todos = hubV1Items.filter(
      (item) => item.type === 'todo',
    ) as import('../../lib/types').Todo[];
    const notes = hubV1Items.filter(
      (item) => item.type === 'note',
    ) as import('../../lib/types').Note[];
    const today = getDateService().getCurrentDate(); // YYYY-MM-DD (local timezone)
    return selectNeedsAttentionItems(todos, notes, {
      nowIso: new Date().toISOString(),
      todayDate: today,
      todoStaleDays: 7,
      ideaStaleDays: 14,
      unorganizedStaleDays: 7,
    }).slice(0, 2); // Max 2 items
  }, [hubV1Items]);

  // Memoize tag usage counts (for search suggestions)
  const tagUsageData = useMemo(() => {
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

    // Sort by usage count descending, limit to 5
    const sortedTags = Array.from(tagUsageMap.entries()).sort((a, b) => b[1] - a[1]);
    const visibleTags = sortedTags.slice(0, 5);

    return { visibleTags };
  }, [hubV1Items]);

  // =========================================================================
  // Hub V1 Stable Callbacks
  // =========================================================================

  // Stable callback for toggling type filter
  const toggleTypeFilter = useCallback((type: HubV1TypeFilter) => {
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
  }, []);

  // Stable callback for archived press
  const handleArchivedPress = useCallback(() => {
    navigation.navigate('ArchivedItems', undefined);
  }, [navigation]);

  // Stable callback for opening edit overlay
  const handleOpenEdit = useCallback(
    (record: AppRecord) => {
      overlayController.openEdit({ record });
    },
    [overlayController],
  );

  // Mood color mapping (static, defined once)
  // Now handles both single moods and first mood from array
  const moodColors: Record<string, string> = useMemo(
    () => ({
      // New mood values
      great: colors.success,
      good: colors.mint,
      okay: colors.gray400,
      low: colors.periwinkle,
      tired: colors.gray400,
      anxious: colors.periwinkle,
      overwhelmed: colors.periwinkle,
      frustrated: colors.gray600,
      scattered: colors.gray400,
      grateful: colors.mint,
      hopeful: colors.success,
      focused: colors.mint,
      calm: colors.mint,
      // Legacy mood values (backwards compat)
      ecstatic: colors.success,
      happy: colors.mint,
      neutral: colors.gray400,
      sad: colors.gray600,
    }),
    [],
  );

  // Format reason label for attention items
  const formatReasonLabel = useCallback((item: NeedsAttentionItem): string => {
    if (item.reason === 'todo_missing_due_date_stale') {
      return `No due date · ${item.ageInDays} days ago`;
    }
    if (item.reason === 'idea_stale') {
      return `Idea · ${item.ageInDays} days ago`;
    }
    if (item.reason === 'unorganized_stale') {
      return `Needs organizing · ${item.ageInDays} days ago`;
    }
    return `${item.ageInDays} days ago`;
  }, []);

  // Format journal date for display
  const formatJournalDate = useCallback((dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  // =========================================================================
  // Hub V1 Renderer (new design)
  // =========================================================================
  const renderHubV1 = () => {
    return (
      <SafeAreaView style={styles.safe} testID="hub-screen">
        {/* Ritual Progress Popover */}
        <RitualProgressPopover
          visible={showRitualProgress}
          onDismiss={() => setShowRitualProgress(false)}
          gremlyAge={gremlyAge}
          dropsCount={todayDropsCount}
          sweepsCount={todaySweepsCount}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={hubV1Styles.headerRow}>
            <Text style={[typeStyles.h1, { marginTop: spacing.sm }]}>Hub</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Age badge: mascot + age number - tappable for ritual progress */}
              <TouchableOpacity
                style={hubV1Styles.ageBadge}
                onPress={() => setShowRitualProgress(true)}
                activeOpacity={0.7}
                accessibilityLabel={`Gremly age ${gremlyAge}. Tap to see ritual progress.`}
                accessibilityRole="button"
              >
                <Image
                  source={require('../../assets/mascot/gremly-mascot.png')}
                  style={hubV1Styles.ageMascot}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <Text style={hubV1Styles.ageNumber}>{gremlyAge}</Text>
              </TouchableOpacity>
              {__DEV__ && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('DevTools')}
                  style={hubV1Styles.settingsButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  testID="hub-dev-tools-button"
                  accessibilityLabel="Dev Tools"
                  accessibilityRole="button"
                >
                  <Wrench size={24} color={colors.gray600} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleOpenNotificationSettings}
                style={hubV1Styles.settingsButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                testID="hub-settings-button"
                accessibilityLabel="Notification Settings"
                accessibilityRole="button"
              >
                <Settings size={24} color={colors.gray600} />
              </TouchableOpacity>
            </View>
          </View>

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

          {/* View Toggle: All Items | Journals | Calendar */}
          <View
            style={[
              hubV1Styles.viewToggleContainer,
              isSearchMode && hubV1Styles.viewToggleContainerCompact,
            ]}
            testID="hub-view-toggle"
          >
            {(['all', 'journals', 'calendar'] as const).map((mode) => {
              const isActive = hubView === mode;
              const label =
                mode === 'all' ? 'All Items' : mode === 'journals' ? 'Journals' : 'Calendar';
              const IconComponent =
                mode === 'all' ? LayoutGrid : mode === 'journals' ? BookOpen : Calendar;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    if (mode === hubView) return;
                    if (mode === 'journals') {
                      // Switching to Journal View: save current type selections
                      savedTypesRef.current = new Set(hubV1Types);
                      setHubV1Types(new Set(['note'])); // Lock to notes only
                    } else if (mode === 'calendar') {
                      // Reset calendar to today when switching to calendar view
                      setCalendarDate(getDateService().getCurrentDate());
                      // Also save type selections like journals
                      if (!savedTypesRef.current) {
                        savedTypesRef.current = new Set(hubV1Types);
                      }
                    } else {
                      // Switching to All Items: restore saved type selections
                      if (savedTypesRef.current) {
                        setHubV1Types(savedTypesRef.current);
                        savedTypesRef.current = null;
                      }
                    }
                    setHubView(mode);
                  }}
                  style={[hubV1Styles.viewToggleTab, isActive && hubV1Styles.viewToggleTabActive]}
                  testID={`hub-view-toggle-${mode}`}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <IconComponent
                    size={16}
                    color={isActive ? colors.deepTeal : colors.gray600}
                    style={{ marginRight: spacing.xs }}
                  />
                  <Text
                    style={[
                      hubV1Styles.viewToggleTabText,
                      isActive
                        ? hubV1Styles.viewToggleTabTextActive
                        : hubV1Styles.viewToggleTabTextInactive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Filter Controls - only shown in search mode for power users */}
          {isSearchMode && (
            <View style={hubV1Styles.filterContainer}>
              {/* Type Chips (multi-select) */}
              <View style={hubV1Styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[
                      hubV1Styles.filterChip,
                      hubV1Types.has('todo') && hubV1Styles.filterChipActive,
                      (hubView === 'journals' || hubView === 'calendar') &&
                        hubV1Styles.filterChipDisabled,
                    ]}
                    onPress={() => toggleTypeFilter('todo')}
                    disabled={hubView === 'journals' || hubView === 'calendar'}
                    testID="filter-type-todo"
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: hubV1Types.has('todo'),
                      disabled: hubView === 'journals' || hubView === 'calendar',
                    }}
                    accessibilityLabel="Filter by To-Dos"
                  >
                    <Text
                      style={[
                        hubV1Styles.filterChipText,
                        hubV1Types.has('todo') && hubV1Styles.filterChipTextActive,
                        (hubView === 'journals' || hubView === 'calendar') &&
                          hubV1Styles.filterChipTextDisabled,
                      ]}
                    >
                      To-Dos
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      hubV1Styles.filterChip,
                      hubV1Types.has('habit') && hubV1Styles.filterChipActive,
                      (hubView === 'journals' || hubView === 'calendar') &&
                        hubV1Styles.filterChipDisabled,
                    ]}
                    onPress={() => toggleTypeFilter('habit')}
                    disabled={hubView === 'journals' || hubView === 'calendar'}
                    testID="filter-type-habit"
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: hubV1Types.has('habit'),
                      disabled: hubView === 'journals' || hubView === 'calendar',
                    }}
                    accessibilityLabel="Filter by Habits"
                  >
                    <Text
                      style={[
                        hubV1Styles.filterChipText,
                        hubV1Types.has('habit') && hubV1Styles.filterChipTextActive,
                        (hubView === 'journals' || hubView === 'calendar') &&
                          hubV1Styles.filterChipTextDisabled,
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
                    disabled={hubView === 'journals' || hubView === 'calendar'}
                    testID="filter-type-note"
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: hubView === 'journals' || hubV1Types.has('note'),
                      disabled: hubView === 'journals' || hubView === 'calendar',
                    }}
                    accessibilityLabel={
                      hubView === 'journals' ? 'Filter by Journals' : 'Filter by Logs'
                    }
                  >
                    <Text
                      style={[
                        hubV1Styles.filterChipText,
                        hubView === 'journals'
                          ? hubV1Styles.filterChipTextActive
                          : hubV1Types.has('note') && hubV1Styles.filterChipTextActive,
                      ]}
                    >
                      {hubView === 'journals' ? 'Journals' : 'Notes'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      hubV1Styles.filterChip,
                      hubV1Types.has('space') && hubV1Styles.filterChipActive,
                      (hubView === 'journals' || hubView === 'calendar') &&
                        hubV1Styles.filterChipDisabled,
                    ]}
                    onPress={() => toggleTypeFilter('space')}
                    disabled={hubView === 'journals' || hubView === 'calendar'}
                    testID="filter-type-space"
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: hubV1Types.has('space'),
                      disabled: hubView === 'journals' || hubView === 'calendar',
                    }}
                    accessibilityLabel="Filter by Spaces"
                  >
                    <Text
                      style={[
                        hubV1Styles.filterChipText,
                        hubV1Types.has('space') && hubV1Styles.filterChipTextActive,
                        (hubView === 'journals' || hubView === 'calendar') &&
                          hubV1Styles.filterChipTextDisabled,
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
                  accessibilityRole="button"
                  accessibilityLabel={`Time filter: ${TIME_RANGE_LABELS[hubV1TimeRange]}. Tap to change.`}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Status filter: ${STATUS_LABELS[hubV1Status]}. Tap to change.`}
                >
                  <Text style={hubV1Styles.dropdownText}>{STATUS_LABELS[hubV1Status]}</Text>
                  <Text style={hubV1Styles.dropdownArrow}>▾</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Loading indicator */}
          {storeIsLoading && (
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
                <View style={hubV1Styles.noResultsContainer} testID="hub-no-results">
                  <View style={hubV1Styles.noResultsHeader}>
                    <Search size={18} color={colors.gray400} style={{ marginRight: spacing.xs }} />
                    <Text style={hubV1Styles.noResultsTitle}>No matches</Text>
                  </View>
                  <Text style={hubV1Styles.noResultsSubtitle}>
                    Try different keywords or check archived items
                  </Text>

                  {/* Popular Tags suggestions */}
                  {tagUsageData.visibleTags.length > 0 && (
                    <View style={hubV1Styles.tagSuggestionsContainer}>
                      <Text style={hubV1Styles.tagSuggestionsLabel}>Try a tag</Text>
                      <View style={hubV1Styles.tagSuggestionsRow}>
                        {tagUsageData.visibleTags.map(([tagName]) => (
                          <TouchableOpacity
                            key={tagName}
                            style={hubV1Styles.tagSuggestionChip}
                            onPress={() => setSearch(`#${tagName}`)}
                            testID={`tag-suggestion-${tagName}`}
                          >
                            <Text style={hubV1Styles.tagSuggestionText}>#{tagName}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    style={hubV1Styles.archivedRow}
                    onPress={() => navigation.navigate('ArchivedItems', { searchQuery: search })}
                    testID="no-results-archived-link"
                  >
                    <View style={hubV1Styles.archivedRowContent}>
                      <Archive size={16} color={colors.gray600} />
                      <Text style={hubV1Styles.archivedRowText}>Check archived items</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            // =================================================================
            // HUB MODE (idle state)
            // =================================================================
            <View style={hubV1Styles.hubModeContainer}>
              {hubView === 'calendar' ? (
                // ===============================================================
                // CALENDAR VIEW: WeekStrip + CalendarDayView
                // ===============================================================
                <View style={{ flex: 1, marginHorizontal: -spacing.md }}>
                  <WeekStrip selectedDate={calendarDate} onSelectDate={setCalendarDate} />
                  <CalendarDayView
                    selectedDate={calendarDate}
                    onItemPress={(item: CalendarItem) => {
                      // Open overlay based on item type
                      if (item.type === 'todo') {
                        overlayController.openEdit({ record: item.raw as Todo });
                      } else if (item.type === 'habit') {
                        overlayController.openEdit({ record: item.raw as Habit });
                      } else if (item.type === 'journal') {
                        overlayController.openEdit({ record: item.raw as Note });
                      }
                    }}
                  />
                </View>
              ) : hubView === 'journals' ? (
                // ===============================================================
                // JOURNAL VIEW: Timeline grouped by month
                // ===============================================================
                journalEntries.length === 0 ? (
                  <View style={hubV1Styles.journalViewEmpty} testID="journal-view-empty">
                    <View style={hubV1Styles.journalViewEmptyHeader}>
                      <BookOpen
                        size={18}
                        color={colors.gray400}
                        style={{ marginRight: spacing.xs }}
                      />
                      <Text style={hubV1Styles.journalViewEmptyTitle}>No journals yet</Text>
                    </View>
                    <Text style={hubV1Styles.journalViewEmptyHint}>
                      Drop a thought to start journaling
                    </Text>
                  </View>
                ) : (
                  <View style={hubV1Styles.journalViewContainer} testID="journal-view-timeline">
                    {/* Analyze CTA Card */}
                    <TouchableOpacity
                      style={hubV1Styles.analyzeCta}
                      onPress={async () => {
                        setAnalyzeModalVisible(true);
                        setAnalyzeLoading(true);
                        setAnalyzeJournalCount(0);

                        try {
                          // Filter journals from last 30 days from store
                          const queryOpts = computeLast30DaysRange();
                          const journals = storeJournals.filter((j) => {
                            if (!queryOpts.createdAfter) return true;
                            return (j.created_at ?? '') >= queryOpts.createdAfter;
                          });
                          // Sort oldest to newest for analysis
                          const sortedJournals = [...journals].sort((a, b) => {
                            const dateA = a.created_at || '';
                            const dateB = b.created_at || '';
                            return dateA.localeCompare(dateB);
                          });
                          setAnalyzeJournalCount(sortedJournals.length);
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

                    {groupedJournals.map((group) => (
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
                                  handleOpenEdit(record);
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
                                      backgroundColor:
                                        moodColors[
                                          Array.isArray(journal.mood)
                                            ? journal.mood[0]
                                            : journal.mood
                                        ] || colors.gray400,
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
                )
              ) : (
                // ===============================================================
                // ALL ITEMS VIEW: Table with filters
                // ===============================================================
                <View style={{ flex: 1, marginHorizontal: -spacing.md }}>
                  <AllItemsTable
                    onItemPress={(item) => {
                      // Open overlay based on item type
                      if (item.type === 'todo') {
                        overlayController.openEdit({ record: item as Todo });
                      } else if (item.type === 'habit') {
                        overlayController.openEdit({ record: item as Habit });
                      } else if (item.type === 'note') {
                        overlayController.openEdit({ record: item as Note });
                      }
                    }}
                  />
                </View>
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
                accessibilityLabel="Close journal insights"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
                  // Store is always up-to-date, no reload needed
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
            {tab === 'People' && discoveredPeople.length === 0 && !loading && !error && (
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
  // Header row with settings button
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsButton: {
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  ageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: spacing.sm,
  },
  ageMascot: {
    width: 28,
    height: 28,
  },
  ageNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  // View Toggle (All Items | Journal View)
  viewToggleContainer: {
    flexDirection: 'row',
    marginTop: spacing['2xl'], // Increased spacing from search for Hub Mode
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    padding: spacing.xs,
  },
  viewToggleContainerCompact: {
    marginTop: spacing.lg, // Tighter spacing when filters are shown (search mode)
  },
  viewToggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  viewToggleTabActive: {
    backgroundColor: colors.white,
  },
  viewToggleTabText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  viewToggleTabTextActive: {
    color: colors.deepTeal,
    fontWeight: '600',
  },
  viewToggleTabTextInactive: {
    color: colors.gray600,
  },
  hubModeContainer: {
    marginTop: spacing['2xl'], // Increased breathing room in Hub Mode
  },
  searchModeContainer: {
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing['2xl'],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray600,
    marginBottom: spacing.md,
    letterSpacing: 0.2,
  },
  sectionTitleSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray400,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  archivedRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    paddingHorizontal: spacing.lg,
  },
  noResultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  noResultsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray600,
  },
  noResultsSubtitle: {
    fontSize: 13,
    color: colors.gray400,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  // Filter controls
  filterContainer: {
    marginTop: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray600,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  filterChipDisabled: {
    backgroundColor: colors.gray100,
    borderColor: colors.gray100,
  },
  filterChipTextDisabled: {
    color: colors.gray400,
    fontStyle: 'italic',
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
    borderColor: colors.gray100,
  },
  dropdownText: {
    fontSize: 14,
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
    marginLeft: spacing.xs,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.gray400,
  },
  // Attention row (needs attention items)
  attentionRow: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.gray200,
  },
  attentionContent: {
    flex: 1,
  },
  attentionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    marginBottom: 2,
  },
  attentionReason: {
    fontSize: 12,
    color: colors.gray400,
  },
  // Tag suggestions (search no-results state) - de-emphasized styling
  tagSuggestionsContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  tagSuggestionsLabel: {
    fontSize: 12,
    color: colors.gray400,
    marginBottom: spacing.xs,
  },
  tagSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tagSuggestionChip: {
    backgroundColor: colors.gray100,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  tagSuggestionText: {
    fontSize: 12,
    color: colors.gray600,
  },
  // Journal View Timeline styles
  journalViewContainer: {
    marginTop: spacing.md,
  },
  journalViewEmpty: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  journalViewEmptyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  journalViewEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray600,
  },
  journalViewEmptyHint: {
    fontSize: 13,
    color: colors.gray400,
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
