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
  Users,
  Calendar,
  Lightbulb,
  Archive,
  Search,
  Settings,
  Wrench,
  Clock,
  TrendingUp,
  CalendarDays,
  ChevronLeft,
} from 'lucide-react-native';

import { useAuth } from '../../providers/AuthProvider';
import SegmentedTabs from '../../components/SegmentedTabs';
import ScopeSelector, { type ScopeOption } from '../../components/ScopeSelector';
import HubItemCard, { type HubItem } from '../../components/HubItemCard';
import { AllItemsTable } from '../../components/hub';
import TimelineView from '../../components/hub/TimelineView';
import PeopleView from '../../components/hub/PeopleView';
import WeeklySummaryBanner from '../../components/WeeklySummaryBanner';
import { getDateService } from '../../lib/date';
import { format } from 'date-fns';
import UnsortedReviewSheet, { type UnsortedItem } from '../../components/UnsortedReviewSheet';
import PeopleList, { type PersonWithCounts } from '../../components/people/PeopleList';
import { colors, radii, spacing } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';
import { BRAND } from '../../design/brand';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useJournalAnalysis } from '../../hooks/useJournalAnalysis';
import type { JournalAnalyzeEntry } from '../../lib/cortex/CortexClient';
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
  usePastSummaries,
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
type HubV1View = 'timeline' | 'journals' | 'people' | 'weekly';

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

  const ds = getDateService();
  const today = ds.today();
  let startDate: string;

  switch (range) {
    case 'week':
      startDate = ds.addDays(today, -7);
      break;
    case 'month':
      startDate = ds.addDays(today, -30);
      break;
    case '3months':
      startDate = ds.addDays(today, -90);
      break;
    default:
      return {};
  }

  return {
    createdAfter: startDate + 'T00:00:00.000Z',
  };
}

// Helper to condense long text into short titles
export function suggestShortTitle(text: string, maxWords = 5): string {
  if (!text) return 'Untitled';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  return words.slice(0, maxWords).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Summary List View (Hub "Weekly" tab)
// ─────────────────────────────────────────────────────────────────────────────

interface WeeklySummaryListViewProps {
  onSummaryPress: (weekStartDate: string) => void;
}

function formatSummaryDateRange(startDate: string, endDate: string): string {
  try {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const startStr = format(start, 'MMM d');
    const endStr = format(end, 'MMM d, yyyy');
    return `${startStr} – ${endStr}`;
  } catch {
    return `${startDate} – ${endDate}`;
  }
}

function WeeklySummaryListView({ onSummaryPress }: WeeklySummaryListViewProps) {
  const summaries = usePastSummaries();

  if (summaries.length === 0) {
    return (
      <View style={hubV1Styles.journalViewEmpty} testID="weekly-view-empty">
        <View style={hubV1Styles.journalViewEmptyHeader}>
          <CalendarDays size={18} color={colors.gray400} style={{ marginRight: spacing.xs }} />
          <Text style={hubV1Styles.journalViewEmptyTitle}>No weekly summaries yet</Text>
        </View>
        <Text style={hubV1Styles.journalViewEmptyHint}>
          Your first summary will appear here on Sunday evening.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.md }}>
      {summaries.map((summary) => {
        const todosCompleted = (summary.stats_snapshot?.todosCompleted as number) ?? 0;
        const insightCount = (summary.content?.insights ?? []).length;
        const commentary = summary.content?.weeklyCommentary ?? '';
        const firstSentence = commentary.split('.')[0];

        return (
          <TouchableOpacity
            key={summary.id}
            onPress={() => onSummaryPress(summary.week_start_date)}
            style={weeklySummaryListStyles.row}
            activeOpacity={0.6}
          >
            {/* Unviewed indicator */}
            {!summary.viewed ? (
              <View style={weeklySummaryListStyles.unviewedDot} />
            ) : (
              <View style={weeklySummaryListStyles.dotSpacer} />
            )}

            {/* Content */}
            <View style={{ flex: 1 }}>
              <View style={weeklySummaryListStyles.dateRow}>
                <Text style={weeklySummaryListStyles.dateRange}>
                  {formatSummaryDateRange(summary.week_start_date, summary.week_end_date)}
                </Text>
                <Text style={weeklySummaryListStyles.statBadge}>
                  {todosCompleted} tasks · {insightCount} insights
                </Text>
              </View>
              {firstSentence ? (
                <Text style={weeklySummaryListStyles.commentary} numberOfLines={1}>
                  {firstSentence}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const weeklySummaryListStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
  },
  unviewedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BFD8C0',
    marginRight: 10,
  },
  dotSpacer: {
    width: 8,
    marginRight: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRange: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
    color: colors.ink,
    flexShrink: 1,
  },
  statBadge: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: colors.gray400,
    marginLeft: 8,
  },
  commentary: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: colors.gray600,
    marginTop: 2,
  },
});

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

  // ═══════════════════════════════════════════════════════════════════
  // UI STATE (local to this screen)
  // ═══════════════════════════════════════════════════════════════════
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
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
  const [hubV1TimeRange, setHubV1TimeRange] = useState<HubV1TimeRange>('all');
  const [hubV1Status, setHubV1Status] = useState<HubV1StatusFilter>('active');
  const [hubView, setHubView] = useState<HubV1View>('timeline');
  // Save previous type selections when switching to Journal View
  const savedTypesRef = useRef<Set<HubV1TypeFilter> | null>(null);
  // Analyze journals modal state
  const [analyzeModalVisible, setAnalyzeModalVisible] = useState(false);
  const [analyzeJournalCount, setAnalyzeJournalCount] = useState(0);

  // Journal analysis hook (caches result, enforces 7-day cooldown)
  const journalAnalysis = useJournalAnalysis();

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
      created_at: getDateService().today() + 'T00:00:00.000Z',
      updated_at: getDateService().today() + 'T00:00:00.000Z',
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
      const dateFormatted = date
        ? getDateService().formatDateForDisplay(
            getDateService().extractLocalDate(date) ?? date.split('T')[0],
          )
        : undefined;

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

  const handleSearchItemPress = useCallback(
    (item: HubItem) => {
      const record = hubV1Items.find((r) => r.id === item.id);
      if (record) {
        overlayController.openEdit({ record });
      }
    },
    [hubV1Items, overlayController],
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

  const searchFilterCounts = useMemo(() => {
    let todoCount = 0;
    let habitCount = 0;
    let noteCount = 0;
    for (const item of hubV1Items) {
      if (item.type === 'todo') todoCount++;
      else if (item.type === 'habit') habitCount++;
      else if (item.type === 'note') noteCount++;
    }
    return { todos: todoCount, habits: habitCount, notes: noteCount };
  }, [hubV1Items]);

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
    const today = getDateService().today(); // YYYY-MM-DD (local timezone)
    return selectNeedsAttentionItems(todos, notes, {
      nowIso: getDateService().today() + 'T12:00:00.000Z',
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
    const ds = getDateService();
    const today = ds.today();
    const itemDate = ds.extractLocalDate(dateStr) ?? dateStr.split('T')[0];

    if (itemDate === today) return 'Today';
    if (itemDate === ds.addDays(today, -1)) return 'Yesterday';

    // For dates within the last week, show weekday name
    const sevenDaysAgo = ds.addDays(today, -7);
    if (itemDate > sevenDaysAgo) {
      // Parse at noon to avoid timezone shifts
      const d = ds.fromLocalDate(itemDate) ?? new Date(itemDate + 'T12:00:00');
      return format(d, 'EEE');
    }

    // Older dates: "Jan 5" format
    const d = ds.fromLocalDate(itemDate) ?? new Date(itemDate + 'T12:00:00');
    return format(d, 'MMM d');
  }, []);

  // =========================================================================
  // Hub V1 Renderer (new design)
  // =========================================================================
  const renderHubV1 = () => {
    return (
      <SafeAreaView style={styles.safe} testID="hub-screen">
        {/* Help Card (replaces standalone ritual popup) */}
        <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="hub" />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={hubV1Styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Go back"
                accessibilityRole="button"
              >
                <ChevronLeft size={28} color={BRAND.colors.mossGreen} />
              </TouchableOpacity>
              <Text style={[typeStyles.h1, { marginTop: spacing.sm }]}>Hub</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
              {/* Gremly mascot - tappable for help & ritual progress */}
              <TouchableOpacity
                onPress={() => setShowHelp(true)}
                activeOpacity={0.7}
                accessibilityLabel="Gremly. Tap to see help and ritual progress."
                accessibilityRole="button"
              >
                <Image
                  source={require('../../assets/mascot/safari_gremly.png')}
                  style={hubV1Styles.headerMascot}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
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

          {/* View Toggle: Timeline | Journals | People */}
          <View
            style={[
              hubV1Styles.viewToggleContainer,
              isSearchMode && hubV1Styles.viewToggleContainerCompact,
            ]}
            testID="hub-view-toggle"
          >
            {(['timeline', 'journals', 'people', 'weekly'] as const).map((mode) => {
              const isActive = hubView === mode;
              const label =
                mode === 'timeline'
                  ? 'Timeline'
                  : mode === 'journals'
                    ? 'Journals'
                    : mode === 'people'
                      ? 'People'
                      : 'Weekly';
              const IconComponent =
                mode === 'timeline'
                  ? LayoutGrid
                  : mode === 'journals'
                    ? BookOpen
                    : mode === 'people'
                      ? Users
                      : CalendarDays;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    if (mode === hubView) return;
                    if (mode === 'journals') {
                      // Switching to Journal View: save current type selections
                      savedTypesRef.current = new Set(hubV1Types);
                      setHubV1Types(new Set(['note'])); // Lock to notes only
                    } else if (mode === 'weekly') {
                      // Switching to Weekly View: save current type selections
                      if (!savedTypesRef.current) {
                        savedTypesRef.current = new Set(hubV1Types);
                      }
                    } else {
                      // Switching to Timeline or People: restore saved type selections
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

          {/* Filter Pills - search mode (TimelineView style) */}
          {isSearchMode && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  {
                    key: 'todo' as HubV1TypeFilter,
                    label: 'Todos',
                    count: searchFilterCounts.todos,
                  },
                  {
                    key: 'habit' as HubV1TypeFilter,
                    label: 'Habits',
                    count: searchFilterCounts.habits,
                  },
                  {
                    key: 'note' as HubV1TypeFilter,
                    label: 'Notes',
                    count: searchFilterCounts.notes,
                  },
                ].map((f) => {
                  const isActive = hubV1Types.has(f.key);
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: isActive ? '#2E5540' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#BFD8C0',
                        gap: 4,
                      }}
                      onPress={() => toggleTypeFilter(f.key)}
                      disabled={hubView === 'journals' || hubView === 'weekly'}
                      testID={`filter-type-${f.key}`}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: isActive ? '#FFFFFF' : '#768879',
                        }}
                      >
                        {f.label}
                      </Text>
                      {f.count > 0 && !isActive && (
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#999999' }}>
                          {f.count}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
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
                  {searchResults.map((item) => {
                    // Derive dot color and type label from the underlying record
                    const record = hubV1Items.find((r) => r.id === item.id);
                    const itemType = record?.type ?? item.kind;
                    const subtype = record?.type === 'note' ? (record as Note).subtype : undefined;
                    const dotColor =
                      itemType === 'todo'
                        ? '#2E5540'
                        : itemType === 'habit'
                          ? '#9CA6E0'
                          : subtype === 'journal'
                            ? '#E0C47A'
                            : subtype === 'idea'
                              ? '#9CA6E0'
                              : '#768879';
                    const typeLabel =
                      itemType === 'todo'
                        ? 'To-Do'
                        : itemType === 'habit'
                          ? 'Habit'
                          : subtype === 'journal'
                            ? 'Journal'
                            : subtype === 'idea'
                              ? 'Idea'
                              : subtype === 'event'
                                ? 'Event'
                                : 'Note';
                    const chipBg =
                      itemType === 'todo'
                        ? '#2E554015'
                        : itemType === 'habit'
                          ? '#9CA6E020'
                          : '#E0C47A25';
                    const chipTextColor =
                      itemType === 'todo'
                        ? '#2E5540'
                        : itemType === 'habit'
                          ? '#6B74B8'
                          : '#B8860B';

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          backgroundColor: '#FFFFFF',
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: '#F3F3F3',
                        }}
                        onPress={() => handleSearchItemPress(item)}
                        activeOpacity={0.6}
                        testID={`search-result-${item.id}`}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            marginTop: 6,
                            marginRight: 10,
                            backgroundColor: dotColor,
                          }}
                        />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontSize: 15,
                                fontWeight: '500',
                                color: '#222222',
                              }}
                            >
                              {item.title}
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: chipBg,
                              }}
                            >
                              <Text
                                style={{ fontSize: 11, fontWeight: '600', color: chipTextColor }}
                              >
                                {typeLabel}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
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
              {hubView === 'weekly' ? (
                // ===============================================================
                // WEEKLY SUMMARY LIST VIEW
                // ===============================================================
                <WeeklySummaryListView
                  onSummaryPress={(weekStartDate: string) => {
                    navigation.navigate('WeeklySummary', { weekStartDate });
                  }}
                />
              ) : hubView === 'people' ? (
                // ===============================================================
                // PEOPLE VIEW: Browse by person
                // ===============================================================
                <View style={{ flex: 1, marginHorizontal: -spacing.md }}>
                  <PeopleView
                    onItemPress={(item) => {
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
              ) : hubView === 'journals' ? (
                // ===============================================================
                // JOURNAL VIEW: Timeline grouped by month (unchanged)
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
                      style={[
                        hubV1Styles.analyzeCta,
                        journalAnalysis.onCooldown && !journalAnalysis.analysis && { opacity: 0.5 },
                      ]}
                      onPress={async () => {
                        // If we have a cached result, show it immediately
                        if (journalAnalysis.analysis) {
                          setAnalyzeModalVisible(true);
                          setAnalyzeJournalCount(journalAnalysis.entryCount);
                          return;
                        }

                        // If on cooldown with no cached result, do nothing
                        if (journalAnalysis.onCooldown) return;

                        // Run fresh analysis
                        setAnalyzeModalVisible(true);

                        // Prepare entries from store
                        const queryOpts = computeLast30DaysRange();
                        const journals = storeJournals.filter((j) => {
                          if (!queryOpts.createdAfter) return true;
                          return (j.created_at ?? '') >= queryOpts.createdAfter;
                        });

                        const entries: JournalAnalyzeEntry[] = journals.map((j) => ({
                          date: j.date || j.created_at?.split('T')[0] || '',
                          body: j.body || '',
                          mood: j.mood || null,
                        }));

                        setAnalyzeJournalCount(entries.length);

                        // Get timezone
                        const tz = Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone || 'UTC';
                        await journalAnalysis.analyze(entries, tz);
                      }}
                      activeOpacity={0.8}
                      disabled={journalAnalysis.onCooldown && !journalAnalysis.analysis}
                      testID="journal-analyze-cta"
                    >
                      <BarChart3
                        size={20}
                        color={colors.deepTeal}
                        style={{ marginRight: spacing.sm }}
                      />
                      <Text style={hubV1Styles.analyzeCtaText}>
                        {journalAnalysis.analysis
                          ? 'View Journal Insights'
                          : 'Analyze last 30 days'}
                      </Text>
                    </TouchableOpacity>

                    {/* Cooldown note */}
                    {journalAnalysis.onCooldown && journalAnalysis.nextAvailableLabel && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.gray400,
                          textAlign: 'center',
                          marginTop: -spacing.sm,
                          marginBottom: spacing.md,
                        }}
                      >
                        Next analysis {journalAnalysis.nextAvailableLabel.replace('Available ', '')}
                      </Text>
                    )}

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
                // TIMELINE VIEW (default): Date-grouped reverse-chronological feed
                // ===============================================================
                <View style={{ flex: 1, marginHorizontal: -spacing.md }}>
                  <TimelineView
                    onItemPress={(item) => {
                      if (item.type === 'todo') {
                        overlayController.openEdit({ record: item as Todo });
                      } else if (item.type === 'habit') {
                        overlayController.openEdit({ record: item as Habit });
                      } else if (item.type === 'note') {
                        overlayController.openEdit({ record: item as Note });
                      }
                    }}
                    onSpacePress={(spaceId) => navigation.navigate('SpaceHome', { spaceId })}
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
              {journalAnalysis.loading ? (
                <View style={hubV1Styles.analyzeLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.deepTeal} />
                  <Text style={hubV1Styles.analyzeLoadingText}>
                    Analyzing {analyzeJournalCount} journal
                    {analyzeJournalCount !== 1 ? ' entries' : ' entry'}...
                  </Text>
                </View>
              ) : journalAnalysis.error ? (
                <View style={hubV1Styles.analyzeLoadingContainer}>
                  <Text style={[hubV1Styles.analyzeLoadingText, { color: colors.gray600 }]}>
                    {journalAnalysis.error}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAnalyzeModalVisible(false)}
                    style={{ marginTop: spacing.md }}
                  >
                    <Text style={{ color: colors.deepTeal, fontWeight: '600' }}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : journalAnalysis.analysis ? (
                <>
                  {/* Journal count summary */}
                  <Text style={hubV1Styles.analyzeJournalCount} testID="analyze-journal-count">
                    Based on {journalAnalysis.entryCount} journal
                    {journalAnalysis.entryCount !== 1 ? ' entries' : ' entry'}
                  </Text>

                  {/* ─── Themes Section ─── */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <Sparkles size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>Themes</Text>
                    </View>
                    {journalAnalysis.analysis.themes.map((theme, i) => (
                      <View key={i} style={analysisStyles.card}>
                        <View style={analysisStyles.cardHeader}>
                          <Text style={analysisStyles.cardLabel}>{theme.label}</Text>
                          <Text style={analysisStyles.cardCount}>
                            {theme.count} {theme.count === 1 ? 'entry' : 'entries'}
                          </Text>
                        </View>
                        <Text style={analysisStyles.cardDescription}>{theme.description}</Text>
                      </View>
                    ))}
                  </View>

                  {/* ─── Patterns Section ─── */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <TrendingUp size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>Patterns</Text>
                    </View>
                    {journalAnalysis.analysis.patterns.map((pattern, i) => (
                      <View key={i} style={analysisStyles.card}>
                        <View style={analysisStyles.cardHeader}>
                          <Text style={analysisStyles.cardLabel}>{pattern.label}</Text>
                          <View
                            style={[
                              analysisStyles.sentimentChip,
                              pattern.sentiment === 'positive' && { backgroundColor: '#E8F5E9' },
                              pattern.sentiment === 'watch' && { backgroundColor: '#FFF3E0' },
                              pattern.sentiment === 'neutral' && {
                                backgroundColor: colors.gray100,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                analysisStyles.sentimentText,
                                pattern.sentiment === 'positive' && { color: '#2E7D32' },
                                pattern.sentiment === 'watch' && { color: '#E65100' },
                                pattern.sentiment === 'neutral' && { color: colors.gray600 },
                              ]}
                            >
                              {pattern.sentiment === 'watch' ? '👀 watch' : pattern.sentiment}
                            </Text>
                          </View>
                        </View>
                        <Text style={analysisStyles.cardDescription}>{pattern.description}</Text>
                      </View>
                    ))}
                  </View>

                  {/* ─── When You Journal Section ─── */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <Clock size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>When you journal</Text>
                    </View>
                    <View style={analysisStyles.card}>
                      <View style={analysisStyles.habitsGrid}>
                        <View style={analysisStyles.habitsStat}>
                          <Text style={analysisStyles.habitsStatLabel}>Frequency</Text>
                          <Text style={analysisStyles.habitsStatValue}>
                            {journalAnalysis.analysis.journaling_habits.frequency}
                          </Text>
                        </View>
                        <View style={analysisStyles.habitsStat}>
                          <Text style={analysisStyles.habitsStatLabel}>Time of day</Text>
                          <Text style={analysisStyles.habitsStatValue}>
                            {journalAnalysis.analysis.journaling_habits.preferred_time}
                          </Text>
                        </View>
                        <View style={analysisStyles.habitsStat}>
                          <Text style={analysisStyles.habitsStatLabel}>Entry length</Text>
                          <Text style={analysisStyles.habitsStatValue}>
                            {journalAnalysis.analysis.journaling_habits.avg_length}
                          </Text>
                        </View>
                      </View>
                      <Text style={[analysisStyles.cardDescription, { marginTop: spacing.sm }]}>
                        {journalAnalysis.analysis.journaling_habits.observation}
                      </Text>
                    </View>
                  </View>

                  {/* ─── Gentle Suggestion Section ─── */}
                  <View style={hubV1Styles.analyzeSection}>
                    <View style={hubV1Styles.analyzeSectionHeader}>
                      <Lightbulb size={18} color={colors.deepTeal} />
                      <Text style={hubV1Styles.analyzeSectionTitle}>Gentle suggestion</Text>
                    </View>
                    <View style={[analysisStyles.card, analysisStyles.suggestionCard]}>
                      <Text style={analysisStyles.suggestionText}>
                        {journalAnalysis.analysis.suggestion.text}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
            </ScrollView>

            {/* Footer with disclaimer */}
            <View style={hubV1Styles.analyzeModalFooter}>
              <Text style={hubV1Styles.analyzeModalDisclaimer}>
                This is a reflection based on what you've shared. Take what resonates.
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

            {/* Weekly Summary Banner */}
            <WeeklySummaryBanner />

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
  headerMascot: {
    width: 84,
    height: 84,
  },
  // View Toggle (All Items | Journal View)
  viewToggleContainer: {
    flexDirection: 'row',
    marginTop: spacing.md, // Tightened spacing from search for Hub Mode
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    padding: spacing.xs,
  },
  viewToggleContainerCompact: {
    marginTop: spacing.sm, // Tighter spacing when filters are shown (search mode)
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
    marginTop: spacing.md, // Tightened breathing room in Hub Mode
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

const analysisStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    flex: 1,
  },
  cardCount: {
    fontSize: 12,
    color: colors.gray400,
    fontWeight: '500',
  },
  cardDescription: {
    fontSize: 14,
    color: colors.gray600,
    lineHeight: 20,
  },
  sentimentChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sentimentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  habitsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  habitsStat: {
    flex: 1,
  },
  habitsStatLabel: {
    fontSize: 11,
    color: colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  habitsStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  suggestionCard: {
    backgroundColor: `${colors.deepTeal}08`,
    borderColor: `${colors.deepTeal}20`,
  },
  suggestionText: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
    fontStyle: 'italic',
  },
});
