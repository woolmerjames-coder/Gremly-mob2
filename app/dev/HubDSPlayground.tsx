/**
 * HubDSPlayground - Preview for DS-only Hub screen
 * Shows mocked data for visual testing
 *
 * NOTE: ManualAddSheet removed - use ManualAddOverlay instead
 */

import { useState } from 'react';
import { Screen, Box, Text, Button, Input, Chip } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
// import { openManualAdd } from '../../components/ManualAddSheet'; // DEPRECATED - removed

// Mock data
const mockRecentItems = [
  {
    id: 'item-1',
    type: 'habit' as const,
    title: 'Morning Run',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-2',
    type: 'todo' as const,
    title: 'Buy groceries',
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'item-3',
    type: 'note' as const,
    title: 'Meeting notes',
    updated_at: new Date(Date.now() - 172800000).toISOString(),
  },
];

const mockSpaces = [
  { id: 'space-1', name: 'Work', icon: '💼' },
  { id: 'space-2', name: 'Personal', icon: '🏠' },
  { id: 'space-3', name: 'Fitness', icon: '💪' },
];

const mockSortingTray = [
  {
    id: 'tray-1',
    type: 'note' as const,
    title: 'Random idea from AI',
    ai_placed: true,
  },
  {
    id: 'tray-2',
    type: 'todo' as const,
    title: 'Suggested task',
    ai_placed: true,
  },
];

type FilterType = 'all' | 'habits' | 'todos' | 'notes';

export default function HubDSPlayground() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const handleItemPress = (id: string, type: string) => {
    console.log('[HubDSPlayground] Item pressed:', id, type);
  };

  const handleSpacePress = (id: string, name: string) => {
    console.log('[HubDSPlayground] Space pressed:', id, name);
  };

  return (
    <Screen title="Hub (Preview)" scroll padded testID="hub-screen">
      <Box gap={3}>
        {/* Search and Filter Row */}
        <Box gap={2}>
          <Input
            placeholder="Search the Hub…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            testID="hub-search"
          />

          <Box row gap={2} style={{ flexWrap: 'wrap' }}>
            <Chip
              label="All"
              selected={activeFilter === 'all'}
              onPress={() => setActiveFilter('all')}
              testID="hub-filter-all"
            />
            <Chip
              label="Habits"
              selected={activeFilter === 'habits'}
              onPress={() => setActiveFilter('habits')}
              testID="hub-filter-habits"
            />
            <Chip
              label="To-Dos"
              selected={activeFilter === 'todos'}
              onPress={() => setActiveFilter('todos')}
              testID="hub-filter-todos"
            />
            <Chip
              label="Notes"
              selected={activeFilter === 'notes'}
              onPress={() => setActiveFilter('notes')}
              testID="hub-filter-notes"
            />
          </Box>
        </Box>

        {/* Recent Activity Section */}
        <Box gap={2}>
          <Text variant="title">Recent</Text>
          {mockRecentItems.map((item) => (
            <ListItem
              key={item.id}
              title={item.title}
              subtitle={`${item.type} • ${new Date(item.updated_at).toLocaleDateString()}`}
              onPress={() => handleItemPress(item.id, item.type)}
              testID={`hub-recent-${item.id}`}
            />
          ))}
        </Box>

        {/* Spaces Overview Section */}
        <Box gap={2}>
          <Text variant="title">Spaces ({mockSpaces.length})</Text>
          {mockSpaces.map((space) => (
            <ListItem
              key={space.id}
              title={`${space.icon} ${space.name}`}
              subtitle="Space"
              onPress={() => handleSpacePress(space.id, space.name)}
              testID={`hub-space-${space.id}`}
            />
          ))}
        </Box>

        {/* Sorting Tray Section */}
        <Box gap={2}>
          <Text variant="title">Sorting Tray ({mockSortingTray.length})</Text>
          <Text variant="body">Items needing your attention</Text>
          {mockSortingTray.map((item) => (
            <ListItem
              key={item.id}
              title={item.title}
              subtitle={`${item.type} • AI placed`}
              onPress={() => handleItemPress(item.id, item.type)}
              testID={`hub-tray-${item.id}`}
            />
          ))}
        </Box>

        {/* Quick Add Button */}
        <Box mt={3}>
          <Button
            title="Add More"
            variant="neutral"
            onPress={() => console.log('TODO: Open ManualAddOverlay')}
            testID="hub-add-more"
          />
        </Box>

        {/* Empty State Preview */}
        <Box mt={4} gap={2}>
          <Text variant="title">Empty State Preview:</Text>
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
                onPress={() => console.log('TODO: Open ManualAddOverlay')}
                testID="hub-empty-add"
              />
            </Box>
          </Card>
        </Box>
      </Box>
    </Screen>
  );
}
