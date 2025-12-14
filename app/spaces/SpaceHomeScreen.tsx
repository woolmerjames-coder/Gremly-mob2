/**
 * SpaceHomeScreen - Space v3 layout
 * Header + context + summary + upcoming + progress + tabs (compact)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import * as Haptics from 'expo-haptics';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Text,
  TextInput,
  Animated,
  Easing,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  useColorScheme,
  BackHandler,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useRepo } from '../../providers/RepoProvider';
import { SupabaseSpaceChatRepo, SupabaseSpaceChatMessageRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { Space, SpaceChat, AppRecord, RecordType } from '../../lib/types';
import { lightTokens, darkTokens } from '../../design/tokens';
import {
  listHabitsForSpace,
  listTodosForSpace,
  listNotesForSpace,
  countJournalForSpace,
} from '../../lib/selectors/spaceSelectors';
import { startOfWeek, formatISO, addDays } from 'date-fns';

// Components
import { SpaceBanner } from '../../components/spaces/SpaceBanner';
import { ChatCard } from '../../components/spaces/ChatCard';
import { WhatWeDiscussedCard } from '../../components/spaces/WhatWeDiscussedCard';
import { useAuth } from '../../providers/AuthProvider';
import { useSpaceAggregate } from '../../hooks/useSpaceAggregate';
import { summarizeChatForCard } from '../../lib/ai/chatSummaries';
// v4 components (FocusCard, CalendarStrip, QuickStatsRow, ChatCTA) removed in Phase 5
import HeaderV22 from '../../components/spaces/v22/Header';
import TimelineOverlay from '../../components/spaces/v22/Overlays/TimelineOverlay';
import NotepadOverlay from '../../components/spaces/v22/Overlays/NotepadOverlay';
import PeopleOverlay from '../../components/spaces/v22/Overlays/PeopleOverlay';
import { COLORS as V22 } from '../../components/spaces/v22/_tokens';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import ThreadCard from '../../components/spaces/v22/ThreadCard';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiBurst from '../../components/ConfettiBurst';
import {
  Search as SearchIcon,
  Settings as SettingsIcon,
  MessageSquare,
  Plus,
  MoreVertical,
} from '../../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useSpaceTimeline from '../../hooks/useSpaceTimeline';
import { useSpaceNotes } from '../../hooks/useSpaceNotes';
// v33 components (Space v3.3)
import HeaderV33 from '../../components/spaces/v33/Header';
import NotepadOverlayV33 from '../../components/spaces/v33/Overlays/NotepadOverlay';
// Phase 12: MilestoneHeader and supporting hooks
import { MilestoneHeader } from '../../components/spaces/MilestoneHeader';
import { useSpaceMilestone } from '../../hooks/useSpaceMilestone';
import { usePinnedCount } from '../../hooks/usePinnedCount';
import UnifiedAddOverlay from '../../components/spaces/v33/Overlays/UnifiedAddOverlay';
import RenameChatModal from '../../components/spaces/v33/Overlays/RenameChatModal';
import { SpaceChatListModal } from '../../components/chat/SpaceChatListModal';
import { getWittyLine, type Mood } from '../../lib/ai/moodLines';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import type { CanonicalType } from '../../lib/cortex/canonicalMap';
import { BRAND } from '../../design/brand';
import { stripMarkdown } from '../../lib/markdown/stripMarkdown';
import { getRelativeTime } from '../../lib/utils/getRelativeTime';
// Phase 6: Space quick add imports
import { SpaceQuickAddModal } from '../../components/spaces/SpaceQuickAddModal';
import { AttachExistingModal } from '../../components/spaces/AttachExistingModal';
import { useSpaceQuickAdd } from '../../lib/spaces/useSpaceQuickAdd';
// Shared components for unified styling
import {
  SegmentedPills,
  AddToSpacePill,
  EntityCard,
  type EntityType,
} from '../../components/shared';
// Phase 4: Content sections (aliased to avoid conflict with local legacy sections)
import {
  TodoSection as TodoSectionV2,
  HabitsSection as HabitsSectionV2,
  GuidesLogsSection,
} from '../../components/spaces/sections';
import { SectionDivider } from '../../components/spaces/sections/SectionDivider';
import { PinnedItemsModal } from '../../components/spaces/PinnedItemsModal';
import { EmptySpaceState } from '../../components/spaces/EmptySpaceState';
import { MilestoneEntryModal } from '../../components/spaces/MilestoneEntryModal';
import { SpaceSettingsModal } from '../../components/spaces/SpaceSettingsModal';
import { CompletedInSpaceOverlay } from '../../components/spaces/CompletedInSpaceOverlay';

type Props = NativeStackScreenProps<RootStackParamList, 'SpaceHome'>;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

/** Consistent horizontal padding for content alignment (selectors, cards) */
const CONTENT_HORIZONTAL_PAD = 16;

// ============================================================================
// FILTER BAR TYPES & COMPONENTS
// ============================================================================

type FilterTab = 'all' | 'todos' | 'habits' | 'logs' | 'lists';

const FILTER_OPTIONS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todos', label: 'Todos' },
  { key: 'habits', label: 'Habits' },
  { key: 'logs', label: 'Logs' },
  { key: 'lists', label: 'Lists' },
];

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

/** Helper to format relative date */
function formatRelativeDate(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

/** Helper to format due date for todos */
function formatDueDate(dueDate?: string | null): string {
  if (!dueDate) return 'No due date';
  try {
    const date = new Date(dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due ${date.toLocaleDateString()}`;
  } catch {
    return 'No due date';
  }
}

/** Section "X more" footer style */
const sectionMoreFooterStyle = {
  paddingVertical: 10,
  paddingHorizontal: 16,
  alignItems: 'center' as const,
};
const sectionMoreTextStyle = {
  fontSize: 12,
  color: BRAND.colors.inkSubtle,
};

/** Todos Section - shows incomplete todos for this space (max 5, sorted by most recent) */
function TodosSection({
  items,
  spaceId,
  onItemPress,
  onToggleComplete,
  testID,
}: {
  items: AppRecord[];
  spaceId: string;
  onItemPress: (item: AppRecord) => void;
  onToggleComplete: (item: AppRecord) => void;
  testID?: string;
}) {
  const allTodos = React.useMemo(() => {
    const incomplete = listTodosForSpace(items, spaceId).filter((t: any) => !t.completed_at);
    // Sort by most recently updated
    return [...incomplete].sort((a: any, b: any) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [items, spaceId]);

  const displayTodos = allTodos.slice(0, 5);
  const moreCount = allTodos.length - 5;

  if (allTodos.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <View style={sectionStyles.itemsList}>
        {displayTodos.map((todo: any, index: number) => (
          <EntityCard
            key={todo.id}
            record={todo}
            type="todo"
            onPress={() => onItemPress(todo)}
            onToggleComplete={() => onToggleComplete(todo)}
            showCheckbox={true}
            showTypePill={true}
            isFirst={index === 0}
            completed={!!todo.completed_at}
            testID={`${testID}-item-${todo.id}`}
          />
        ))}
      </View>
      {moreCount > 0 && (
        <Pressable
          style={sectionMoreFooterStyle}
          onPress={() => {
            // TODO: Wire to full list view or search
            console.log('[TodosSection] + X more pressed');
          }}
          testID={`${testID}-more`}
        >
          <Text style={sectionMoreTextStyle}>+ {moreCount} more in this space</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Habits Section - shows habits with weekly progress (max 5, sorted by most recent) */
/** Habits Section - shows habits with weekly progress (max 5, sorted by most recent) */
function HabitsSection({
  items,
  spaceId,
  weekly,
  onItemPress,
  onLogProgress,
  testID,
}: {
  items: AppRecord[];
  spaceId: string;
  weekly?: { habits: Array<{ id: string; doneCount: number; target: number }> };
  onItemPress: (item: AppRecord) => void;
  onLogProgress: (item: AppRecord) => void;
  testID?: string;
}) {
  const allHabits = React.useMemo(() => {
    const habits = listHabitsForSpace(items, spaceId);
    // Sort by most recently updated
    return [...habits].sort((a: any, b: any) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [items, spaceId]);

  const displayHabits = allHabits.slice(0, 5);
  const moreCount = allHabits.length - 5;

  const weeklyById = React.useMemo(() => {
    const map = new Map<string, { doneCount: number; target: number }>();
    (weekly?.habits || []).forEach((h) =>
      map.set(h.id, { doneCount: h.doneCount, target: h.target }),
    );
    return map;
  }, [weekly]);

  if (allHabits.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <View style={sectionStyles.itemsList}>
        {displayHabits.map((habit: any, index: number) => {
          const progress = weeklyById.get(habit.id);
          const doneCount = progress?.doneCount ?? 0;
          const target = progress?.target ?? 3;
          return (
            <EntityCard
              key={habit.id}
              record={habit}
              type="habit"
              onPress={() => onItemPress(habit)}
              onLogProgress={() => onLogProgress(habit)}
              showCheckbox={true}
              showTypePill={true}
              isFirst={index === 0}
              habitProgress={{ done: doneCount, target }}
              testID={`${testID}-item-${habit.id}`}
            />
          );
        })}
      </View>
      {moreCount > 0 && (
        <Pressable
          style={sectionMoreFooterStyle}
          onPress={() => {
            // TODO: Wire to full list view or search
            console.log('[HabitsSection] + X more pressed');
          }}
          testID={`${testID}-more`}
        >
          <Text style={sectionMoreTextStyle}>+ {moreCount} more in this space</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Logs/Notes Section - shows journal, idea, reference notes (excludes lists, max 5, sorted by most recent) */
/** Logs/Notes Section - shows journal, idea, reference notes (excludes lists, max 5, sorted by most recent) */
function LogsNotesSection({
  items,
  spaceId,
  onItemPress,
  testID,
}: {
  items: AppRecord[];
  spaceId: string;
  onItemPress: (item: AppRecord) => void;
  testID?: string;
}) {
  const allLogs = React.useMemo(() => {
    const notes = listNotesForSpace(items, spaceId);
    const filtered = notes
      .filter((n: any) => {
        const subtype = n.subtype;
        return subtype === 'journal' || subtype === 'idea' || subtype === 'reference' || !subtype;
      })
      .filter((n: any) => !n.is_list);
    // Sort by most recently updated
    return [...filtered].sort((a: any, b: any) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [items, spaceId]);

  const displayLogs = allLogs.slice(0, 5);
  const moreCount = allLogs.length - 5;

  if (allLogs.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <View style={sectionStyles.itemsList}>
        {displayLogs.map((log: any, index: number) => (
          <EntityCard
            key={log.id}
            record={log}
            type="log"
            onPress={() => onItemPress(log)}
            showCheckbox={false}
            showTypePill={true}
            isFirst={index === 0}
            subtitle={formatRelativeDate(log.updated_at || log.created_at)}
            testID={`${testID}-item-${log.id}`}
          />
        ))}
      </View>
      {moreCount > 0 && (
        <Pressable
          style={sectionMoreFooterStyle}
          onPress={() => {
            // TODO: Wire to full list view or search
            console.log('[LogsNotesSection] + X more pressed');
          }}
          testID={`${testID}-more`}
        >
          <Text style={sectionMoreTextStyle}>+ {moreCount} more in this space</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Lists Section - shows notes with is_list=true or subtype='list' (max 5, sorted by most recent) */
function ListsSection({
  items,
  spaceId,
  onItemPress,
  testID,
}: {
  items: AppRecord[];
  spaceId: string;
  onItemPress: (item: AppRecord) => void;
  testID?: string;
}) {
  const allLists = React.useMemo(() => {
    const notes = listNotesForSpace(items, spaceId);
    const filtered = notes.filter((n: any) => n.is_list || n.subtype === 'list');
    // Sort by most recently updated
    return [...filtered].sort((a: any, b: any) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [items, spaceId]);

  const displayLists = allLists.slice(0, 5);
  const moreCount = allLists.length - 5;

  if (allLists.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <View style={sectionStyles.itemsList}>
        {displayLists.map((list: any, index: number) => {
          const itemCount = list.body ? (list.body.match(/^[-•*]\s/gm) || []).length : 0;
          return (
            <EntityCard
              key={list.id}
              record={list}
              type="list"
              onPress={() => onItemPress(list)}
              showCheckbox={false}
              showTypePill={true}
              isFirst={index === 0}
              subtitle={itemCount > 0 ? `${itemCount} items` : 'List'}
              testID={`${testID}-item-${list.id}`}
            />
          );
        })}
      </View>
      {moreCount > 0 && (
        <Pressable
          style={sectionMoreFooterStyle}
          onPress={() => {
            // TODO: Wire to full list view or search
            console.log('[ListsSection] + X more pressed');
          }}
          testID={`${testID}-more`}
        >
          <Text style={sectionMoreTextStyle}>+ {moreCount} more in this space</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Section styles - matches Gremly design system */
const sectionStyles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },

  // Actions/Chats toggle - simple tab bar (no pill background)
  actionsChatsContainer: {
    paddingHorizontal: CONTENT_HORIZONTAL_PAD,
    marginTop: 16,
    marginBottom: 8,
  },
  actionsChatsSegmentedControl: {
    flexDirection: 'row',
    // No background - clean tab bar style
  },
  actionsChatsTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionsChatsTabText: {
    fontSize: 17,
    textAlign: 'center',
  },
  actionsChatsTabActive: {
    color: BRAND.colors.mossGreen,
    fontWeight: '700',
  },
  actionsChatsTabInactive: {
    color: 'rgba(34, 34, 34, 0.6)', // 60% opacity ink
    fontWeight: '400',
  },
  actionsChatsUnderline: {
    height: 2,
    width: 60,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 1,
    marginTop: 6,
  },

  // Items list - card container
  itemsList: {
    marginHorizontal: 16,
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.md,
    ...BRAND.elevation.one,
    overflow: 'hidden',
  },

  // Empty state - card-style container
  emptyState: {
    marginHorizontal: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.md,
    ...BRAND.elevation.one,
  },
  emptyStateIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});

// ============================================================================
// EXISTING TYPES & CONSTANTS
// ============================================================================

interface LayoutState {
  scheduleCollapsed?: boolean;
  habitsTodosCollapsed?: boolean;
  notesResourcesCollapsed?: boolean;
  journalCollapsed?: boolean;
}

const CANONICAL_TYPES_ON = env.feature.canonicalTypes;
const NOTE_SECTION_LABELS = deriveDisplayLabels('note', 'journal', CANONICAL_TYPES_ON);
const NOTE_SAVE_LABELS = deriveDisplayLabels('note', 'reference', CANONICAL_TYPES_ON);

export default function SpaceHomeScreen({ route, navigation }: Props) {
  const { spaceId } = route.params;
  const repo = useRepo();
  const { userId, user } = useAuth();
  const colorScheme = useColorScheme();
  const T = colorScheme === 'dark' ? darkTokens : lightTokens;
  const insets = useSafeAreaInsets();

  // Feature flag: Space v3 layout (robust parsing)
  const isSpaceV3 = (() => {
    const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on').toString().trim().toLowerCase();
    return raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
  })();
  // Feature flag: Space v3.3 (v33) - strict equality per spec
  const isSpaceV33 = process.env.EXPO_PUBLIC_SPACE_V33 === 'on';
  // Debug flags (dev only)
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[SpaceHome] flags', {
      v3: isSpaceV3,
      v22: process.env.EXPO_PUBLIC_SPACE_V22 === 'on',
      v33: isSpaceV33,
    });
  }

  // State
  const { space, chats, items, stats, upcoming, intent, nextItem, weekly, reload } =
    useSpaceAggregate(spaceId);
  const { totalCount: notesCount } = useSpaceNotes(spaceId);
  // Phase 12: Milestone and pinned hooks
  const { milestone, countdown, refetch: refetchMilestone } = useSpaceMilestone(spaceId);
  const { count: pinnedCount, refetch: refetchPinned } = usePinnedCount(spaceId);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  // Phase 5: Removed searchVisible, searchQuery, searchActiveV33 state (search via filter bar now)
  const isFocused = useIsFocused();
  const [summaryPulse] = useState(() => new Animated.Value(1));
  const [showConfetti, setShowConfetti] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layoutState, setLayoutState] = useState<LayoutState>({});
  const [selectedDayISO, setSelectedDayISO] = useState<string>(() =>
    formatISO(new Date(), { representation: 'date' }),
  );
  const [showTimeline, setShowTimeline] = useState(false);
  // Phase 5: Removed showCalendarV33, editGoalVisible, editGoalRecord, showNotepad, intentDraft, showPeople
  // Phase 5: Removed showUnifiedAdd, goalMenuId, renameChatModalOpen, renameChatId, renameChatTitle
  const [showNotepad, setShowNotepad] = useState(false);
  const [showPeople, setShowPeople] = useState(false);

  // Phase 4: Keep spaceView for v22 backwards compatibility, but v33 uses sections
  type SpaceViewMode = 'actions' | 'chats';
  const [spaceView, setSpaceView] = useState<SpaceViewMode>('actions');

  // Filter bar state (legacy - kept for v22)
  const [filter, setFilter] = useState<FilterTab>('all');

  // Expanded state for "View more" button
  const [expanded, setExpanded] = useState(false);

  // Phase 12: Optimistic completion tracking (useRef persists across aggregate refreshes)
  const localCompletedIdsRef = useRef<Set<string>>(new Set());
  const localPinnedIdsRef = useRef<Set<string>>(new Set()); // Track locally toggled pinned state
  const localLoggedHabitIdsRef = useRef<Set<string>>(new Set()); // Track optimistically logged habits
  const localUncheckedHabitIdsRef = useRef<Set<string>>(new Set()); // Track habits user unchecked this session
  const [optimisticVersion, forceUpdate] = useReducer((x) => x + 1, 0);
  const [showPinnedModal, setShowPinnedModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [chatListModalVisible, setChatListModalVisible] = useState(false);
  const [showCompletedOverlay, setShowCompletedOverlay] = useState(false);

  // Handler to change filter and collapse list
  const handleFilterChange = useCallback((newFilter: FilterTab) => {
    setFilter(newFilter);
    setExpanded(false);
  }, []);

  // Phase 6: Quick add state
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showAttachExistingModal, setShowAttachExistingModal] = useState(false);
  const [optimisticQuickAdd, setOptimisticQuickAdd] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Unified compact item list - combines all types, filtered, sorted by most recent
  const MAX_COMPACT_ITEMS = 7;

  // Weekly habit progress map (for habit progress bars)
  const weeklyById = useMemo(() => {
    const map = new Map<string, { doneCount: number; target: number }>();
    (weekly?.habits || []).forEach((h: { id: string; doneCount: number; target: number }) =>
      map.set(h.id, { doneCount: h.doneCount, target: h.target }),
    );
    return map;
  }, [weekly]);

  // Helper to get habit day flags from weekly data
  const getHabitDayFlags = useCallback(
    (habitId: string): boolean[] | undefined => {
      const habitWeekly = weekly?.habits?.find((h: any) => h.id === habitId);
      return habitWeekly?.dayFlags;
    },
    [weekly],
  );

  // Build unified filtered items array
  const { itemsToShow, moreCount } = useMemo(() => {
    // Get all items by type for this space
    const todos = listTodosForSpace(items, spaceId).filter((t: any) => !t.completed_at);
    const habits = listHabitsForSpace(items, spaceId);
    const notes = listNotesForSpace(items, spaceId);
    const logs = notes.filter((n: any) => !n.is_list && n.subtype !== 'list');
    const lists = notes.filter((n: any) => n.is_list || n.subtype === 'list');

    // Apply filter
    let filtered: any[] = [];
    if (filter === 'all') {
      filtered = [...todos, ...habits, ...logs, ...lists];
    } else if (filter === 'todos') {
      filtered = todos;
    } else if (filter === 'habits') {
      filtered = habits;
    } else if (filter === 'logs') {
      filtered = logs;
    } else if (filter === 'lists') {
      filtered = lists;
    }

    // Exclude optimistic items (already shown in optimistic card)
    if (optimisticQuickAdd) {
      filtered = filtered.filter((it) => it.id !== optimisticQuickAdd.id);
    }

    // Sort by most recently interacted (updated_at or created_at)
    filtered.sort((a: any, b: any) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });

    return {
      itemsToShow: expanded ? filtered : filtered.slice(0, MAX_COMPACT_ITEMS),
      moreCount: Math.max(0, filtered.length - MAX_COMPACT_ITEMS),
    };
  }, [items, spaceId, filter, optimisticQuickAdd, expanded]);

  // Phase 4: Section data for new layout with optimistic completion
  const todosForSpace = useMemo(() => {
    const allTodos = listTodosForSpace(items, spaceId);
    // Apply optimistic completion state from ref - filter out completed for main section
    const withOptimistic = allTodos.map((todo: any) => {
      // Get database completion state - check both completed_at AND status field
      const dbCompleted = !!todo.completed_at || todo.status === 'completed';
      const locallyToggled = localCompletedIdsRef.current.has(todo.id);
      // XOR: if locally toggled, flip the DB state
      const isCompleted = locallyToggled ? !dbCompleted : dbCompleted;
      return {
        ...todo,
        completed_at: isCompleted ? todo.completed_at || new Date().toISOString() : null,
      };
    });
    // Only return incomplete todos for the main section
    return withOptimistic.filter((t: any) => !t.completed_at);
  }, [items, spaceId, optimisticVersion]); // optimisticVersion triggers recalc on forceUpdate

  // Completed todos for the CompletedInSpaceOverlay
  const completedTodosForSpace = useMemo(() => {
    const allTodos = listTodosForSpace(items, spaceId);
    // Apply optimistic completion state
    const withOptimistic = allTodos.map((todo: any) => {
      const dbCompleted = !!todo.completed_at || todo.status === 'completed';
      const locallyToggled = localCompletedIdsRef.current.has(todo.id);
      const isCompleted = locallyToggled ? !dbCompleted : dbCompleted;
      return {
        ...todo,
        completed_at: isCompleted ? todo.completed_at || new Date().toISOString() : null,
      };
    });
    // Only return completed todos
    return withOptimistic.filter((t: any) => !!t.completed_at);
  }, [items, spaceId, optimisticVersion]);

  const habitsForSpace = useMemo(() => {
    return listHabitsForSpace(items, spaceId);
  }, [items, spaceId]);

  const notesForSpace = useMemo(() => {
    return listNotesForSpace(items, spaceId).filter((n: any) => !n.is_list && n.subtype !== 'list');
  }, [items, spaceId]);

  // Phase 4: Streak map from weekly habit data
  const streakMap = useMemo(() => {
    const map = new Map<string, number>();
    (weekly?.habits || []).forEach((h: { id: string; dayStreak: number }) => {
      if (h.dayStreak !== undefined && h.dayStreak > 0) {
        map.set(h.id, h.dayStreak);
      }
    });
    return map;
  }, [weekly]);

  // Phase 4: Transform weeklyById to match HabitProgress interface with optimistic updates
  const habitProgressMap = useMemo(() => {
    const map = new Map<string, { done: number; target: number }>();
    weeklyById.forEach((progress, id) => {
      const locallyLogged = localLoggedHabitIdsRef.current.has(id);
      const locallyUnchecked = localUncheckedHabitIdsRef.current.has(id);
      // If locally unchecked, show as 0 done (overrides server)
      // If locally logged, add 1 to done count
      // Otherwise use server value
      let done = progress.doneCount;
      if (locallyUnchecked) {
        done = 0; // Override to unchecked
      } else if (locallyLogged) {
        done = progress.doneCount + 1;
      }
      map.set(id, { done, target: progress.target });
    });
    // For habits not in weeklyById but locally logged, add them with done=1, target=1
    localLoggedHabitIdsRef.current.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, { done: 1, target: 1 });
      }
    });
    console.log('[SpaceHome] habitProgressMap result:', [...map.entries()]);
    return map;
  }, [weeklyById, optimisticVersion]); // optimisticVersion triggers recalc

  // Helper to determine EntityCard type from record
  const getEntityType = useCallback((record: any): EntityType => {
    if (record.type === 'todo') return 'todo';
    if (record.type === 'habit') return 'habit';
    if (record.is_list || record.subtype === 'list') return 'list';
    return 'log';
  }, []);

  const overlay = useGlobalOverlay();

  // Handler for item press (opens view for notes, edit for todos/habits)
  const handleItemPress = useCallback(
    (item: AppRecord) => {
      console.log('[SpaceHome] Item pressed:', item.id, item.type);
      // Notes open in view mode, todos/habits open in edit mode
      if (item.type === 'todo' || item.type === 'habit') {
        overlay.openEdit({ record: item, spaceId });
      } else {
        // note (default)
        overlay.openView({ record: item, spaceId });
      }
    },
    [overlay, spaceId],
  );

  // Handler for todo completion with optimistic update using ref
  const handleTodoComplete = useCallback(
    async (item: AppRecord) => {
      const todoId = item.id;
      console.log('[SpaceHome] Todo complete:', todoId);

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Toggle in our local ref (persists across re-renders)
      if (localCompletedIdsRef.current.has(todoId)) {
        localCompletedIdsRef.current.delete(todoId);
      } else {
        localCompletedIdsRef.current.add(todoId);
      }

      // Force re-render to show the change immediately
      forceUpdate();

      try {
        await repo.completeTodo(todoId, new Date().toISOString());
        setShowConfetti(true);
        // Don't clear local override - keep the optimistic state
        // The local toggle will persist until user leaves the screen
      } catch (e) {
        console.warn('[SpaceHome] Failed to complete todo:', e);
        // Revert optimistic update on error
        if (localCompletedIdsRef.current.has(todoId)) {
          localCompletedIdsRef.current.delete(todoId);
        } else {
          localCompletedIdsRef.current.add(todoId);
        }
        forceUpdate();
        Alert.alert('Error', 'Failed to complete todo');
      }
    },
    [repo],
  );

  // Handler to restore a completed todo (mark as incomplete)
  const handleRestoreTodo = useCallback(
    async (item: AppRecord) => {
      const todoId = item.id;
      console.log('[SpaceHome] Restore todo:', todoId);

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Toggle in local ref to show optimistic update
      if (localCompletedIdsRef.current.has(todoId)) {
        localCompletedIdsRef.current.delete(todoId);
      } else {
        localCompletedIdsRef.current.add(todoId);
      }
      forceUpdate();

      try {
        // Call repo to restore the todo (sets status='active', clears completed_at)
        await repo.restoreItem(todoId, 'todo');
      } catch (e) {
        console.warn('[SpaceHome] Failed to restore todo:', e);
        // Revert optimistic update on error
        if (localCompletedIdsRef.current.has(todoId)) {
          localCompletedIdsRef.current.delete(todoId);
        } else {
          localCompletedIdsRef.current.add(todoId);
        }
        forceUpdate();
        Alert.alert('Error', 'Failed to restore todo');
      }
    },
    [repo],
  );

  // Handler for habit progress logging with optimistic toggle (like todo completion)
  const handleHabitLogProgress = useCallback(
    async (item: AppRecord) => {
      const habitId = item.id;
      const progress = habitProgressMap.get(habitId);
      const isDoneToday = progress ? progress.done > 0 : false;
      const wasLocallyUnchecked = localUncheckedHabitIdsRef.current.has(habitId);

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      console.log(
        '[SpaceHome] Habit toggle:',
        habitId,
        'isDoneToday:',
        isDoneToday,
        'wasLocallyUnchecked:',
        wasLocallyUnchecked,
      );

      // Toggle behavior like todos:
      // If currently shown as done → mark as unchecked (visual only)
      // If currently shown as not done → log progress and show as done
      if (isDoneToday) {
        // Currently checked → uncheck it
        localLoggedHabitIdsRef.current.delete(habitId); // Remove any local log
        localUncheckedHabitIdsRef.current.add(habitId); // Mark as unchecked
        forceUpdate();
        // Note: We don't call the API to undo - just visual toggle for this session
        return;
      }

      // Currently unchecked → check it
      localUncheckedHabitIdsRef.current.delete(habitId); // Remove unchecked override
      localLoggedHabitIdsRef.current.add(habitId); // Add optimistic log
      forceUpdate();

      try {
        await repo.logHabitProgress(habitId, new Date().toISOString());
        setShowConfetti(true);
        // Keep optimistic state - don't clear until user leaves
      } catch (e) {
        console.warn('[SpaceHome] Failed to log habit progress:', e);
        // Revert on error
        localLoggedHabitIdsRef.current.delete(habitId);
        forceUpdate();
        Alert.alert('Error', 'Failed to log progress');
      }
    },
    [repo, habitProgressMap],
  );

  // Phase 6: Space quick add hook
  const spaceQuickAdd = useSpaceQuickAdd({
    spaceId,
    onStart: (draftTitle) => {
      console.log('[SpaceHome] Quick add started:', draftTitle);
      setOptimisticQuickAdd({
        id: `space-optimistic-${Date.now()}`,
        title: draftTitle,
      });
    },
    onComplete: (result) => {
      console.log('[SpaceHome] Quick add complete:', result);
      setOptimisticQuickAdd(null);
      void reload();
    },
    onError: (error) => {
      console.error('[SpaceHome] Quick add error:', error.message);
      setOptimisticQuickAdd(null);
    },
  });

  // Phase 6: Handle quick add submission
  const handleQuickAddSubmit = useCallback(
    (text: string) => {
      spaceQuickAdd.onQuickAdd(text);
    },
    [spaceQuickAdd],
  );

  // Phase 6: Handle "Manual add" from quick add modal
  const handleQuickAddManual = useCallback(
    (text: string) => {
      overlay.openCreate({ spaceId, initialText: text || undefined });
    },
    [overlay, spaceId],
  );

  // Phase 6: Handle attach existing completion
  const handleAttachExistingComplete = useCallback(() => {
    void reload();
  }, [reload]);

  // Debug: Log overlay state changes
  useEffect(() => {
    console.log('[SpaceHome] Overlay state changed:', {
      visible: overlay.state.visible,
      mode: overlay.state.mode,
      initialEntityType: overlay.state.initialEntity?.type,
      initialEntityId: overlay.state.initialEntity?.id,
    });
  }, [
    overlay.state.visible,
    overlay.state.mode,
    overlay.state.initialEntity?.type,
    overlay.state.initialEntity?.id,
  ]);

  const [showUnsortedToast, setShowUnsortedToast] = useState(false);
  const unsortedOpacity = React.useMemo(() => new Animated.Value(0), []);
  // Undo snackbar (Sage bg)
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [undoText, setUndoText] = useState<string>('Marked complete');
  const undoOpacity = React.useMemo(() => new Animated.Value(0), []);
  const undoHandlerRef = React.useRef<null | (() => Promise<void>)>(null);
  // Unified timeline hook (v22)
  const { days: timelineDays, reload: reloadTimeline } = useSpaceTimeline(spaceId);
  // v33 page load motion
  // Safe defaults so content is visible even if animation doesn’t kick in
  const oV33 = React.useMemo(() => new Animated.Value(1), []);
  const yV33 = React.useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (!isSpaceV33) return;
    Animated.parallel([
      Animated.timing(oV33, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(yV33, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpaceV33]);

  // Android hardware back button support
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [navigation]),
  );

  // Refs for smooth scrolling to sections (v22)
  const scrollRef = React.useRef<ScrollView | null>(null);
  // Phase 5: Removed v22 cascade animation values (oWeek, oDay, oSummary, oInsights, oCTA, oThreads, yWeek, etc.)
  // Focus card snooze state
  const [focusDismissed, setFocusDismissed] = useState<boolean>(false);
  // Feature flag: Space v22 header (strict equality as requested)
  const isSpaceV22 = process.env.EXPO_PUBLIC_SPACE_V22 === 'on';

  // Phase 5: Removed v22 cascade animation useEffect (no longer using those animated values)

  // Header mood line heuristic
  const headerMood = React.useMemo(() => {
    const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
    const lastItemTs = items.reduce((acc, it: any) => {
      const ts = new Date(it.updated_at || it.created_at || 0).getTime();
      return Math.max(acc, ts);
    }, 0);
    const lastTs = Math.max(lastChatTs, lastItemTs);
    const daysSince = lastTs ? Math.floor((Date.now() - lastTs) / (1000 * 60 * 60 * 24)) : 999;
    if (daysSince >= 7)
      return { tone: 'low' as const, text: 'It’s been quiet — want to revisit your goals?' };
    const todayISO = formatISO(new Date(), { representation: 'date' });
    const today = (timelineDays || []).find((d) => d.dateISO === todayISO);
    const anyDone = (timelineDays || []).some((d) => (d.items || []).some((it: any) => !!it.done));
    if (anyDone || (today && (today.items || []).length > 0)) {
      return { tone: 'proud' as const, text: 'Steady rhythm — keep the momentum.' };
    }
    return { tone: 'calm' as const, text: 'Nothing urgent — breathe and reflect.' };
  }, [chats, items, timelineDays]);

  // v33: Derive mood for witty line
  const v33Mood: Mood = React.useMemo(() => {
    const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
    const lastItemTs = items.reduce((acc, it: any) => {
      const ts = new Date(it.updated_at || it.created_at || 0).getTime();
      return Math.max(acc, ts);
    }, 0);
    const lastTs = Math.max(lastChatTs, lastItemTs);
    const daysSince = lastTs ? Math.floor((Date.now() - lastTs) / (1000 * 60 * 60 * 24)) : 999;

    if (daysSince >= 7) return 'low';

    const todayISO = formatISO(new Date(), { representation: 'date' });
    const today = (timelineDays || []).find((d) => d.dateISO === todayISO);
    const anyDone = (timelineDays || []).some((d) => (d.items || []).some((it: any) => !!it.done));

    if (anyDone || (today && (today.items || []).length > 0)) return 'proud';

    return 'neutral';
  }, [chats, items, timelineDays]);

  // v33: Compute daily witty line
  const v33WittyLine = React.useMemo(() => {
    const dailySeed = new Date().toISOString().slice(0, 10);
    return getWittyLine(space?.name ?? 'Space', v33Mood, dailySeed);
  }, [space?.name, v33Mood]);

  // Header mascot micro-states
  const [headerMascot, setHeaderMascot] = useState<'calm' | 'focused' | 'proud' | 'playful'>(
    'calm',
  );
  useEffect(() => {
    if (!isSpaceV22) return;
    // playful peek on screen focus
    if (isFocused) {
      setHeaderMascot('playful');
      const t = setTimeout(() => setHeaderMascot('calm'), 600);
      return () => clearTimeout(t);
    }
  }, [isFocused, isSpaceV22]);

  // Day scroll effect removed - DayPanel no longer used

  // Load focus card dismissal from AsyncStorage
  useEffect(() => {
    const run = async () => {
      try {
        const todayISO = formatISO(new Date(), { representation: 'date' });
        const key = `focusCard:dismiss:${spaceId}:${todayISO}`;
        const until = await AsyncStorage.getItem(key);
        if (until) {
          const ts = new Date(until).getTime();
          if (!isNaN(ts) && ts > Date.now()) setFocusDismissed(true);
        }
      } catch {
        /* ignore */
      }
    };
    run();
  }, [spaceId]);

  const showSageToast = useCallback(() => {
    setShowUnsortedToast(true);
    unsortedOpacity.setValue(0);
    Animated.timing(unsortedOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(unsortedOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setShowUnsortedToast(false);
        });
      }, 1800);
    });
  }, [unsortedOpacity]);

  const showUndoSnackbar = useCallback(
    (text: string, onUndo: () => Promise<void>) => {
      setUndoText(text);
      undoHandlerRef.current = onUndo;
      setShowUndoToast(true);
      undoOpacity.setValue(0);
      Animated.timing(undoOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start(
        () => {
          setTimeout(() => {
            Animated.timing(undoOpacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) setShowUndoToast(false);
            });
          }, 3000);
        },
      );
    },
    [undoOpacity],
  );
  //
  // removed legacy mock data used during design polish; real data wired via hooks
  //

  // Phase 10.8: Space Insight state
  const [spaceInsight, setSpaceInsight] = useState<{
    summary: string;
    summary_at: string;
    tokens: number;
  } | null>(null);

  // Dev-only diagnostics to confirm layout branch
  useEffect(() => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[SpaceHome] v3 flag is', isSpaceV3);
    }
  }, [isSpaceV3]);

  // Create SpaceChatRepo instance (for actions)
  const spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Initial visual loading phase mirrors hook's first fetch
  useEffect(() => {
    // When hook provides any space value, consider initial load complete
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (space || space === null) setLoading(false);
  }, [space]);

  // Screen focus pulse for SpaceSummaryCard
  useEffect(() => {
    if (isFocused) {
      summaryPulse.setValue(0.98);
      Animated.timing(summaryPulse, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  }, [isFocused, summaryPulse]);

  // Load insight and layout state when space changes
  useEffect(() => {
    if (space?.layout_state_json) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLayoutState(space.layout_state_json as LayoutState);
      } catch (e) {
        console.warn('Failed to parse layout state', e);
      }
    }
    repo
      .getLatestSpaceInsight(spaceId)
      .then(setSpaceInsight)
      .catch(() => undefined);
  }, [spaceId, space, repo]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      reload(),
      repo
        .getLatestSpaceInsight(spaceId)
        .then(setSpaceInsight)
        .catch(() => undefined),
    ]).finally(() => setRefreshing(false));
  }, [reload, repo, spaceId]);

  // Phase 5: Removed handleSearchPress, v33FilteredResults (search via filter bar now)

  // Persist layout state
  const persistLayoutState = useCallback(
    async (newState: LayoutState) => {
      if (!space) return;
      try {
        await repo.updateSpace(spaceId, {
          layout_state_json: newState,
        });
        setLayoutState(newState);
        // Phase 8 polish: Track module collapse/expand
        console.log('[Analytics] space_module_toggled', { spaceId, layoutState: newState });
      } catch (error) {
        console.warn('Failed to persist layout state:', error);
      }
    },
    [space, spaceId, repo],
  );

  // Chat actions
  const handleNewChat = useCallback(async () => {
    // Navigate to ChatThreadScreen without a chatId - chat will be created on first message
    navigation.navigate('ChatThread', { spaceId });
  }, [spaceId, navigation]);

  // Chat list modal handlers
  const handleChatButtonPress = useCallback(() => {
    console.log('[SpaceHome] Chat button pressed, opening modal');
    setChatListModalVisible(true);
  }, []);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      navigation.navigate('ChatThread', { spaceId, chatId });
    },
    [navigation, spaceId],
  );

  const handleNewChatFromModal = useCallback(() => {
    navigation.navigate('ChatThread', { spaceId, chatId: undefined });
  }, [navigation, spaceId]);

  // Phase 12: MilestoneHeader handlers
  const handleGremlyPress = useCallback(() => {
    // Open chat - use existing chat opening logic
    handleNewChat();
  }, [handleNewChat]);

  const handleNudgePress = useCallback(() => {
    // TODO: Open milestone entry modal (Phase 8)
    console.log('[SpaceHome] Nudge pressed - will open milestone modal');
  }, []);

  const handleSettingsPress = useCallback(() => {
    setShowSettingsModal(true);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setShowSettingsModal(false);
  }, []);

  const handleSaveSpaceName = useCallback(
    async (name: string) => {
      if (!spaceId) return;

      console.log('[SpaceHome] Saving space name:', name);

      try {
        await repo.updateSpace(spaceId, { name });
        // Refetch space data
        reload?.();
      } catch (error) {
        console.error('[SpaceHome] Save space name error:', error);
        throw error;
      }
    },
    [spaceId, repo, reload],
  );

  const handleDeleteSpace = useCallback(async () => {
    if (!spaceId) return;

    console.log('[SpaceHome] Deleting space:', spaceId);

    try {
      await repo.deleteSpace(spaceId);
      // Navigate back to spaces list
      navigation.goBack();
    } catch (error) {
      console.error('[SpaceHome] Delete space error:', error);
      throw error;
    }
  }, [spaceId, repo, navigation]);

  const getSpaceItemCounts = useCallback(async () => {
    if (!spaceId) return { todos: 0, habits: 0, notes: 0 };
    return repo.getSpaceItemCounts(spaceId);
  }, [spaceId, repo]);

  const handleEditMilestoneFromSettings = useCallback(() => {
    setShowMilestoneModal(true);
  }, []);

  const handlePinnedPress = useCallback(() => {
    setShowPinnedModal(true);
  }, []);

  const handlePinnedModalClose = useCallback(() => {
    setShowPinnedModal(false);
  }, []);

  const handleMilestonePress = useCallback(() => {
    setShowMilestoneModal(true);
  }, []);

  const handleMilestoneModalClose = useCallback(() => {
    setShowMilestoneModal(false);
  }, []);

  const handleMilestoneSave = useCallback(
    async (name: string, targetDate: Date) => {
      if (!spaceId) return;

      // Haptic feedback on save
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      console.log('[SpaceHome] Saving milestone:', name, targetDate);

      try {
        if (milestone) {
          // Update existing
          await repo.updateMilestone(milestone.id, {
            name,
            date: targetDate.toISOString().split('T')[0],
          });
        } else {
          // Create new
          await repo.createMilestone(spaceId, {
            name,
            date: targetDate.toISOString().split('T')[0],
            is_active: true,
          });
        }

        // Refresh milestone data
        refetchMilestone();
      } catch (error) {
        console.error('[SpaceHome] Milestone save error:', error);
        throw error;
      }
    },
    [spaceId, milestone, repo, refetchMilestone],
  );

  const handleMilestoneRemove = useCallback(async () => {
    if (!milestone) return;

    console.log('[SpaceHome] Removing milestone:', milestone.id);

    try {
      await repo.deleteMilestone(milestone.id);
      refetchMilestone();
    } catch (error) {
      console.error('[SpaceHome] Milestone remove error:', error);
      throw error;
    }
  }, [milestone, repo, refetchMilestone]);

  const handlePinnedItemPress = useCallback(
    (item: any, type: 'todo' | 'habit' | 'note') => {
      setShowPinnedModal(false);
      handleItemPress(item);
    },
    [handleItemPress],
  );

  // Pin handlers for long-press
  const handlePinItem = useCallback(
    async (item: any, type: 'todo' | 'habit' | 'note') => {
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Check both database state and local toggle state
      const dbPinned = !!item.is_pinned;
      const localToggled = localPinnedIdsRef.current.has(item.id);
      const currentlyPinned = localToggled ? !dbPinned : dbPinned;
      const newPinned = !currentlyPinned;

      console.log(
        '[SpaceHome] Pin item:',
        item.id,
        'type:',
        type,
        'newPinned:',
        newPinned,
        'dbPinned:',
        dbPinned,
        'localToggled:',
        localToggled,
      );

      // Toggle local state
      if (localPinnedIdsRef.current.has(item.id)) {
        localPinnedIdsRef.current.delete(item.id);
      } else {
        localPinnedIdsRef.current.add(item.id);
      }

      try {
        if (type === 'todo') {
          await repo.toggleTodoPinned(item.id, newPinned);
        } else if (type === 'habit') {
          await repo.toggleHabitPinned(item.id, newPinned);
        } else {
          await repo.toggleNotePinned(item.id, newPinned);
        }
        // Refresh pinned count
        refetchPinned();
        // Show feedback
        Alert.alert(
          newPinned ? 'Pinned!' : 'Unpinned',
          newPinned
            ? `"${item.title || item.name}" has been pinned for quick access.`
            : `"${item.title || item.name}" has been unpinned.`,
        );
      } catch (error) {
        console.error('[SpaceHome] Failed to pin item:', error);
        // Revert local state on error
        if (localPinnedIdsRef.current.has(item.id)) {
          localPinnedIdsRef.current.delete(item.id);
        } else {
          localPinnedIdsRef.current.add(item.id);
        }
        Alert.alert('Error', 'Failed to update pin status');
      }
    },
    [repo, refetchPinned],
  );

  const handleTodoLongPress = useCallback(
    (todo: any) => {
      handlePinItem(todo, 'todo');
    },
    [handlePinItem],
  );

  const handleHabitLongPress = useCallback(
    (habit: any) => {
      handlePinItem(habit, 'habit');
    },
    [handlePinItem],
  );

  const handleNoteLongPress = useCallback(
    (note: any) => {
      handlePinItem(note, 'note');
    },
    [handlePinItem],
  );

  const handleChatPress = useCallback(
    (chatId: string) => {
      // TODO: Fire analytics
      // analytics.track('space_chat_opened', { spaceId, chatId });
      console.log('[Analytics] space_chat_opened', { spaceId, chatId }); // Phase 8 polish
      navigation.navigate('ChatThread', { spaceId, chatId });
    },
    [navigation, spaceId],
  );

  const handlePinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: true });
        await reload();
      } catch (error) {
        console.warn('Failed to pin chat:', error);
        Alert.alert('Error', 'Failed to pin chat');
      }
    },
    [spaceChatRepo, reload],
  );

  const handleUnpinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: false });
        await reload();
      } catch (error) {
        console.warn('Failed to unpin chat:', error);
        Alert.alert('Error', 'Failed to unpin chat');
      }
    },
    [spaceChatRepo, reload],
  );

  // Phase 5: Removed handleRenameChat (used removed state), kept handleRenameChatV22

  // v22 compatible wrapper for handleRenameChat (takes newTitle directly)
  const handleRenameChatV22 = useCallback(
    async (chatId: string, newTitle: string) => {
      try {
        await spaceChatRepo.update(chatId, { title: newTitle });
        await reload();
      } catch (error) {
        console.error('Failed to rename chat:', error);
        Alert.alert('Error', 'Failed to rename chat');
      }
    },
    [spaceChatRepo, reload],
  );

  // Phase 5: Removed handleRenameChatSubmit (used removed renameChatId state)

  // v33: Goal menu handled via Menu component (see inline render in v33 branch)

  const handleArchiveChat = useCallback(
    async (chatId: string) => {
      try {
        // Archive is the safer default: soft-archive when supported
        const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
        if (backend === 'supabase' && spaceChatRepo instanceof SupabaseSpaceChatRepo) {
          await spaceChatRepo.archive(chatId);
        } else {
          // Memory repo uses delete() to mark archived
          await spaceChatRepo.delete(chatId);
        }
        await reload();
      } catch (error) {
        console.error('Failed to archive chat:', error);
        Alert.alert('Error', 'Failed to archive chat');
      }
    },
    [spaceChatRepo, reload],
  );

  // Hard delete handler
  const handleDeleteChat = useCallback(
    (chatId: string) => {
      Alert.alert('Delete chat?', 'This will permanently remove the chat and all its messages.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
              if (backend === 'supabase' && spaceChatRepo instanceof SupabaseSpaceChatRepo) {
                await spaceChatRepo.delete(chatId);
              } else {
                // Memory repo: mimic hard delete by archiving (existing behavior)
                await spaceChatRepo.delete(chatId);
              }
              await reload();
            } catch (error) {
              console.error('Failed to delete chat:', error);
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]);
    },
    [spaceChatRepo, reload],
  );

  // Compute preview data using selectors
  const weekStart = formatISO(startOfWeek(new Date()), { representation: 'date' });
  const habits = listHabitsForSpace(items, spaceId, { limit: 3 });
  const todos = listTodosForSpace(items, spaceId, { limit: 3 });
  const notes = listNotesForSpace(items, spaceId, { limit: 5 });
  const journals = listNotesForSpace(items, spaceId, { subtype: 'journal', limit: 3 });
  const journalCount = countJournalForSpace(items, spaceId);

  // Phase 10.8: Space Insight action handlers
  const handleSaveInsightAsNote = useCallback(async () => {
    if (!spaceInsight) return;

    try {
      await repo.create({
        type: 'note',
        title: 'Conversation Summary',
        body: spaceInsight.summary,
        subtype: 'reference',
        space_id: spaceId,
        ai_placed: true,
        origin: 'catchall',
      });

      Alert.alert('Success', `Summary saved as ${NOTE_SAVE_LABELS.singular.toLowerCase()}`);
      // Refresh to show new note
      await reload();
    } catch (error) {
      console.error(`Failed to save insight as ${NOTE_SAVE_LABELS.singular.toLowerCase()}:`, error);
      Alert.alert('Error', `Failed to save ${NOTE_SAVE_LABELS.singular.toLowerCase()}`);
    }
  }, [spaceInsight, spaceId, repo, reload]);

  // Compute AI summaries for visible chats (top 3)
  useEffect(() => {
    const run = async () => {
      try {
        const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
        if (backend !== 'supabase' || !userId) return;
        const msgRepo = new SupabaseSpaceChatMessageRepo(userId);
        const subset = chats.slice(0, 3);
        const entries = await Promise.all(
          subset.map(async (c) => {
            const msgs = await msgRepo.list(c.id);
            const summary = await summarizeChatForCard(c.id, msgs);
            return [c.id, summary] as const;
          }),
        );
        setAiSummaries((prev) => {
          const next = { ...prev };
          for (const [id, s] of entries) next[id] = s;
          return next;
        });
      } catch {
        // ignore summarization errors in UI
      }
    };
    run();
  }, [chats, userId]);

  const handleAddInsightTodos = useCallback(() => {
    if (!spaceInsight) return;
    Alert.alert('Add Next Step', 'This will open the quick add overlay', [
      { text: 'OK', onPress: () => console.log('[10.8] TODO: Open unified overlay for todos') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [spaceInsight]);

  // Always show loading spinner if no space yet
  // This prevents the "Space not found" flash during initial load
  if (!space) {
    return (
      <View style={[styles.loading, { backgroundColor: BRAND.colors.linenCream }]}>
        <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
      </View>
    );
  }

  // New: Space v33 gated layout
  if (isSpaceV33) {
    if (__DEV__) {
      console.log('[SpaceHome] render v33');
      console.log(
        '[SpaceHome v33] space?',
        !!space,
        'items:',
        items.length,
        'chats:',
        chats.length,
      );
      console.log('[SpaceHome v33] title:', space?.name ?? 'Space');
    }
    return (
      <View style={[styles.container, { backgroundColor: BRAND.colors.linenCream }]}>
        <Animated.View style={{ flex: 1, opacity: oV33, transform: [{ translateY: yV33 }] }}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 + insets.bottom }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            {/* Phase 12: MilestoneHeader replaces HeaderV33 */}
            <MilestoneHeader
              spaceName={space?.name ?? 'Space'}
              milestone={milestone}
              countdown={countdown}
              pinnedCount={pinnedCount}
              completedCount={completedTodosForSpace.length}
              onGremlyPress={handleGremlyPress}
              onPinnedPress={handlePinnedPress}
              onCompletedPress={() => setShowCompletedOverlay(true)}
              onNudgePress={handleMilestonePress}
              onMilestonePress={handleMilestonePress}
              onSettingsPress={handleSettingsPress}
              onBackPress={() => navigation.goBack()}
            />

            {/* Phase 12: Actions/Chats toggle removed - content sections below */}

            {/* Optimistic quick add card */}
            {optimisticQuickAdd && (
              <View
                style={{
                  marginHorizontal: CONTENT_HORIZONTAL_PAD,
                  marginBottom: 12,
                  backgroundColor: BRAND.colors.sageMist,
                  borderRadius: BRAND.radius.md,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <ActivityIndicator
                  size="small"
                  color={BRAND.colors.mossGreen}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '500',
                      color: BRAND.colors.charcoalInk,
                    }}
                    numberOfLines={1}
                  >
                    {optimisticQuickAdd.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: BRAND.colors.inkSubtle,
                      marginTop: 2,
                    }}
                  >
                    Processing...
                  </Text>
                </View>
              </View>
            )}

            {/* Zone A removed - Add to Space moved to persistent bottom bar */}

            {/* ═══════════════════════════════════════════════════════════════════
                ZONE B — Phase 12 Content Sections
                ═══════════════════════════════════════════════════════════════════ */}
            <View
              testID="space-zone-b"
              style={{ paddingHorizontal: CONTENT_HORIZONTAL_PAD, marginTop: 20 }}
            >
              {/* Show sections if any content exists */}
              {todosForSpace.length > 0 || habitsForSpace.length > 0 || notesForSpace.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {/* Guides & Logs Section - Reference material first */}
                  {notesForSpace.length > 0 && (
                    <>
                      <GuidesLogsSection
                        notes={notesForSpace}
                        onNotePress={(note) => handleItemPress(note)}
                        onNoteLongPress={(note) => handleNoteLongPress(note)}
                        maxVisible={4}
                      />
                      {(todosForSpace.length > 0 || habitsForSpace.length > 0) && (
                        <SectionDivider />
                      )}
                    </>
                  )}

                  {/* Todos Section */}
                  {todosForSpace.length > 0 && (
                    <>
                      <TodoSectionV2
                        todos={todosForSpace}
                        onTodoPress={(todo) => handleItemPress(todo)}
                        onTodoComplete={(todo) => handleTodoComplete(todo)}
                        onTodoLongPress={(todo) => handleTodoLongPress(todo)}
                        maxVisible={4}
                      />
                      {habitsForSpace.length > 0 && <SectionDivider />}
                    </>
                  )}

                  {/* Habits Section */}
                  {habitsForSpace.length > 0 && (
                    <HabitsSectionV2
                      habits={habitsForSpace}
                      progressMap={habitProgressMap}
                      streakMap={streakMap}
                      onHabitPress={(habit) => handleItemPress(habit)}
                      onHabitLog={(habit) => handleHabitLogProgress(habit)}
                      onHabitLongPress={(habit) => handleHabitLongPress(habit)}
                    />
                  )}
                </View>
              ) : (
                <EmptySpaceState spaceName={space?.name || 'This space'} />
              )}
            </View>
          </ScrollView>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════════════
            PERSISTENT BOTTOM ACTION BAR
            ═══════════════════════════════════════════════════════════════════ */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12 + insets.bottom,
            backgroundColor: BRAND.colors.linenCream,
            borderTopWidth: 1,
            borderTopColor: 'rgba(191, 216, 192, 0.3)',
            flexDirection: 'row',
            gap: 8,
          }}
          testID="space-bottom-action-bar"
        >
          <Pressable
            onPress={() => setShowQuickAddModal(true)}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              backgroundColor: pressed ? 'rgba(191, 216, 192, 0.4)' : 'rgba(191, 216, 192, 0.2)',
              borderWidth: 1,
              borderColor: 'rgba(191, 216, 192, 0.6)',
              borderRadius: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
            accessibilityRole="button"
            accessibilityLabel="Add to Space"
            testID="space-bottom-add"
          >
            <Plus size={18} color={BRAND.colors.mossGreen} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND.colors.mossGreen }}>
              Add to Space
            </Text>
          </Pressable>

          <Pressable
            onPress={handleChatButtonPress}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              backgroundColor: pressed ? '#254433' : BRAND.colors.mossGreen,
              borderRadius: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
            accessibilityRole="button"
            accessibilityLabel="Chat with Gremly"
            testID="space-bottom-chat"
          >
            <MessageSquare size={18} color={BRAND.colors.surface} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND.colors.surface }}>
              Chat with Gremly
            </Text>
          </Pressable>
        </View>

        {/* Micro celebration overlay */}
        <ConfettiBurst
          visible={showConfetti}
          durationMs={350}
          onComplete={() => setShowConfetti(false)}
        />
        {/* Phase 5: Removed CalendarOverlayV33, NotepadOverlayV33, UnifiedAddOverlay, EditGoalModal, RenameChatModal */}

        {/* Phase 6: Space Quick Add Modal */}
        <SpaceQuickAddModal
          visible={showQuickAddModal}
          spaceName={space?.name ?? 'Space'}
          onClose={() => setShowQuickAddModal(false)}
          onSubmit={handleQuickAddSubmit}
          onPressManualAdd={handleQuickAddManual}
          onPressAttachExisting={() => setShowAttachExistingModal(true)}
        />

        {/* Phase 6: Attach Existing Modal */}
        <AttachExistingModal
          visible={showAttachExistingModal}
          spaceId={spaceId}
          spaceName={space?.name ?? 'Space'}
          onClose={() => setShowAttachExistingModal(false)}
          onAttached={handleAttachExistingComplete}
        />

        {/* Pinned Items Modal */}
        <PinnedItemsModal
          visible={showPinnedModal}
          spaceId={spaceId}
          onClose={handlePinnedModalClose}
          onItemPress={handlePinnedItemPress}
          onUnpin={refetchPinned}
        />

        {/* Milestone Entry Modal */}
        <MilestoneEntryModal
          visible={showMilestoneModal}
          onClose={handleMilestoneModalClose}
          onSave={handleMilestoneSave}
          onRemove={milestone ? handleMilestoneRemove : undefined}
          initialName={milestone?.name}
          initialDate={milestone?.date ? new Date(milestone.date) : undefined}
          isEditing={!!milestone}
        />

        {/* Space Settings Modal */}
        <SpaceSettingsModal
          visible={showSettingsModal}
          onClose={handleSettingsClose}
          space={space}
          hasMilestone={!!milestone}
          onEditMilestone={handleEditMilestoneFromSettings}
          onSaveSpaceName={handleSaveSpaceName}
          onDeleteSpace={handleDeleteSpace}
          getSpaceItemCounts={getSpaceItemCounts}
        />

        {/* Completed Items Overlay */}
        <CompletedInSpaceOverlay
          spaceId={spaceId}
          spaceName={space?.name || 'this Space'}
          visible={showCompletedOverlay}
          onClose={() => setShowCompletedOverlay(false)}
          completedTodos={completedTodosForSpace}
          onRestore={handleRestoreTodo}
        />

        {/* Space Chat List Modal */}
        <SpaceChatListModal
          visible={chatListModalVisible}
          onClose={() => setChatListModalVisible(false)}
          spaceId={space?.id || spaceId}
          spaceName={space?.name || 'this Space'}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChatFromModal}
        />
      </View>
    );
  }

  if (!isSpaceV3) {
    if (__DEV__) console.log('[SpaceHome] render legacy (not v3)');
    // Legacy stacked layout fallback
    return (
      <View style={[styles.container, { backgroundColor: BRAND.colors.linenCream }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <SpaceBanner space={space} />

          {/* Top-level mode toggle: Actions vs Chats (Segmented Control) */}
          <View style={sectionStyles.actionsChatsContainer}>
            <View style={sectionStyles.actionsChatsSegmentedControl} testID="space-view-toggle">
              {(['actions', 'chats'] as const).map((mode) => {
                const isActive = spaceView === mode;
                const label = mode === 'actions' ? 'Actions' : 'Chats';
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setSpaceView(mode)}
                    style={sectionStyles.actionsChatsTab}
                    testID={`space-view-toggle-${mode}`}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        sectionStyles.actionsChatsTabText,
                        isActive
                          ? sectionStyles.actionsChatsTabActive
                          : sectionStyles.actionsChatsTabInactive,
                      ]}
                    >
                      {label}
                    </Text>
                    {isActive && <View style={sectionStyles.actionsChatsUnderline} />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Secondary category selector - only in Actions mode */}
          {spaceView === 'actions' && (
            <View
              style={{
                paddingHorizontal: CONTENT_HORIZONTAL_PAD,
                marginBottom: 20,
              }}
            >
              <SegmentedPills
                options={FILTER_OPTIONS}
                selected={filter}
                onSelect={handleFilterChange}
                variant="secondary"
                fullWidth
                testID="space-filter-bar"
              />
            </View>
          )}

          {/* Zone A removed - Add to Space moved to persistent bottom bar */}

          {/* ═══════════════════════════════════════════════════════════════════
              ZONE B — Content Zone (Legacy)
              ═══════════════════════════════════════════════════════════════════ */}
          <View testID="space-zone-b">
            {/* Unified compact items list - only shown in Actions mode */}
            {spaceView === 'actions' && (
              <View style={{ paddingBottom: 24 }}>
                {itemsToShow.length > 0 ? (
                  <View style={sectionStyles.itemsList}>
                    {itemsToShow.map((item: any, index: number) => {
                      const entityType = getEntityType(item);
                      const progress = entityType === 'habit' ? weeklyById.get(item.id) : undefined;
                      return (
                        <EntityCard
                          key={item.id}
                          record={item}
                          type={entityType}
                          onPress={() => handleItemPress(item)}
                          onToggleComplete={
                            entityType === 'todo' ? () => handleTodoComplete(item) : undefined
                          }
                          onLogProgress={
                            entityType === 'habit' ? () => handleHabitLogProgress(item) : undefined
                          }
                          showCheckbox={entityType === 'todo' || entityType === 'habit'}
                          showTypePill={true}
                          isFirst={index === 0}
                          completed={entityType === 'todo' && !!item.completed_at}
                          habitProgress={
                            progress
                              ? { done: progress.doneCount, target: progress.target }
                              : undefined
                          }
                          subtitle={
                            entityType === 'log'
                              ? formatRelativeDate(item.updated_at || item.created_at)
                              : entityType === 'list'
                                ? `${item.body ? (item.body.match(/^[-•*]\s/gm) || []).length : 0} items`
                                : undefined
                          }
                          testID={`space-compact-item-${item.id}`}
                        />
                      );
                    })}
                  </View>
                ) : (
                  <EmptySpaceState spaceName={space?.name || 'This space'} />
                )}

                {/* View X more pill */}
                {moreCount > 0 && (
                  <View style={{ alignItems: 'center', marginTop: 12 }}>
                    <Pressable
                      onPress={() => {
                        // TODO: Navigate to full filtered list view
                        console.log('[SpaceHome] View more pressed, moreCount:', moreCount);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed
                          ? 'rgba(191, 216, 192, 0.25)'
                          : 'rgba(191, 216, 192, 0.18)',
                        borderRadius: 999,
                        paddingVertical: 8,
                        paddingHorizontal: 16,
                      })}
                      testID="space-view-more"
                    >
                      <Text
                        style={{ fontSize: 13, fontWeight: '500', color: BRAND.colors.mossGreen }}
                      >
                        View {moreCount} more
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                CHATS MODE — Show only conversations (Legacy)
                ═══════════════════════════════════════════════════════════════════ */}
            {spaceView === 'chats' && (
              <View style={{ paddingTop: 4, paddingBottom: 24 }}>
                {/* New Chat CTA */}
                <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                  <Pressable
                    onPress={handleChatButtonPress}
                    testID="space-chat-cta"
                    accessibilityRole="button"
                    accessibilityLabel="Start a new chat with Gremly"
                    style={({ pressed }) => ({
                      backgroundColor: BRAND.colors.mossGreen,
                      borderRadius: 999,
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      opacity: pressed ? 0.9 : 1,
                      ...BRAND.elevation.one,
                    })}
                  >
                    <MessageSquare size={18} color={BRAND.colors.surface} />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: BRAND.colors.surface,
                      }}
                    >
                      Start a new chat with Gremly
                    </Text>
                  </Pressable>
                </View>

                {/* Conversations list */}
                {chats.length > 0 ? (
                  <View style={{ paddingHorizontal: 16 }}>
                    <View style={{ gap: 10 }}>
                      {chats.slice(0, 7).map((chat) => (
                        <ChatCard
                          key={chat.id}
                          chat={chat}
                          onPress={() => handleChatPress(chat.id)}
                          onPin={handlePinChat}
                          onUnpin={handleUnpinChat}
                          onRename={handleRenameChatV22}
                          onArchive={handleArchiveChat}
                          onDelete={handleDeleteChat}
                          aiSummary={
                            aiSummaries[chat.id] || chat.last_message_snippet
                              ? stripMarkdown(
                                  aiSummaries[chat.id] || chat.last_message_snippet || '',
                                )
                              : getRelativeTime(chat.updated_at)
                          }
                        />
                      ))}
                    </View>

                    {/* View older conversations pill */}
                    {chats.length > 7 && (
                      <View style={{ alignItems: 'center', marginTop: 12 }}>
                        <Pressable
                          onPress={() => {
                            // TODO: Navigate to full chat list
                            console.log('[SpaceHome] View older conversations pressed');
                          }}
                          style={({ pressed }) => ({
                            backgroundColor: pressed
                              ? 'rgba(191, 216, 192, 0.25)'
                              : 'rgba(191, 216, 192, 0.18)',
                            borderRadius: 999,
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                          })}
                          testID="space-view-older-chats"
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '500',
                              color: BRAND.colors.mossGreen,
                            }}
                          >
                            View {chats.length - 7} older conversations
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={{ paddingHorizontal: 16 }}>
                    <Text
                      style={{ fontSize: 14, color: BRAND.colors.inkSubtle, textAlign: 'center' }}
                    >
                      No conversations yet. Start chatting with Gremly!
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* ═══════════════════════════════════════════════════════════════════
            PERSISTENT BOTTOM ACTION BAR (Legacy)
            ═══════════════════════════════════════════════════════════════════ */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12 + insets.bottom,
            backgroundColor: BRAND.colors.linenCream,
            borderTopWidth: 1,
            borderTopColor: 'rgba(191, 216, 192, 0.3)',
            flexDirection: 'row',
            gap: 8,
          }}
          testID="space-bottom-action-bar"
        >
          <Pressable
            onPress={() => setShowQuickAddModal(true)}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              backgroundColor: pressed ? 'rgba(191, 216, 192, 0.4)' : 'rgba(191, 216, 192, 0.2)',
              borderWidth: 1,
              borderColor: 'rgba(191, 216, 192, 0.6)',
              borderRadius: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
            accessibilityRole="button"
            accessibilityLabel="Add to Space"
            testID="space-bottom-add"
          >
            <Plus size={18} color={BRAND.colors.mossGreen} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND.colors.mossGreen }}>
              Add to Space
            </Text>
          </Pressable>

          <Pressable
            onPress={handleChatButtonPress}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              backgroundColor: pressed ? '#254433' : BRAND.colors.mossGreen,
              borderRadius: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
            accessibilityRole="button"
            accessibilityLabel="Chat with Gremly"
            testID="space-bottom-chat"
          >
            <MessageSquare size={18} color={BRAND.colors.surface} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND.colors.surface }}>
              Chat with Gremly
            </Text>
          </Pressable>
        </View>

        {/* Micro celebration overlay */}
        <ConfettiBurst
          visible={showConfetti}
          durationMs={350}
          onComplete={() => setShowConfetti(false)}
        />
      </View>
    );
  }

  // (moved above)

  // (effect moved above to satisfy hooks rules)

  return (
    <View style={[styles.container, { backgroundColor: BRAND.colors.linenCream }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header: v22 Moss band or existing v4 minimal band */}
        {isSpaceV22 ? (
          <HeaderV22
            title={space?.name ?? 'Space'}
            lastVisited={buildLastVisitedLabel(items, chats)}
            contextLine={headerMood}
            onBack={() => navigation.goBack()}
            onSearch={() => {}}
            onSettings={() => Alert.alert('Settings', 'Coming soon')}
            mascotState={headerMascot}
            spaceId={spaceId}
          />
        ) : (
          <View
            style={{
              backgroundColor: lightTokens.colors.mossGreen,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                accessibilityLabel="Back"
                accessibilityRole="button"
              >
                <Text style={{ color: lightTokens.colors.linenCream, fontSize: 18 }}>‹</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text
                  style={{
                    color: lightTokens.colors.linenCream,
                    fontSize: 20,
                    fontWeight: '700',
                  }}
                  numberOfLines={1}
                >
                  {space?.name ?? 'Space'}
                </Text>
                <Text
                  style={{ color: lightTokens.colors.sageMist, fontSize: 12, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {buildLastVisitedLabel(items, chats)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => {}} accessibilityRole="button">
                  <SearchIcon color={lightTokens.colors.linenCream} size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert('Settings', 'Coming soon')}
                  accessibilityRole="button"
                >
                  <SettingsIcon color={lightTokens.colors.linenCream} size={18} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Top-level mode toggle: Actions vs Chats (Segmented Control) */}
        <View style={sectionStyles.actionsChatsContainer}>
          <View style={sectionStyles.actionsChatsSegmentedControl} testID="space-view-toggle">
            {(['actions', 'chats'] as const).map((mode) => {
              const isActive = spaceView === mode;
              const label = mode === 'actions' ? 'Actions' : 'Chats';
              return (
                <Pressable
                  key={mode}
                  onPress={() => setSpaceView(mode)}
                  style={sectionStyles.actionsChatsTab}
                  testID={`space-view-toggle-${mode}`}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      sectionStyles.actionsChatsTabText,
                      isActive
                        ? sectionStyles.actionsChatsTabActive
                        : sectionStyles.actionsChatsTabInactive,
                    ]}
                  >
                    {label}
                  </Text>
                  {isActive && <View style={sectionStyles.actionsChatsUnderline} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Secondary category selector - only in Actions mode */}
        {spaceView === 'actions' && (
          <View
            style={{
              paddingHorizontal: CONTENT_HORIZONTAL_PAD,
              marginBottom: 20,
            }}
          >
            <SegmentedPills
              options={FILTER_OPTIONS}
              selected={filter}
              onSelect={handleFilterChange}
              variant="secondary"
              fullWidth
              testID="space-filter-bar"
            />
          </View>
        )}

        {/* Zone A removed - Add to Space moved to persistent bottom bar */}

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE B — Content Zone (v22)
            ═══════════════════════════════════════════════════════════════════ */}
        <View testID="space-zone-b">
          {/* Unified compact items list - only shown in Actions mode */}
          {spaceView === 'actions' && (
            <View style={{ paddingBottom: 24 }}>
              {itemsToShow.length > 0 ? (
                <View style={sectionStyles.itemsList}>
                  {itemsToShow.map((item: any, index: number) => {
                    const entityType = getEntityType(item);
                    const progress = entityType === 'habit' ? weeklyById.get(item.id) : undefined;
                    return (
                      <EntityCard
                        key={item.id}
                        record={item}
                        type={entityType}
                        onPress={() => handleItemPress(item)}
                        onToggleComplete={
                          entityType === 'todo' ? () => handleTodoComplete(item) : undefined
                        }
                        onLogProgress={
                          entityType === 'habit' ? () => handleHabitLogProgress(item) : undefined
                        }
                        showCheckbox={entityType === 'todo' || entityType === 'habit'}
                        showTypePill={true}
                        isFirst={index === 0}
                        completed={entityType === 'todo' && !!item.completed_at}
                        habitProgress={
                          progress
                            ? { done: progress.doneCount, target: progress.target }
                            : undefined
                        }
                        subtitle={
                          entityType === 'log'
                            ? formatRelativeDate(item.updated_at || item.created_at)
                            : entityType === 'list'
                              ? `${item.body ? (item.body.match(/^[-•*]\s/gm) || []).length : 0} items`
                              : undefined
                        }
                        testID={`space-compact-item-${item.id}`}
                      />
                    );
                  })}
                </View>
              ) : (
                <EmptySpaceState spaceName={space?.name || 'This space'} />
              )}

              {/* View X more pill */}
              {moreCount > 0 && (
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <Pressable
                    onPress={() => {
                      // TODO: Navigate to full filtered list view
                      console.log('[SpaceHome] View more pressed, moreCount:', moreCount);
                    }}
                    style={({ pressed }) => ({
                      backgroundColor: pressed
                        ? 'rgba(191, 216, 192, 0.25)'
                        : 'rgba(191, 216, 192, 0.18)',
                      borderRadius: 999,
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                    })}
                    testID="space-view-more"
                  >
                    <Text
                      style={{ fontSize: 13, fontWeight: '500', color: BRAND.colors.mossGreen }}
                    >
                      View {moreCount} more
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              CHATS MODE — Show only conversations (v22)
              ═══════════════════════════════════════════════════════════════════ */}
          {spaceView === 'chats' && (
            <View style={{ paddingTop: 4, paddingBottom: 24 }}>
              {/* New Chat CTA */}
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <Pressable
                  onPress={handleChatButtonPress}
                  testID="space-chat-cta"
                  accessibilityRole="button"
                  accessibilityLabel="Start a new chat with Gremly"
                  style={({ pressed }) => ({
                    backgroundColor: BRAND.colors.mossGreen,
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    opacity: pressed ? 0.9 : 1,
                    ...BRAND.elevation.one,
                  })}
                >
                  <MessageSquare size={18} color={BRAND.colors.surface} />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: BRAND.colors.surface,
                    }}
                  >
                    Start a new chat with Gremly
                  </Text>
                </Pressable>
              </View>

              {/* Conversations list */}
              {chats.length > 0 ? (
                <View style={{ paddingHorizontal: 16 }}>
                  <View style={{ gap: 10 }}>
                    {chats.slice(0, 7).map((c) => (
                      <ThreadCard
                        key={c.id}
                        title={stripMarkdown(c.title || 'Chat')}
                        snippet={
                          aiSummaries[c.id] || c.last_message_snippet
                            ? stripMarkdown(aiSummaries[c.id] || c.last_message_snippet || '')
                            : getRelativeTime(c.updated_at)
                        }
                        lastActive={new Date(c.updated_at).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                        onOpen={() => handleChatPress(c.id)}
                        onMenu={() => {}}
                        onArchive={async () => {
                          try {
                            const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
                            if (
                              backend === 'supabase' &&
                              spaceChatRepo instanceof SupabaseSpaceChatRepo
                            ) {
                              await spaceChatRepo.archive(c.id);
                            } else {
                              await spaceChatRepo.delete(c.id);
                            }
                            await reload();
                          } catch (e) {
                            console.warn('Archive chat failed', e);
                            Alert.alert('Error', 'Failed to archive chat');
                          }
                        }}
                        onDelete={async () => {
                          try {
                            await spaceChatRepo.delete(c.id);
                            await reload();
                          } catch (e) {
                            console.warn('Delete chat failed', e);
                            Alert.alert('Error', 'Failed to delete chat');
                          }
                        }}
                      />
                    ))}
                  </View>

                  {/* View older conversations pill */}
                  {chats.length > 7 && (
                    <View style={{ alignItems: 'center', marginTop: 12 }}>
                      <Pressable
                        onPress={() => {
                          // TODO: Navigate to full chat list
                          console.log('[SpaceHome] View older conversations pressed');
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: pressed
                            ? 'rgba(191, 216, 192, 0.25)'
                            : 'rgba(191, 216, 192, 0.18)',
                          borderRadius: 999,
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                        })}
                        testID="space-view-older-chats"
                      >
                        <Text
                          style={{ fontSize: 13, fontWeight: '500', color: BRAND.colors.mossGreen }}
                        >
                          View {chats.length - 7} older conversations
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16 }}>
                  <Text
                    style={{ fontSize: 14, color: BRAND.colors.inkSubtle, textAlign: 'center' }}
                  >
                    No conversations yet. Start chatting with Gremly!
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════════
          PERSISTENT BOTTOM ACTION BAR (v22)
          ═══════════════════════════════════════════════════════════════════ */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12 + insets.bottom,
          backgroundColor: BRAND.colors.linenCream,
          borderTopWidth: 1,
          borderTopColor: 'rgba(191, 216, 192, 0.3)',
          flexDirection: 'row',
          gap: 8,
        }}
        testID="space-bottom-action-bar"
      >
        <Pressable
          onPress={() => setShowQuickAddModal(true)}
          style={({ pressed }) => ({
            flex: 1,
            height: 48,
            backgroundColor: pressed ? 'rgba(191, 216, 192, 0.4)' : 'rgba(191, 216, 192, 0.2)',
            borderWidth: 1,
            borderColor: 'rgba(191, 216, 192, 0.6)',
            borderRadius: 24,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
          accessibilityRole="button"
          accessibilityLabel="Add to Space"
          testID="space-bottom-add"
        >
          <Plus size={18} color={BRAND.colors.mossGreen} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND.colors.mossGreen }}>
            Add to Space
          </Text>
        </Pressable>

        <Pressable
          onPress={handleChatButtonPress}
          style={({ pressed }) => ({
            flex: 1,
            height: 48,
            backgroundColor: pressed ? '#254433' : BRAND.colors.mossGreen,
            borderRadius: 24,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with Gremly"
          testID="space-bottom-chat"
        >
          <MessageSquare size={18} color={BRAND.colors.surface} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND.colors.surface }}>
            Chat with Gremly
          </Text>
        </Pressable>
      </View>

      {/* Micro celebration overlay */}
      <ConfettiBurst
        visible={showConfetti}
        durationMs={350}
        onComplete={() => setShowConfetti(false)}
      />
      {/* Timeline overlay (v22) */}
      <TimelineOverlay
        visible={showTimeline}
        onClose={() => setShowTimeline(false)}
        spaceId={spaceId}
        onSelectDate={(iso) => {
          setSelectedDayISO(iso);
          setShowTimeline(false);
        }}
      />

      {/* Floating Plus removed in v3.3; v22 FAB retired */}

      {/* Sage toast for unsorted items */}
      {showUnsortedToast && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 96,
            alignSelf: 'center',
            backgroundColor: V22.Sage,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            opacity: unsortedOpacity,
          }}
        >
          <Text style={{ color: '#153326', fontWeight: '700' }}>
            1 unsorted item waiting in {space?.name || 'this Space'}.
          </Text>
        </Animated.View>
      )}

      {/* Undo snackbar (Sage) */}
      {showUndoToast && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 140,
            alignSelf: 'center',
            backgroundColor: V22.Sage,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: undoOpacity,
          }}
        >
          <Text style={{ color: '#153326', fontWeight: '700' }}>{undoText}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Undo completion"
            onPress={async () => {
              const fn = undoHandlerRef.current;
              setShowUndoToast(false);
              if (fn) {
                try {
                  await fn();
                } catch (e) {
                  console.warn('[v22] undo action failed', e);
                }
              }
            }}
          >
            <Text style={{ color: V22.Deep, fontWeight: '800' }}>Undo</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Space Chat List Modal */}
      <SpaceChatListModal
        visible={chatListModalVisible}
        onClose={() => setChatListModalVisible(false)}
        spaceId={space?.id || spaceId}
        spaceName={space?.name || 'this Space'}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChatFromModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: lightTokens.spacing[6], // will be overridden with token variable at runtime
  },
  content: {
    padding: lightTokens.spacing[4],
  },
  section: {
    marginBottom: lightTokens.spacing[4],
  },
  archivedBanner: {
    backgroundColor: '#FF9500', // Orange warning color
    padding: lightTokens.spacing[3],
    borderRadius: lightTokens.radius[2],
    marginBottom: lightTokens.spacing[4],
    alignItems: 'center',
  },
  archivedBannerText: {
    color: '#FFFFFF',
    fontSize: lightTokens.typography.size.sm,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
  },
  errorText: {
    fontSize: lightTokens.typography.size.lg,
    color: lightTokens.colors.danger,
  },
  emptyChats: {
    padding: lightTokens.spacing[5],
    alignItems: 'center',
    backgroundColor: lightTokens.colors.surface,
    borderRadius: lightTokens.radius[3],
    marginTop: lightTokens.spacing[3],
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
  },
  emptyChatsTitle: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[2],
    textAlign: 'center',
  },
  emptyChatsText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: lightTokens.spacing[4],
  },
  sectionTitle: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[3],
  },
  // FAB styles removed with v3.3 icon row
});

// Helpers
function computeLastTimeText(items: AppRecord[], chats: SpaceChat[]): string {
  const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
  const lastItemTs = items.reduce((acc, it: any) => {
    const ts = new Date(it.updated_at || it.created_at || 0).getTime();
    return Math.max(acc, ts);
  }, 0);
  const lastTs = Math.max(lastChatTs, lastItemTs);
  if (!lastTs) return 'Last time you were here, we set things up. Ready to explore?';
  const d = new Date(lastTs);
  return `Last time you were here on ${d.toLocaleDateString()}.`;
}

// Build concise one-line summary
function buildSummaryHeadline(
  email: string,
  chatsActive: number,
  habitsCompleted: number,
  habitsTotal: number,
): string {
  const first = deriveFirstName(email);
  const base = `${first}, ${chatsActive} chats this week — ${habitsCompleted}/${habitsTotal} habits done.`;
  return base.replace(/\s+/g, ' ').trim().slice(0, 110);
}

function deriveFirstName(email: string): string {
  if (!email) return 'You';
  const namePart = email.split('@')[0] || 'You';
  const cleaned = namePart.replace(/[._-]+/g, ' ');
  const cap = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cap || 'You';
}

// v4 helpers
function buildLastVisitedLabel(items: AppRecord[], chats: SpaceChat[]): string {
  const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
  const lastItemTs = items.reduce((acc, it: any) => {
    const ts = new Date(it.updated_at || it.created_at || 0).getTime();
    return Math.max(acc, ts);
  }, 0);
  const lastTs = Math.max(lastChatTs, lastItemTs);
  if (!lastTs) return 'Welcome — new space';
  const d = new Date(lastTs);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return 'Last visited today';
  return `Last visited ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

// v22 helpers
function buildMockWeek(selectedISO: string) {
  const start = startOfWeek(new Date());
  const todayISO = formatISO(new Date(), { representation: 'date' });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const iso = formatISO(d, { representation: 'date' });
    return {
      dateISO: iso,
      isActive: iso === todayISO,
      isSelected: iso === selectedISO,
      hasItems: false,
    };
  });
}

function buildFocusText(habitCount: number, upcoming: Array<{ id: string }>, todos: any[]): string {
  const parts: string[] = [];
  if (habitCount > 0) parts.push(`${habitCount} habit${habitCount > 1 ? 's' : ''}`);
  if (upcoming && upcoming.length > 0) parts.push(`${upcoming.length} upcoming`);
  if (todos && todos.length > 0) parts.push(`${todos.length} to-do${todos.length > 1 ? 's' : ''}`);
  if (parts.length === 0) return 'All clear — take a moment to reflect.';
  return parts.join(' • ');
}

function buildCalendarDays(items: AppRecord[]): Array<{
  date: Date;
  hasTodos?: boolean;
  hasNotes?: boolean;
  hasHabits?: boolean;
}> {
  const start = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_v, i) => addDays(start, i));
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return days.map((d) => {
    const hasTodos = items.some((it: any) => {
      if (it.type !== 'todo') return false;
      const due = it.due_date ? new Date(it.due_date) : null;
      const created = it.created_at ? new Date(it.created_at) : null;
      return (due && isSameDay(d, due)) || (created && isSameDay(d, created));
    });
    const hasNotes = items.some((it: any) => {
      if (it.type !== 'note') return false;
      const created = it.created_at ? new Date(it.created_at) : null;
      return created ? isSameDay(d, created) : false;
    });
    const hasHabits = items.some((it: any) => {
      if (it.type !== 'habit') return false;
      const created = it.created_at ? new Date(it.created_at) : null;
      return created ? isSameDay(d, created) : false;
    });
    return { date: d, hasTodos, hasNotes, hasHabits };
  });
}

type DisplayKind = CanonicalType | 'note';

function deriveDisplayLabels(
  recordType: RecordType,
  subtype: string | null | undefined,
  canonicalTypesOn: boolean,
): { singular: string; plural: string } {
  const mapped = kindToDisplayLabel(recordType, subtype ?? null, canonicalTypesOn);
  return mapDisplayKindToForms(mapped);
}

function mapDisplayKindToForms(kind: DisplayKind): { singular: string; plural: string } {
  switch (kind) {
    case 'habit':
      return { singular: 'Habit', plural: 'Habits' };
    case 'todo':
      return { singular: 'To-Do', plural: 'To-Dos' };
    case 'log':
      return { singular: 'Log', plural: 'Logs' };
    case 'unsorted':
      return { singular: 'Unsorted', plural: 'Unsorted' };
    case 'note':
    default:
      return { singular: 'Note', plural: 'Notes' };
  }
}
