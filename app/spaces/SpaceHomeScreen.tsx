/**
 * SpaceHomeScreen - Space v3 layout
 * Header + context + summary + upcoming + progress + tabs (compact)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Search as SearchIcon, Settings as SettingsIcon } from '../../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useSpaceTimeline from '../../hooks/useSpaceTimeline';
import { useSpaceNotes } from '../../hooks/useSpaceNotes';
// v33 components (Space v3.3)
import HeaderV33 from '../../components/spaces/v33/Header';
import NotepadOverlayV33 from '../../components/spaces/v33/Overlays/NotepadOverlay';
import UnifiedAddOverlay from '../../components/spaces/v33/Overlays/UnifiedAddOverlay';
import RenameChatModal from '../../components/spaces/v33/Overlays/RenameChatModal';
import { getWittyLine, type Mood } from '../../lib/ai/moodLines';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import type { CanonicalType } from '../../lib/cortex/canonicalMap';
import { BRAND } from '../../design/brand';
// Phase 6: Space quick add imports
import { SpaceQuickAddModal } from '../../components/spaces/SpaceQuickAddModal';
import { AttachExistingModal } from '../../components/spaces/AttachExistingModal';
import { useSpaceQuickAdd } from '../../lib/spaces/useSpaceQuickAdd';

type Props = NativeStackScreenProps<RootStackParamList, 'SpaceHome'>;

// ============================================================================
// FILTER BAR TYPES & COMPONENTS
// ============================================================================

type FilterTab = 'all' | 'todos' | 'habits' | 'logs' | 'lists';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todos', label: 'Todos' },
  { key: 'habits', label: 'Habits' },
  { key: 'logs', label: 'Logs' },
  { key: 'lists', label: 'Lists' },
];

/** Filter bar component for Space sections - styled with Sage Mist pill for active */
function SpaceFilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
}) {
  return (
    <View style={filterBarStyles.container} testID="space-filter-bar">
      {FILTER_TABS.map((tab) => {
        const isActive = activeFilter === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onFilterChange(tab.key)}
            style={[filterBarStyles.tab, isActive && filterBarStyles.tabActive]}
            testID={`space-filter-${tab.key}`}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${tab.label}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[filterBarStyles.tabText, isActive && filterBarStyles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Filter bar styles */
const filterBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 24, // 24px per design spec
  },
  tab: {
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: BRAND.colors.mossGreen, // Moss Green underline
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle, // Charcoal at 70%
  },
  tabTextActive: {
    fontWeight: '600',
    color: BRAND.colors.mossGreen, // Moss Green text
  },
});

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

/** Section header matching Today/MindDrop styling */
function SpaceSectionHeader({
  title,
  count,
  testID,
}: {
  title: string;
  count?: number;
  testID?: string;
}) {
  return (
    <View style={sectionStyles.headerContainer} testID={testID}>
      <Text style={sectionStyles.headerText}>
        {title}
        {count !== undefined && count > 0 && (
          <Text style={sectionStyles.headerCount}> ({count})</Text>
        )}
      </Text>
    </View>
  );
}

/** Helper to get display type label */
function getItemTypeLabel(item: AppRecord): string {
  if (item.type === 'habit') return 'Habit';
  if (item.type === 'todo') return 'Todo';
  if (item.type === 'note') {
    const subtype = (item as any).subtype;
    if (subtype === 'journal') return 'Log';
    if (subtype === 'list' || (item as any).is_list) return 'List';
    if (subtype === 'idea') return 'Idea';
    return 'Note';
  }
  return 'Item';
}

/** Helper to get item title with fallback */
function getItemTitle(item: AppRecord): string {
  if (item.type === 'habit' || item.type === 'todo') {
    return (item as any).name || (item as any).title || 'Untitled';
  }
  if (item.type === 'note') {
    const title = (item as any).title;
    const body = (item as any).body;
    if (title) return title;
    if (body) return body.slice(0, 50) + (body.length > 50 ? '...' : '');
    return 'Untitled';
  }
  return 'Untitled';
}

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

/** Recent Activity Section - shows 5 most recently updated items */
function RecentActivitySection({
  items,
  onItemPress,
  testID,
}: {
  items: AppRecord[];
  onItemPress: (item: AppRecord) => void;
  testID?: string;
}) {
  const recentItems = React.useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const aDate = new Date((a as any).updated_at || (a as any).created_at || 0).getTime();
      const bDate = new Date((b as any).updated_at || (b as any).created_at || 0).getTime();
      return bDate - aDate;
    });
    return sorted.slice(0, 5);
  }, [items]);

  return (
    <View style={sectionStyles.section} testID={testID}>
      <SpaceSectionHeader title="Recent activity" testID={`${testID}-header`} />
      {recentItems.length === 0 ? (
        <View style={sectionStyles.emptyState} testID={`${testID}-empty`}>
          <Text style={sectionStyles.emptyStateIcon}>📭</Text>
          <Text style={sectionStyles.emptyStateText}>No recent activity in this space</Text>
          <Text style={sectionStyles.emptyStateSubtext}>
            Add habits, todos, or notes to see them here
          </Text>
        </View>
      ) : (
        <View style={sectionStyles.itemsList}>
          {recentItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onItemPress(item)}
              style={({ pressed }) => [
                sectionStyles.itemRow,
                pressed && sectionStyles.itemRowPressed,
              ]}
              testID={`${testID}-item-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${getItemTitle(item)}, ${getItemTypeLabel(item)}`}
            >
              <View style={sectionStyles.itemContent}>
                <Text style={sectionStyles.itemTitle} numberOfLines={1}>
                  {getItemTitle(item)}
                </Text>
                <Text style={sectionStyles.itemType}>{getItemTypeLabel(item)}</Text>
              </View>
              <Text style={sectionStyles.itemChevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Todos Section - shows incomplete todos for this space */
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
  const todos = React.useMemo(() => {
    return listTodosForSpace(items, spaceId).filter((t: any) => !t.completed_at);
  }, [items, spaceId]);

  if (todos.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <SpaceSectionHeader
        title="Todos for this Space"
        count={todos.length}
        testID={`${testID}-header`}
      />
      <View style={sectionStyles.itemsList}>
        {todos.map((todo: any) => (
          <Pressable
            key={todo.id}
            onPress={() => onItemPress(todo)}
            style={({ pressed }) => [
              sectionStyles.todoRow,
              pressed && sectionStyles.itemRowPressed,
            ]}
            testID={`${testID}-item-${todo.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Todo: ${todo.name || 'Untitled'}`}
          >
            <Pressable
              onPress={() => onToggleComplete(todo)}
              style={sectionStyles.checkbox}
              testID={`${testID}-checkbox-${todo.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`Mark ${todo.name || 'todo'} as complete`}
            >
              <View style={sectionStyles.checkboxInner} />
            </Pressable>
            <View style={sectionStyles.todoContent}>
              <Text style={sectionStyles.todoTitle} numberOfLines={1}>
                {todo.name || 'Untitled'}
              </Text>
              {todo.due_date && (
                <Text style={sectionStyles.todoDueDate}>
                  Due: {formatRelativeDate(todo.due_date)}
                </Text>
              )}
            </View>
            <Text style={sectionStyles.itemChevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Habits Section - shows habits with weekly progress */
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
  const habits = React.useMemo(() => listHabitsForSpace(items, spaceId), [items, spaceId]);
  const weeklyById = React.useMemo(() => {
    const map = new Map<string, { doneCount: number; target: number }>();
    (weekly?.habits || []).forEach((h) =>
      map.set(h.id, { doneCount: h.doneCount, target: h.target }),
    );
    return map;
  }, [weekly]);

  if (habits.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <SpaceSectionHeader
        title="Habits for this Space"
        count={habits.length}
        testID={`${testID}-header`}
      />
      <View style={sectionStyles.itemsList}>
        {habits.map((habit: any) => {
          const progress = weeklyById.get(habit.id);
          const doneCount = progress?.doneCount ?? 0;
          const target = progress?.target ?? 3;
          return (
            <Pressable
              key={habit.id}
              onPress={() => onItemPress(habit)}
              style={({ pressed }) => [
                sectionStyles.habitRow,
                pressed && sectionStyles.itemRowPressed,
              ]}
              testID={`${testID}-item-${habit.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Habit: ${habit.name || 'Untitled'}, ${doneCount} of ${target} this week`}
            >
              <Pressable
                onPress={() => onLogProgress(habit)}
                style={sectionStyles.habitProgressButton}
                testID={`${testID}-log-${habit.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Log progress for ${habit.name || 'habit'}`}
              >
                <Text style={sectionStyles.habitProgressIcon}>+</Text>
              </Pressable>
              <View style={sectionStyles.habitContent}>
                <Text style={sectionStyles.habitTitle} numberOfLines={1}>
                  {habit.name || 'Untitled'}
                </Text>
                <Text style={sectionStyles.habitProgress}>
                  {doneCount}/{target} this week
                </Text>
              </View>
              <View style={sectionStyles.habitProgressBar}>
                <View
                  style={[
                    sectionStyles.habitProgressFill,
                    { width: `${Math.min(100, (doneCount / target) * 100)}%` },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Logs/Notes Section - shows journal, idea, reference notes (excludes lists) */
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
  const logs = React.useMemo(() => {
    const notes = listNotesForSpace(items, spaceId);
    return notes
      .filter((n: any) => {
        const subtype = n.subtype;
        return subtype === 'journal' || subtype === 'idea' || subtype === 'reference' || !subtype;
      })
      .filter((n: any) => !n.is_list);
  }, [items, spaceId]);

  if (logs.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <SpaceSectionHeader title="Logs / Notes" count={logs.length} testID={`${testID}-header`} />
      <View style={sectionStyles.itemsList}>
        {logs.slice(0, 10).map((log: any) => {
          const icon = log.subtype === 'journal' ? '📝' : log.subtype === 'idea' ? '💡' : '📄';
          const typeLabel =
            log.subtype === 'journal' ? 'Log' : log.subtype === 'idea' ? 'Idea' : 'Note';
          return (
            <Pressable
              key={log.id}
              onPress={() => onItemPress(log)}
              style={({ pressed }) => [
                sectionStyles.logRow,
                pressed && sectionStyles.itemRowPressed,
              ]}
              testID={`${testID}-item-${log.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${typeLabel}: ${log.title || 'Untitled'}`}
            >
              <Text style={sectionStyles.logIcon}>{icon}</Text>
              <View style={sectionStyles.logContent}>
                <Text style={sectionStyles.logTitle} numberOfLines={1}>
                  {log.title || (log.body ? log.body.slice(0, 40) + '...' : 'Untitled')}
                </Text>
                <View style={sectionStyles.logMeta}>
                  <Text style={sectionStyles.logType}>{typeLabel}</Text>
                  <Text style={sectionStyles.logDate}>
                    {formatRelativeDate(log.updated_at || log.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={sectionStyles.itemChevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Lists Section - shows notes with is_list=true or subtype='list' */
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
  const lists = React.useMemo(() => {
    const notes = listNotesForSpace(items, spaceId);
    return notes.filter((n: any) => n.is_list || n.subtype === 'list');
  }, [items, spaceId]);

  if (lists.length === 0) return null;

  return (
    <View style={sectionStyles.section} testID={testID}>
      <SpaceSectionHeader title="Lists" count={lists.length} testID={`${testID}-header`} />
      <View style={sectionStyles.itemsList}>
        {lists.map((list: any) => {
          const itemCount = list.body ? (list.body.match(/^[-•*]\s/gm) || []).length : 0;
          return (
            <Pressable
              key={list.id}
              onPress={() => onItemPress(list)}
              style={({ pressed }) => [
                sectionStyles.listRow,
                pressed && sectionStyles.itemRowPressed,
              ]}
              testID={`${testID}-item-${list.id}`}
              accessibilityRole="button"
              accessibilityLabel={`List: ${list.title || 'Untitled'}`}
            >
              <Text style={sectionStyles.listIcon}>📋</Text>
              <View style={sectionStyles.listContent}>
                <Text style={sectionStyles.listTitle} numberOfLines={1}>
                  {list.title || 'Untitled List'}
                </Text>
                <Text style={sectionStyles.listMeta}>
                  {itemCount > 0 ? `${itemCount} items` : 'List'}
                </Text>
              </View>
              <Text style={sectionStyles.itemChevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Section styles - matches Gremly design system (EntryCard, Today screen) */
const sectionStyles = StyleSheet.create({
  // Section header - matches Today screen typography
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    letterSpacing: -0.3,
  },
  headerCount: {
    fontSize: 16,
    fontWeight: '400',
    color: BRAND.colors.inkSubtle,
  },
  section: {
    marginBottom: 16,
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
  emptyStateIcon: {
    fontSize: 36,
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

  // Items list - card container
  itemsList: {
    marginHorizontal: 16,
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.md,
    ...BRAND.elevation.one,
    overflow: 'hidden',
  },

  // Item row - Recent Activity
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.sageMist,
  },
  itemRowPressed: {
    opacity: 0.8,
    backgroundColor: BRAND.colors.sageMist,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  itemType: {
    fontSize: 11,
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '500',
  },
  itemChevron: {
    fontSize: 18,
    color: BRAND.colors.inkSubtle,
    marginLeft: 8,
  },

  // Todo row
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.sageMist,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  todoContent: {
    flex: 1,
    gap: 4,
  },
  todoTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  todoDueDate: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
  },

  // Habit row
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.sageMist,
  },
  habitProgressButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    ...BRAND.elevation.one,
  },
  habitProgressIcon: {
    color: BRAND.colors.surface,
    fontSize: 20,
    fontWeight: '600',
  },
  habitContent: {
    flex: 1,
    gap: 4,
  },
  habitTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  habitProgress: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
  },
  habitProgressBar: {
    width: 56,
    height: 6,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: 3,
    overflow: 'hidden',
    marginLeft: 8,
  },
  habitProgressFill: {
    height: '100%',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 3,
  },

  // Log/Note row
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.sageMist,
  },
  logIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  logContent: {
    flex: 1,
    gap: 4,
  },
  logTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  logMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  logType: {
    fontSize: 11,
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '500',
  },
  logDate: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
  },

  // List row
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.sageMist,
  },
  listIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  listContent: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  listMeta: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
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

  // NEW: Filter bar state
  const [filter, setFilter] = useState<FilterTab>('all');

  // Phase 6: Quick add state
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showAttachExistingModal, setShowAttachExistingModal] = useState(false);
  const [optimisticQuickAdd, setOptimisticQuickAdd] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const overlay = useGlobalOverlay();

  // Handler for item press (opens view overlay for read-only mode)
  const handleItemPress = useCallback(
    (item: AppRecord) => {
      console.log('[SpaceHome] Item pressed:', item.id, item.type);
      overlay.openView({ record: item, spaceId });
    },
    [overlay, spaceId],
  );

  // Handler for todo completion
  const handleTodoComplete = useCallback(
    async (item: AppRecord) => {
      console.log('[SpaceHome] Todo complete:', item.id);
      try {
        await repo.completeTodo(item.id, new Date().toISOString());
        setShowConfetti(true);
        await reload();
      } catch (e) {
        console.warn('[SpaceHome] Failed to complete todo:', e);
        Alert.alert('Error', 'Failed to complete todo');
      }
    },
    [repo, reload],
  );

  // Handler for habit progress logging
  const handleHabitLogProgress = useCallback(
    async (item: AppRecord) => {
      console.log('[SpaceHome] Habit log progress:', item.id);
      try {
        await repo.logHabitProgress(item.id, new Date().toISOString());
        setShowConfetti(true);
        await reload();
      } catch (e) {
        console.warn('[SpaceHome] Failed to log habit progress:', e);
        Alert.alert('Error', 'Failed to log progress');
      }
    },
    [repo, reload],
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
    try {
      const newChat = await spaceChatRepo.create(spaceId, {
        title: 'New Chat',
      });
      // TODO: Fire analytics
      // analytics.track('space_chat_created', { spaceId, chatId: newChat.id });
      console.log('[Analytics] space_chat_created', { spaceId, chatId: newChat.id }); // Phase 8 polish
      navigation.navigate('ChatThread', { spaceId, chatId: newChat.id });
      reload();
    } catch (error) {
      console.error('Failed to create chat:', error);
      Alert.alert('Error', 'Failed to create chat');
    }
  }, [spaceId, spaceChatRepo, navigation, reload]);

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

  if (loading && !space) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={T.colors.primary} />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Space not found</Text>
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
      <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
        <Animated.View style={{ flex: 1, opacity: oV33, transform: [{ translateY: yV33 }] }}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            <HeaderV33
              title={space?.name ?? 'Space'}
              lastVisited={buildLastVisitedLabel(items, chats)}
              wittyLine={v33WittyLine}
              mood={v33Mood}
            />

            {/* Phase 5: Simple chat CTA row */}
            <Pressable
              onPress={handleNewChat}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 14, color: BRAND.colors.mossGreen }}>
                💬 Chat with Gremly about this space
              </Text>
            </Pressable>

            {/* "Captured in this Space" label */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: BRAND.colors.inkSubtle,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                Captured in this Space
              </Text>
            </View>

            {/* Phase 6: Add to Space CTA */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <Pressable
                onPress={() => setShowQuickAddModal(true)}
                style={({ pressed }) => ({
                  backgroundColor: BRAND.colors.linenCream,
                  borderRadius: BRAND.radius.md,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  ...BRAND.elevation.one,
                  opacity: pressed ? 0.8 : 1,
                })}
                testID="space-add-to-space-cta"
                accessibilityRole="button"
                accessibilityLabel="Add to Space"
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: BRAND.colors.sageMist,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontSize: 18, color: BRAND.colors.mossGreen }}>+</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: BRAND.colors.charcoalInk,
                    }}
                  >
                    + Add to Space
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: BRAND.colors.inkSubtle,
                      marginTop: 2,
                    }}
                  >
                    Drop a thought, todo, or habit
                  </Text>
                </View>
              </Pressable>

              {/* Attach existing link */}
              <Pressable
                onPress={() => setShowAttachExistingModal(true)}
                style={{ paddingVertical: 8, alignItems: 'center' }}
                testID="space-attach-existing-cta"
                accessibilityRole="button"
                accessibilityLabel="Attach existing item"
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: BRAND.colors.inkSubtle,
                    textDecorationLine: 'underline',
                  }}
                >
                  Attach existing item
                </Text>
              </Pressable>

              {/* Optimistic quick add card */}
              {optimisticQuickAdd && (
                <View
                  style={{
                    backgroundColor: BRAND.colors.sageMist,
                    borderRadius: BRAND.radius.md,
                    padding: 14,
                    marginTop: 8,
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
            </View>

            {/* Filter bar */}
            <SpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

            {/* Phase 5: Removed SearchOverlayV33, GoalsZone, IconRowV33, GoalListV33, NewChatSectionV33, ThreadCardV33 */}

            {/* Recent Activity - ALWAYS shows regardless of filter */}
            <RecentActivitySection
              items={items}
              onItemPress={handleItemPress}
              testID="space-section-recent-activity"
            />

            {/* Filtered sections based on active filter */}
            {(filter === 'all' || filter === 'todos') && (
              <TodosSection
                items={items}
                spaceId={spaceId}
                onItemPress={handleItemPress}
                onToggleComplete={handleTodoComplete}
                testID="space-section-todos"
              />
            )}
            {(filter === 'all' || filter === 'habits') && (
              <HabitsSection
                items={items}
                spaceId={spaceId}
                weekly={weekly}
                onItemPress={handleItemPress}
                onLogProgress={handleHabitLogProgress}
                testID="space-section-habits"
              />
            )}
            {(filter === 'all' || filter === 'logs') && (
              <LogsNotesSection
                items={items}
                spaceId={spaceId}
                onItemPress={handleItemPress}
                testID="space-section-logs-notes"
              />
            )}
            {(filter === 'all' || filter === 'lists') && (
              <ListsSection
                items={items}
                spaceId={spaceId}
                onItemPress={handleItemPress}
                testID="space-section-lists"
              />
            )}

            {/* Recent Chats (simplified) */}
            {chats.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 16,
                    color: T.colors.text,
                    marginBottom: 12,
                  }}
                >
                  Recent conversations
                </Text>
                <View style={{ gap: 10 }}>
                  {chats.slice(0, 3).map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => navigation.navigate('ChatThread', { spaceId, chatId: c.id })}
                      style={{
                        backgroundColor: BRAND.colors.linenCream,
                        borderRadius: BRAND.radius.md,
                        padding: 14,
                        ...BRAND.elevation.one,
                      }}
                    >
                      <Text
                        style={{ fontSize: 15, fontWeight: '500', color: BRAND.colors.charcoalInk }}
                        numberOfLines={1}
                      >
                        {c.title || 'Chat'}
                      </Text>
                      <Text style={{ fontSize: 12, color: BRAND.colors.inkSubtle, marginTop: 4 }}>
                        {c.last_message_snippet || 'Tap to view'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>

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
        />

        {/* Phase 6: Attach Existing Modal */}
        <AttachExistingModal
          visible={showAttachExistingModal}
          spaceId={spaceId}
          spaceName={space?.name ?? 'Space'}
          onClose={() => setShowAttachExistingModal(false)}
          onAttached={handleAttachExistingComplete}
        />
      </View>
    );
  }

  if (!isSpaceV3) {
    if (__DEV__) console.log('[SpaceHome] render legacy (not v3)');
    // Legacy stacked layout fallback
    return (
      <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <SpaceBanner space={space} />

          {/* Filter bar */}
          <SpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

          {/* Recent Activity - ALWAYS shows regardless of filter */}
          <RecentActivitySection
            items={items}
            onItemPress={handleItemPress}
            testID="space-section-recent-activity"
          />

          {/* Filtered sections based on active filter */}
          {(filter === 'all' || filter === 'todos') && (
            <TodosSection
              items={items}
              spaceId={spaceId}
              onItemPress={handleItemPress}
              onToggleComplete={handleTodoComplete}
              testID="space-section-todos"
            />
          )}
          {(filter === 'all' || filter === 'habits') && (
            <HabitsSection
              items={items}
              spaceId={spaceId}
              weekly={weekly}
              onItemPress={handleItemPress}
              onLogProgress={handleHabitLogProgress}
              testID="space-section-habits"
            />
          )}
          {(filter === 'all' || filter === 'logs') && (
            <LogsNotesSection
              items={items}
              spaceId={spaceId}
              onItemPress={handleItemPress}
              testID="space-section-logs-notes"
            />
          )}
          {(filter === 'all' || filter === 'lists') && (
            <ListsSection
              items={items}
              spaceId={spaceId}
              onItemPress={handleItemPress}
              testID="space-section-lists"
            />
          )}

          <View style={[styles.content, { padding: T.spacing[4] }]}>
            <Text style={styles.sectionTitle}>Chats</Text>
            {chats.length === 0 ? (
              <View style={styles.emptyChats}>
                <Text style={styles.emptyChatsTitle}>No chats yet</Text>
                <Text style={styles.emptyChatsText}>
                  Start a conversation with Gremly to plan, reflect, and track progress.
                </Text>
                <TouchableOpacity onPress={handleNewChat} accessibilityRole="button">
                  <Text style={{ color: T.colors.primary, fontWeight: '600' }}>New chat</Text>
                </TouchableOpacity>
              </View>
            ) : (
              chats
                .slice(0, 5)
                .map((chat) => (
                  <ChatCard
                    key={chat.id}
                    chat={chat}
                    onPress={() => handleChatPress(chat.id)}
                    onPin={handlePinChat}
                    onUnpin={handleUnpinChat}
                    onRename={handleRenameChatV22}
                    onArchive={handleArchiveChat}
                    onDelete={handleDeleteChat}
                    aiSummary={aiSummaries[chat.id] || chat.last_message_snippet || 'Tap to view'}
                  />
                ))
            )}

            <View style={{ height: T.spacing[4] }} />
            <Text style={styles.sectionTitle}>Habits</Text>
            {habits.slice(0, 5).map((h) => (
              <Text key={h.id} style={{ color: T.colors.text, marginBottom: 8 }}>
                {h.name}
              </Text>
            ))}

            <View style={{ height: T.spacing[4] }} />
            <Text style={styles.sectionTitle}>To-Dos</Text>
            {todos.slice(0, 5).map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: T.colors.text, flex: 1 }}>{t.name}</Text>
                <TouchableOpacity
                  accessibilityLabel={`Complete to-do '${t.name}'`}
                  accessibilityRole="button"
                  onPress={async () => {
                    try {
                      await repo.completeTodo(t.id, new Date().toISOString());
                      setShowConfetti(true);
                      await reload();
                    } catch (e) {
                      console.warn('Failed to complete todo', e);
                    }
                  }}
                >
                  <Text style={{ color: T.colors.primary }}>✓</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ height: T.spacing[4] }} />
            <Text style={styles.sectionTitle}>{NOTE_SECTION_LABELS.plural}</Text>
            {notes.slice(0, 5).map((n) => (
              <Text key={n.id} style={{ color: T.colors.text, marginBottom: 8 }}>
                {n.title}
              </Text>
            ))}
          </View>
        </ScrollView>

        {/* Floating FAB removed in v3.3; use IconRow + button actions instead */}

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
    <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
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

        {/* Filter bar */}
        <SpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

        {/* Recent Activity - ALWAYS shows regardless of filter */}
        <RecentActivitySection
          items={items}
          onItemPress={handleItemPress}
          testID="space-section-recent-activity"
        />

        {/* Filtered sections based on active filter */}
        {(filter === 'all' || filter === 'todos') && (
          <TodosSection
            items={items}
            spaceId={spaceId}
            onItemPress={handleItemPress}
            onToggleComplete={handleTodoComplete}
            testID="space-section-todos"
          />
        )}
        {(filter === 'all' || filter === 'habits') && (
          <HabitsSection
            items={items}
            spaceId={spaceId}
            weekly={weekly}
            onItemPress={handleItemPress}
            onLogProgress={handleHabitLogProgress}
            testID="space-section-habits"
          />
        )}
        {(filter === 'all' || filter === 'logs') && (
          <LogsNotesSection
            items={items}
            spaceId={spaceId}
            onItemPress={handleItemPress}
            testID="space-section-logs-notes"
          />
        )}
        {(filter === 'all' || filter === 'lists') && (
          <ListsSection
            items={items}
            spaceId={spaceId}
            onItemPress={handleItemPress}
            testID="space-section-lists"
          />
        )}

        {/* Phase 5: Removed v22-specific components (WeekStripV22, FocusTodayCard, WeeklyGoalCard, DayPanelV22, NewChatCTA, AdaptiveSummaryV22, InsightsRow) */}
        {/* v22 now uses the same simplified section layout - just add simple chat CTA */}

        {/* Simple chat CTA for v22 */}
        {isSpaceV22 && (
          <Pressable
            onPress={handleNewChat}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              marginTop: 16,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 14, color: BRAND.colors.mossGreen }}>
              💬 Chat with Gremly about this space
            </Text>
          </Pressable>
        )}

        {/* Recent chats (v22) - simplified */}
        {isSpaceV22 && chats.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Text
              style={{ fontWeight: '600', fontSize: 16, color: T.colors.text, marginBottom: 12 }}
            >
              Recent conversations
            </Text>
            <View style={{ gap: 10 }}>
              {chats.slice(0, 3).map((c) => (
                <ThreadCard
                  key={c.id}
                  title={c.title}
                  snippet={aiSummaries[c.id] || c.last_message_snippet || 'Tap to view'}
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
                      const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
                      if (
                        backend === 'supabase' &&
                        spaceChatRepo instanceof SupabaseSpaceChatRepo
                      ) {
                        await spaceChatRepo.delete(c.id);
                      } else {
                        await spaceChatRepo.delete(c.id);
                      }
                      await reload();
                    } catch (e) {
                      console.warn('Delete chat failed', e);
                      Alert.alert('Error', 'Failed to delete chat');
                    }
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTokens.colors.bg,
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
    backgroundColor: lightTokens.colors.bg,
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
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
