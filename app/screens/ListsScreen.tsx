import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, Alert, TextInput, TouchableOpacity } from 'react-native';
import { Box, Text, Screen } from '../../ui';
import { ListSwitcher } from '../../components/lists/ListSwitcher';
import { ListItemRow } from '../../components/lists/ListItemRow';
import type { ListItem } from '../../lib/repo/types';
import { useRepo } from '../../providers/RepoProvider';

type ListType = 'shopping' | 'packing';

export const ListsScreen: React.FC = () => {
  const repo = useRepo();
  const [selectedList, setSelectedList] = useState<ListType>('shopping');
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [currentListId, setCurrentListId] = useState<string | null>(null);

  const loadList = useCallback(
    async (listType: ListType) => {
      setIsLoading(true);
      try {
        // Get or create the list
        const list = await repo.getOrCreateList(listType, {
          userId: undefined, // Will use auth context
          spaceId: null, // For now, not using spaces
        });
        setCurrentListId(list.id);

        // Load items
        const items = await repo.listItems(list.id);
        setListItems(items);
      } catch (error) {
        console.error('Failed to load list:', error);
        Alert.alert('Error', 'Failed to load list. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [repo],
  );

  useEffect(() => {
    loadList(selectedList);
  }, [selectedList, loadList]);

  const handleListChange = (listType: ListType) => {
    setSelectedList(listType);
  };

  const handleAddItem = async () => {
    if (!newItemText.trim() || !currentListId) return;

    const optimisticItem: ListItem = {
      id: `temp-${Date.now()}`,
      list_id: currentListId,
      label: newItemText.trim(),
      completed_at: null,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    setListItems((prev) => [...prev, optimisticItem]);
    setNewItemText('');

    try {
      // Real API call
      const newItem = await repo.addListItem(currentListId, newItemText.trim());

      // Replace optimistic item with real one
      setListItems((prev) => prev.map((item) => (item.id === optimisticItem.id ? newItem : item)));
    } catch (error) {
      console.error('Failed to add item:', error);
      // Revert optimistic update
      setListItems((prev) => prev.filter((item) => item.id !== optimisticItem.id));
      Alert.alert('Error', 'Failed to add item. Please try again.');
    }
  };

  const handleToggleComplete = async (itemId: string, done: boolean) => {
    // Optimistic update
    setListItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, completed_at: done ? new Date().toISOString() : null }
          : item,
      ),
    );

    try {
      await repo.toggleListItemComplete(itemId, done);
    } catch (error) {
      console.error('Failed to toggle item:', error);
      // Revert optimistic update
      setListItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, completed_at: done ? null : new Date().toISOString() }
            : item,
        ),
      );
      Alert.alert('Error', 'Failed to update item. Please try again.');
    }
  };

  const handleRename = async (itemId: string, newLabel: string) => {
    // Optimistic update
    setListItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, label: newLabel } : item)),
    );

    try {
      await repo.renameListItem(itemId, newLabel);
    } catch (error) {
      console.error('Failed to rename item:', error);
      // Revert would require keeping old label - for simplicity, reload
      loadList(selectedList);
      Alert.alert('Error', 'Failed to rename item. Please try again.');
    }
  };

  const incompleteCount = listItems.filter((item) => !item.completed_at).length;
  const completedCount = listItems.filter((item) => item.completed_at).length;

  return (
    <Screen>
      <Box flex={1} bg="bg">
        {/* Header */}
        <Box p={4}>
          <Text variant="title" style={{ textAlign: 'center', marginBottom: 8 }}>
            Lists
          </Text>
          <Text variant="label" style={{ textAlign: 'center', color: '#6A6F76' }}>
            {incompleteCount} items • {completedCount} completed
          </Text>
        </Box>

        {/* List Switcher */}
        <ListSwitcher selectedList={selectedList} onSelectList={handleListChange} />

        {/* Items List */}
        <Box flex={1} px={2}>
          {isLoading ? (
            <Box center flex={1}>
              <Text variant="body" style={{ color: '#6A6F76' }}>
                Loading...
              </Text>
            </Box>
          ) : (
            <FlatList
              data={listItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ListItemRow
                  item={item}
                  onToggleComplete={handleToggleComplete}
                  onRename={handleRename}
                />
              )}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 100 }}
            />
          )}
        </Box>

        {/* Add Item Row */}
        <Box p={4} bg="surface" style={{ borderTopWidth: 1, borderTopColor: '#E7E2D9' }}>
          <Box row style={{ alignItems: 'center' }}>
            <Box
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: '#E7E2D9',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Text variant="body" style={{ color: '#6A6F76', fontSize: 14 }}>
                +
              </Text>
            </Box>

            <Box flex={1}>
              <TextInput
                value={newItemText}
                onChangeText={setNewItemText}
                onSubmitEditing={handleAddItem}
                placeholder="Add an item..."
                style={{
                  fontSize: 16,
                  color: '#0E1116',
                  paddingVertical: 8,
                }}
                returnKeyType="done"
              />
            </Box>

            {newItemText.trim() && (
              <TouchableOpacity
                onPress={handleAddItem}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: '#0D3B3A',
                  borderRadius: 6,
                }}
              >
                <Text variant="label" style={{ color: 'white' }}>
                  Add
                </Text>
              </TouchableOpacity>
            )}
          </Box>
        </Box>
      </Box>
    </Screen>
  );
};
