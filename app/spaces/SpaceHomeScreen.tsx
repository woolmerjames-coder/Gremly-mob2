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
import {
  Search as SearchIcon,
  Settings as SettingsIcon,
  MessageSquare,
} from '../../components/icons';
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

/** Filter bar component for Space sections - styled as centered pill selector (matches UnifiedOverlayV2) */
function SpaceFilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
}) {
  return (
    <View style={filterBarStyles.wrapper} testID="space-filter-bar">
      <View style={filterBarStyles.container}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onFilterChange(tab.key)}
              style={[filterBarStyles.pill, isActive && filterBarStyles.pillActive]}
              testID={`space-filter-${tab.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${tab.label}`}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[filterBarStyles.pillText, isActive && filterBarStyles.pillTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Filter bar styles - centered pill selector (matches UnifiedOverlayV2 type selector) */
const filterBarStyles = StyleSheet.create({
  // Outer wrapper - transparent, just spacing
  wrapper: {
    paddingVertical: 16,
    marginBottom: 16, // Spacing before sections
  },
  // Matches UnifiedOverlayV2 tabsContainer exactly
  container: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: 'rgba(191, 216, 192, 0.18)', // Sage Mist at 18%
    padding: 2,
    alignSelf: 'center',
  },
  // Matches UnifiedOverlayV2 tab
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  // Matches UnifiedOverlayV2 tabActive
  pillActive: {
    backgroundColor: 'rgba(46, 85, 64, 0.08)', // Moss Green at 8%
  },
  // Matches UnifiedOverlayV2 tabLabel
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A8F8A', // Muted sage
  },
  // Matches UnifiedOverlayV2 tabLabelActive
  pillTextActive: {
    fontWeight: '600',
    color: '#2E5540', // Moss Green
  },
});

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

// Accent colors for item types (matches NowFocusRow)
const ACCENT_COLORS = {
  todo: '#4A7FBF', // Soft blue
  habit: '#2E5540', // Moss Green
  log: '#9CA6E0', // Periwinkle Smoke
  list: '#E0C47A', // Golden Pear
} as const;

// Type pill background colors (matches NowTypeChip)
const TYPE_PILL_BG = {
  todo: '#E6F0FF', // Light blue
  habit: '#EAF7ED', // Light green
  log: '#F0F0FA', // Light periwinkle
  list: '#FDF5E6', // Light golden
} as const;

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

// ============================================================================
// SpaceItemRow - Compact row matching Today's Focus style
// ============================================================================

interface SpaceItemRowProps {
  type: 'todo' | 'habit' | 'log' | 'list';
  title: string;
  subtitle?: string;
  testID?: string;
  isFirst?: boolean;
  onPress?: () => void;
  // Todo-specific
  onToggleComplete?: () => void;
  completed?: boolean;
  // Habit-specific
  progress?: { done: number; target: number };
  onLogProgress?: () => void;
}

/** Compact row component matching NowFocusRow style */
function SpaceItemRow({
  type,
  title,
  subtitle,
  testID,
  isFirst = false,
  onPress,
  onToggleComplete,
  completed = false,
  progress,
  onLogProgress,
}: SpaceItemRowProps) {
  const accentColor = ACCENT_COLORS[type];
  const pillBg = TYPE_PILL_BG[type];
  const typeLabel =
    type === 'log' ? 'Log' : type === 'list' ? 'List' : type === 'habit' ? 'Habit' : 'Todo';

  return (
    <View style={rowStyles.wrapper}>
      {/* Top divider - only show if not first item */}
      {!isFirst && <View style={rowStyles.divider} />}

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [rowStyles.container, pressed && rowStyles.pressed]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel}: ${title}`}
      >
        {/* Left accent bar */}
        <View style={rowStyles.accentContainer}>
          <View style={[rowStyles.accentBar, { backgroundColor: accentColor }]} />
        </View>

        {/* Content area */}
        <View style={rowStyles.content}>
          {/* Title row */}
          <Text numberOfLines={1} style={rowStyles.title}>
            {title}
          </Text>

          {/* Meta row - type pill and subtitle */}
          <View style={rowStyles.metaRow}>
            <View
              style={[rowStyles.typePill, { backgroundColor: pillBg }]}
              testID={testID ? `${testID.replace('-item-', '-pill-')}` : undefined}
            >
              <Text style={rowStyles.typePillText}>{typeLabel}</Text>
            </View>
            {subtitle && (
              <Text style={rowStyles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        {/* Right side action */}
        {type === 'todo' && onToggleComplete && (
          <Pressable
            onPress={onToggleComplete}
            style={rowStyles.checkboxContainer}
            testID={testID ? testID.replace('-item-', '-checkbox-') : undefined}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: completed }}
            accessibilityLabel={`Mark ${title} as complete`}
          >
            <View style={[rowStyles.checkbox, completed && rowStyles.checkboxChecked]}>
              {completed && <Text style={rowStyles.checkmark}>✓</Text>}
            </View>
          </Pressable>
        )}

        {type === 'habit' && progress && (
          <View style={rowStyles.habitRight}>
            {onLogProgress && (
              <Pressable
                onPress={onLogProgress}
                style={rowStyles.habitLogButton}
                testID={testID ? testID.replace('-item-', '-log-') : undefined}
                accessibilityRole="button"
                accessibilityLabel={`Log progress for ${title}`}
              >
                <Text style={rowStyles.habitLogIcon}>+</Text>
              </Pressable>
            )}
            <View style={rowStyles.progressBar}>
              <View
                style={[
                  rowStyles.progressFill,
                  { width: `${Math.min(100, (progress.done / progress.target) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        {(type === 'log' || type === 'list') && <Text style={rowStyles.chevron}>›</Text>}
      </Pressable>
    </View>
  );
}

/** SpaceItemRow styles - matches NowFocusRow compact layout */
const rowStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: BRAND.colors.linenCream,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginLeft: 20,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    paddingRight: 12,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: BRAND.colors.sageMist,
  },
  accentContainer: {
    width: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  accentBar: {
    width: 3,
    height: 32,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  typePill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    lineHeight: 13,
  },
  subtitle: {
    fontSize: 11,
    color: BRAND.colors.inkSubtle,
    lineHeight: 13,
  },
  // Checkbox for todos
  checkboxContainer: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BRAND.colors.inkSubtle,
    backgroundColor: BRAND.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: BRAND.colors.mossGreen,
    borderColor: BRAND.colors.mossGreen,
  },
  checkmark: {
    color: BRAND.colors.surface,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  // Habit progress
  habitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 8,
  },
  habitLogButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitLogIcon: {
    color: BRAND.colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  progressBar: {
    width: 48,
    height: 5,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 3,
  },
  // Chevron for logs/lists
  chevron: {
    fontSize: 18,
    color: BRAND.colors.inkSubtle,
    marginLeft: 8,
  },
});

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
          <SpaceItemRow
            key={todo.id}
            type="todo"
            title={todo.name || 'Untitled'}
            subtitle={formatDueDate(todo.due_date || todo.due_day)}
            testID={`${testID}-item-${todo.id}`}
            isFirst={index === 0}
            onPress={() => onItemPress(todo)}
            onToggleComplete={() => onToggleComplete(todo)}
            completed={!!todo.completed_at}
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
            <SpaceItemRow
              key={habit.id}
              type="habit"
              title={habit.name || 'Untitled'}
              subtitle={`${doneCount}/${target} this week`}
              testID={`${testID}-item-${habit.id}`}
              isFirst={index === 0}
              onPress={() => onItemPress(habit)}
              onLogProgress={() => onLogProgress(habit)}
              progress={{ done: doneCount, target }}
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
        {displayLogs.map((log: any, index: number) => {
          const title = log.title || (log.body ? log.body.slice(0, 40) + '...' : 'Untitled');
          return (
            <SpaceItemRow
              key={log.id}
              type="log"
              title={title}
              subtitle={formatRelativeDate(log.updated_at || log.created_at)}
              testID={`${testID}-item-${log.id}`}
              isFirst={index === 0}
              onPress={() => onItemPress(log)}
            />
          );
        })}
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
            <SpaceItemRow
              key={list.id}
              type="list"
              title={list.title || 'Untitled List'}
              subtitle={itemCount > 0 ? `${itemCount} items` : 'List'}
              testID={`${testID}-item-${list.id}`}
              isFirst={index === 0}
              onPress={() => onItemPress(list)}
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

            {/* Optimistic quick add card */}
            {optimisticQuickAdd && (
              <View
                style={{
                  marginHorizontal: 16,
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

            {/* Filter bar */}
            <SpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

            {/* Phase 5: Removed SearchOverlayV33, GoalsZone, IconRowV33, GoalListV33, NewChatSectionV33, ThreadCardV33 */}

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

            {/* + Add to Space button - after sections, before chat CTA */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start',
                paddingHorizontal: 16,
                marginTop: 20,
              }}
            >
              <Pressable
                onPress={() => setShowQuickAddModal(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: pressed ? '#D4E4D6' : '#E8F0EB',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 14,
                })}
                testID="space-add-to-space-cta"
                accessibilityRole="button"
                accessibilityLabel="Add to Space"
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: BRAND.colors.mossGreen,
                  }}
                >
                  + Add to Space
                </Text>
              </Pressable>
            </View>

            {/* Chat with Gremly CTA - branded button above Recent conversations */}
            <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
              <Pressable
                onPress={handleNewChat}
                testID="space-chat-cta"
                accessibilityRole="button"
                accessibilityLabel="Start a new chat with Gremly"
                style={({ pressed }) => ({
                  backgroundColor: BRAND.colors.mossGreen,
                  borderRadius: 999,
                  paddingVertical: 14,
                  paddingHorizontal: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: pressed ? 0.9 : 1,
                  ...BRAND.elevation.one,
                })}
              >
                <MessageSquare size={20} color={BRAND.colors.surface} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: BRAND.colors.surface,
                  }}
                >
                  Start a new chat with Gremly
                </Text>
              </Pressable>
            </View>

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
        {/* v22 now uses the same simplified section layout - branded chat CTA */}

        {/* + Add to Space button - after sections, before chat CTA (v22/legacy) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingHorizontal: 16,
            marginTop: 20,
          }}
        >
          <Pressable
            onPress={() => setShowQuickAddModal(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: pressed ? '#D4E4D6' : '#E8F0EB',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 14,
            })}
            testID="space-add-to-space-cta"
            accessibilityRole="button"
            accessibilityLabel="Add to Space"
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: BRAND.colors.mossGreen,
              }}
            >
              + Add to Space
            </Text>
          </Pressable>
        </View>

        {/* Chat with Gremly CTA - branded button above Recent conversations (v22) */}
        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Pressable
              onPress={handleNewChat}
              testID="space-chat-cta"
              accessibilityRole="button"
              accessibilityLabel="Start a new chat with Gremly"
              style={({ pressed }) => ({
                backgroundColor: BRAND.colors.mossGreen,
                borderRadius: 999,
                paddingVertical: 14,
                paddingHorizontal: 24,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: pressed ? 0.9 : 1,
                ...BRAND.elevation.one,
              })}
            >
              <MessageSquare size={20} color={BRAND.colors.surface} />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: BRAND.colors.surface,
                }}
              >
                Start a new chat with Gremly
              </Text>
            </Pressable>
          </View>
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
