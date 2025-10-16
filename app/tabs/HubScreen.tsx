/**
 * Hub Screen - DS-only implementation (no Tailwind)
 * Central hub showing recent activity, spaces, and sorting tray
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button, Input } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
import { openManualAdd } from '../../components/ManualAddSheet';
import type { AppRecord, Space } from '../../lib/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterType = 'all' | 'habits' | 'todos' | 'notes';

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
  const [activeFilter] = useState<FilterType>('all'); // TODO: Add filter chip UI

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

      // Sort by updated_at (most recent first)
      allItems.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      });

      setItems(allItems);
      setSpaces(allSpaces);
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

  // Filter items
  const filteredItems = items.filter((item) => {
    // Apply type filter
    if (activeFilter !== 'all') {
      if (activeFilter === 'habits' && item.type !== 'habit') return false;
      if (activeFilter === 'todos' && item.type !== 'todo') return false;
      if (activeFilter === 'notes' && item.type !== 'note') return false;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const titleMatch = item.title?.toLowerCase().includes(query) || false;
      const bodyMatch =
        item.type === 'note' && item.body ? item.body.toLowerCase().includes(query) : false;
      return titleMatch || bodyMatch;
    }

    return true;
  });

  // Recent items (top 10)
  const recentItems = filteredItems.slice(0, 10);

  // Items in sorting tray (AI-placed items)
  const sortingTrayItems = items.filter((item) => item.ai_placed);

  // Empty state
  const isEmpty = items.length === 0;

  // Navigate to item (placeholder)
  const handleItemPress = (item: AppRecord) => {
    console.log('Item pressed:', item.id, item.type);
    // TODO: Navigate to detail screen based on type
  };

  // Navigate to space
  const handleSpacePress = (space: Space) => {
    console.log('Space pressed:', space.id);
    // TODO: Navigate to space detail
    // navigation.navigate('SpaceDetail', { id: space.id });
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

        {/* Search Input */}
        {!error && (
          <Input
            testID="hub-search"
            placeholder="Search everything..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
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
                Try adding something from Today or Spaces.
              </Text>
              <Button
                title="Open Manual Add"
                onPress={() => openManualAdd()}
                testID="hub-empty-add"
              />
            </Box>
          </Card>
        )}

        {/* Recent Activity Section */}
        {!isEmpty && recentItems.length > 0 && (
          <Box gap={2}>
            <Text variant="title">
              Recent {activeFilter !== 'all' && `(${filteredItems.length})`}
            </Text>
            {recentItems.map((item) => (
              <ListItem
                key={item.id}
                title={item.title || 'Untitled'}
                subtitle={`${item.type} • ${new Date(item.updated_at || item.created_at).toLocaleDateString()}`}
                onPress={() => handleItemPress(item)}
                testID={`hub-recent-${item.id}`}
              />
            ))}
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
              />
            ))}
          </Box>
        )}

        {/* Sorting Tray Section (AI-placed items) */}
        {sortingTrayItems.length > 0 && (
          <Box gap={2}>
            <Text variant="title">Sorting Tray ({sortingTrayItems.length})</Text>
            <Text variant="body">Items needing your attention</Text>
            {sortingTrayItems.map((item) => (
              <ListItem
                key={item.id}
                title={item.title || 'Untitled'}
                subtitle={`${item.type} • AI placed`}
                onPress={() => handleItemPress(item)}
                testID={`hub-tray-${item.id}`}
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
              onPress={() => openManualAdd()}
              testID="hub-add-more"
            />
          </Box>
        )}
      </Box>
    </Screen>
  );
}
