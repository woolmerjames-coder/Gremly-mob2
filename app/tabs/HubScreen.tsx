/**
 * Hub Screen - DS-only implementation (no Tailwind)
 * Central hub showing recent activity, spaces, and sorting tray
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button, Input, Chip } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
import { ManualAddOverlay } from '../../components/ManualAddOverlay';
import { toRepoFrequency } from '../../app/schemas/manualAdd';
import type { ManualAddPayload } from '../../app/schemas/manualAdd';
import type { AppRecord, Space } from '../../lib/types';
import { SheetManager } from 'react-native-actions-sheet';
import { formatDistanceToNow } from 'date-fns';
import { ActivityLog, type ActivityEvent } from '../../lib/activityLog';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type MainFilter = 'all' | 'habits' | 'todos' | 'journal' | 'catchall';

type CatchAllFilter = 'all' | 'lists' | 'notes' | 'sorting' | 'archived';

const FILTER_OPTIONS: ReadonlyArray<{ key: MainFilter; label: string; testID: string }> = [
  { key: 'all', label: 'All', testID: 'hub-filter-all' },
  { key: 'habits', label: 'Habits', testID: 'hub-filter-habits' },
  { key: 'todos', label: 'To-Dos', testID: 'hub-filter-todos' },
  { key: 'journal', label: 'Journal', testID: 'hub-filter-journal' },
  { key: 'catchall', label: 'Catch-All', testID: 'hub-filter-catchall' },
];

const CATCHALL_FILTER_OPTIONS: ReadonlyArray<{
  key: CatchAllFilter;
  label: string;
  testID: string;
}> = [
  { key: 'all', label: 'All', testID: 'ca-filter-all' },
  { key: 'lists', label: 'Lists', testID: 'ca-filter-lists' },
  { key: 'notes', label: 'Notes', testID: 'ca-filter-notes' },
  { key: 'sorting', label: 'Sorting Tray', testID: 'ca-filter-sorting' },
  { key: 'archived', label: 'Archived', testID: 'ca-filter-archived' },
];

export default function HubScreen() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigation = useNavigation<NavigationProp>();
  const repo = useRepo();
  const { user } = useAuth();
  const { theme } = useTheme();

  // State
  const [items, setItems] = useState<AppRecord[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [activeMainFilter, setActiveMainFilter] = useState<MainFilter>('all');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [catchAllFilter, setCatchAllFilter] = useState<CatchAllFilter>('all');
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editItem, setEditItem] = useState<AppRecord | null>(null);

  // Helper to filter out archived items
  const isVisible = useCallback((item: AppRecord) => !item.archived, []);

  // DEV: DS marker for QA
  const dsMarker = __DEV__ ? (
    <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.5, zIndex: 10 }}>
      <Text testID="ds-marker" variant="subtle" style={{ fontSize: 10 }}>
        DS
      </Text>
    </Box>
  ) : null;

  // Load data
  const load = useCallback(async () => {
    // Skip if not authenticated
    if (!user) {
      setError('Please sign in to view your items');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Load all items and spaces
      const [allHabits, allTodos, allNotes, allSpaces] = await Promise.all([
        repo.listByType('habit'),
        repo.listByType('todo'),
        repo.listByType('note'),
        repo.listSpaces(),
      ]);

      const allItems = [...allHabits, ...allTodos, ...allNotes];
      console.log(
        '[Hub] items from repo:',
        allItems.map((item) => ({
          id: item.id,
          type: item.type,
          subtype: 'subtype' in item ? item.subtype : undefined,
          title: item.title,
        })),
      );

      // Sort by updated_at (most recent first)
      allItems.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      });

      setItems(allItems);
      setSpaces(allSpaces);
      setActivityEvents([...ActivityLog.list()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load hub data';
      console.error('Failed to load hub data:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo, user]);

  // Load on mount
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(searchQuery.trim().toLowerCase());
    }, 200);
    return () => {
      clearTimeout(t);
    };
  }, [searchQuery]);

  const matchesNeedle = useCallback((item: AppRecord, needleValue: string) => {
    if (!needleValue) return true;
    const haystack = `${item.title ?? ''} ${'body' in item ? (item.body ?? '') : ''}`.toLowerCase();
    return haystack.includes(needleValue);
  }, []);

  const filteredItems = useMemo(() => {
    const needle = searchDebounced || searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      // Filter out archived items
      if (!isVisible(item)) return false;

      if (activeMainFilter !== 'all') {
        if (activeMainFilter === 'habits' && item.type !== 'habit') return false;
        if (activeMainFilter === 'todos' && item.type !== 'todo') return false;
        if (
          activeMainFilter === 'journal' &&
          !(item.type === 'note' && item.subtype === 'journal')
        ) {
          return false;
        }
        if (activeMainFilter === 'catchall' && item.origin !== 'catchall') {
          return false;
        }
      }

      return matchesNeedle(item, needle);
    });
  }, [items, activeMainFilter, matchesNeedle, searchDebounced, searchQuery, isVisible]);

  const sortingTrayItems = useMemo(
    () => filteredItems.filter((item) => item.ai_placed === true),
    [filteredItems],
  );
  const listItems = useMemo(
    () => filteredItems.filter((item) => item.ai_placed !== true),
    [filteredItems],
  );
  const catchAllAll = useMemo(
    () => items.filter((item) => item.origin === 'catchall' && isVisible(item)),
    [items, isVisible],
  );
  const catchAllWithSearch = useMemo(() => {
    const needle = searchDebounced || searchQuery.trim().toLowerCase();
    if (!needle) return catchAllAll;
    return catchAllAll.filter((item) => matchesNeedle(item, needle));
  }, [catchAllAll, matchesNeedle, searchDebounced, searchQuery]);
  const catchAllLists = useMemo(
    () => catchAllWithSearch.filter((item) => item.type === 'note' && item.subtype === 'list'),
    [catchAllWithSearch],
  );
  const catchAllNotes = useMemo(
    () =>
      catchAllWithSearch.filter(
        (item) =>
          item.type === 'note' &&
          (item.subtype === 'catchall' || item.subtype === 'journal' || !item.subtype),
      ),
    [catchAllWithSearch],
  );
  const catchAllSorting = useMemo(
    () => catchAllWithSearch.filter((item) => item.ai_placed === true),
    [catchAllWithSearch],
  );
  const catchAllArchived = useMemo(() => activityEvents, [activityEvents]);
  const catchAllRecordsForView = useMemo(() => {
    switch (catchAllFilter) {
      case 'lists':
        return catchAllLists;
      case 'notes':
        return catchAllNotes;
      case 'sorting':
        return catchAllSorting;
      case 'all':
        return catchAllWithSearch;
      case 'archived':
      default:
        return [] as AppRecord[];
    }
  }, [catchAllFilter, catchAllLists, catchAllNotes, catchAllSorting, catchAllWithSearch]);
  const catchAllEventsForView = catchAllFilter === 'archived' ? catchAllArchived : [];
  const isCatchAllArchivedView = catchAllFilter === 'archived';
  const catchAllEmpty = isCatchAllArchivedView
    ? catchAllEventsForView.length === 0
    : catchAllRecordsForView.length === 0;
  const filterLabel = useMemo(() => {
    const option = FILTER_OPTIONS.find((f) => f.key === activeMainFilter);
    return option?.label ?? 'All';
  }, [activeMainFilter]);

  // Empty state
  const isEmpty = items.length === 0;

  // Navigate to item → open edit modal
  const handleItemPress = (item: AppRecord) => {
    setEditItem(item);
    setEditMode(true);
  };

  // Navigate to space
  const handleSpacePress = (space: Space) => {
    console.log('Space pressed:', space.id);
    // TODO: Navigate to space detail
    // navigation.navigate('SpaceDetail', { id: space.id });
  };

  const handleMovePress = useCallback(
    async (item: AppRecord) => {
      try {
        await SheetManager.show('destination-picker', {
          payload: {
            itemId: item.id,
            itemType: item.type,
            itemSubtype: item.type === 'note' ? item.subtype : undefined,
            itemTitle: displayTitle(item),
            origin: item.origin ?? null,
          },
        } as never);
        await load();
      } catch (err) {
        console.error('[HubScreen] Move sheet error', err);
      }
    },
    [load],
  );

  const handleActivityEventPress = (itemId: string) => {
    const target = items.find((record) => record.id === itemId);
    if (target) {
      handleItemPress(target);
      return;
    }
    console.warn('[HubScreen] Activity item no longer available', itemId);
  };

  function displayTitle(item: AppRecord): string {
    if (item.title && item.title.trim()) return item.title.trim();
    if (item.type === 'note' && item.body) {
      const line =
        item.body
          .split('\n')
          .map((segment) => segment.trim())
          .find(Boolean) ?? '';
      if (line.length) {
        return line.length > 60 ? `${line.slice(0, 57)}…` : line;
      }
    }
    return 'Untitled';
  }

  function displayType(item: AppRecord): string {
    if (item.type === 'habit') return 'Habit';
    if (item.type === 'todo') return 'To-Do';
    if (item.type === 'note') {
      if (item.subtype === 'journal') return 'Journal';
      if (item.subtype === 'list') return 'List';
      return 'Catch-All Note';
    }
    return 'Item';
  }

  // Handle manual add submission
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
          // Catch-all is now handled internally by ManualAddOverlay
          // Just reload to show the new item
          console.log('[HubScreen] Catch-all saved by overlay, reloading...');
          break;
      }
      await load();
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

  return (
    <Screen title="Hub" scroll padded testID="hub-screen">
      {dsMarker}
      <Box gap={3}>
        {/* Error state */}
        {error && (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                Authentication Required
              </Text>
              <Text variant="body" style={{ textAlign: 'center', color: theme.colors.error }}>
                {error}
              </Text>
              {__DEV__ && (
                <Button
                  title="Open Dev Login"
                  onPress={() => navigation.navigate('DevLogin')}
                  testID="dev-login-cta"
                />
              )}
            </Box>
          </Card>
        )}

        {/* Filters and Search */}
        {!error && (
          <>
            <Box row gap={2} style={{ flexWrap: 'wrap' }}>
              {FILTER_OPTIONS.map((filter) => {
                const selected = activeMainFilter === filter.key;
                return (
                  <Chip
                    key={filter.key}
                    label={filter.label}
                    selected={selected}
                    onPress={() => {
                      setActiveMainFilter(filter.key);
                      if (filter.key === 'catchall') {
                        setCatchAllFilter('all');
                      }
                    }}
                    testID={filter.testID}
                    accessibilityLabel={`Filter ${filter.label}`}
                  />
                );
              })}
            </Box>

            <Box mt={2}>
              <Input
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search the Hub"
                testID="hub-search"
                accessibilityLabel="Search the Hub"
              />
            </Box>
          </>
        )}

        {/* Loading state */}
        {loading && !items.length && !error && (
          <Box p={4}>
            <Text variant="body" style={{ textAlign: 'center' }}>
              Loading...
            </Text>
          </Box>
        )}

        {/* Empty state */}
        {isEmpty && !loading && !error && (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                Nothing here yet
              </Text>
              <Text variant="body" style={{ textAlign: 'center' }}>
                Drop something in Catch All to start.
              </Text>
              <Button
                title="Open Manual Add"
                onPress={() => setOverlayVisible(true)}
                testID="hub-empty-add"
              />
            </Box>
          </Card>
        )}

        {/* Sorting Tray Section (AI-placed items) */}
        {activeMainFilter !== 'catchall' && sortingTrayItems.length > 0 && (
          <Box gap={2}>
            <Text variant="title">Sorting Tray ({sortingTrayItems.length})</Text>
            <Text variant="subtle">Items needing your attention</Text>
            {sortingTrayItems.map((item) => {
              const title = displayTitle(item);
              return (
                <Box key={item.id} gap={1}>
                  <ListItem
                    title={title}
                    subtitle={`${item.type} • AI placed`}
                    onPress={() => handleItemPress(item)}
                    testID={`hub-tray-${item.id}`}
                    accessibilityLabel={`Open ${title} from sorting tray`}
                    rightContent={
                      <Button
                        title="Move"
                        variant="neutral"
                        size="sm"
                        onPress={() => handleMovePress(item)}
                        accessibilityLabel={`Move ${title}`}
                        testID={`hub-move-${item.id}`}
                      />
                    }
                  />
                  {item.origin === 'catchall' && (activeMainFilter as string) !== 'catchall' ? (
                    <Text variant="subtle" style={{ marginLeft: 16 }}>
                      Placed by Gremly from Catch-All.
                    </Text>
                  ) : null}
                </Box>
              );
            })}
          </Box>
        )}

        {activeMainFilter === 'catchall' && (
          <Box gap={2}>
            <Text variant="title">Catch-All ({catchAllWithSearch.length})</Text>
            <Box row gap={2} style={{ flexWrap: 'wrap' }}>
              {CATCHALL_FILTER_OPTIONS.map((option) => {
                const selected = catchAllFilter === option.key;
                return (
                  <Chip
                    key={option.key}
                    label={option.label}
                    selected={selected}
                    onPress={() => setCatchAllFilter(option.key)}
                    testID={option.testID}
                    accessibilityLabel={`Catch-All filter ${option.label}`}
                  />
                );
              })}
            </Box>
            {catchAllEmpty ? (
              <Text variant="body" style={{ marginTop: 8 }}>
                {isCatchAllArchivedView ? 'No archived moves yet.' : 'No items in this view yet.'}
              </Text>
            ) : isCatchAllArchivedView ? (
              catchAllEventsForView.map((event) => (
                <ListItem
                  key={event.id}
                  title={event.itemTitle || 'Untitled'}
                  subtitle={`${destinationLabel(event.destination)} • ${formatRelativeTime(event.timestamp)}`}
                  onPress={() => handleActivityEventPress(event.itemId)}
                  testID={`catchall-activity-${event.id}`}
                  accessibilityLabel={`Open ${event.itemTitle || 'item'} from activity log`}
                />
              ))
            ) : (
              catchAllRecordsForView.map((item) => {
                const title = displayTitle(item);
                return (
                  <ListItem
                    key={item.id}
                    title={title}
                    subtitle={`${displayType(item)} • ${new Date(
                      item.updated_at || item.created_at,
                    ).toLocaleDateString()}`}
                    onPress={() => handleItemPress(item)}
                    testID={`ca-item-${item.id}`}
                    accessibilityLabel={`Open ${title} from Catch-All`}
                    rightContent={
                      catchAllFilter === 'sorting' && item.ai_placed ? (
                        <Button
                          title="Move"
                          variant="neutral"
                          size="sm"
                          onPress={() => handleMovePress(item)}
                          accessibilityLabel={`Move ${title}`}
                          testID={`ca-move-${item.id}`}
                        />
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </Box>
        )}

        {/* No matches state */}
        {!isEmpty && !loading && filteredItems.length === 0 && (
          <Box p={4}>
            <Text variant="body" style={{ textAlign: 'center' }}>
              No matches. Try clearing filters.
            </Text>
          </Box>
        )}

        {/* Filtered Items */}
        {activeMainFilter !== 'catchall' && listItems.length > 0 && (
          <Box gap={2}>
            <Text variant="title">
              {filterLabel === 'All'
                ? `All Items (${listItems.length})`
                : `${filterLabel} (${listItems.length})`}
            </Text>
            {listItems.map((item) => {
              const title = displayTitle(item);
              return (
                <Box key={item.id} gap={1}>
                  <ListItem
                    title={title}
                    subtitle={`${item.type} • ${new Date(item.updated_at || item.created_at).toLocaleDateString()}`}
                    onPress={() => handleItemPress(item)}
                    testID={`hub-item-${item.id}`}
                    accessibilityLabel={`Open ${title}`}
                  />
                  {item.origin === 'catchall' ? (
                    <Text variant="subtle" style={{ marginLeft: 16 }}>
                      Placed by Gremly from Catch-All.
                    </Text>
                  ) : null}
                </Box>
              );
            })}
          </Box>
        )}

        {/* Spaces Overview Section */}
        {spaces.length > 0 && (
          <Box gap={2}>
            <Text variant="title">Spaces ({spaces.length})</Text>
            {spaces.map((space) => (
              <ListItem
                key={space.id}
                title={space.name}
                subtitle="Space"
                onPress={() => handleSpacePress(space)}
                testID={`hub-space-${space.id}`}
                accessibilityLabel={`Open space ${space.name}`}
              />
            ))}
          </Box>
        )}

        {/* Quick Add Button */}
        {!isEmpty && (
          <Box mt={3}>
            <Button
              title="Add More"
              variant="neutral"
              onPress={() => setOverlayVisible(true)}
              testID="hub-add-more"
            />
          </Box>
        )}
      </Box>

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
    </Screen>
  );
}

function formatRelativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'just now';
  try {
    return formatDistanceToNow(timestamp, { addSuffix: true });
  } catch (err) {
    console.error('[HubScreen] Failed to format timestamp', err);
    return 'just now';
  }
}

function destinationLabel(destination: ActivityEvent['destination']): string {
  switch (destination) {
    case 'habit':
      return 'Habit';
    case 'todo':
      return 'To-Do';
    case 'note:journal':
      return 'Journal';
    case 'note:list':
      return 'List';
    case 'note:catchall':
    default:
      return 'Catch-All Note';
  }
}
