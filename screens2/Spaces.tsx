/**
 * Spaces Screen - DS-only implementation (no Tailwind)
 * Grid view of user's Spaces with search
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRepo } from '../providers/RepoProvider';
import { Screen, Box, Text, Button, Input } from '../ui';
import { Card } from '../design-system/Card';
import { ListItem } from '../design-system/ListItem';
import MascotIcon from '../components/MascotIcon';
import type { RootStackParamList } from '../navigation/RootNavigator';

export default function SpacesScreen() {
  const repo = useRepo();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // State
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string; description?: string }>>(
    [],
  );
  const [q, setQ] = useState('');

  // DEV: DS marker for QA
  const dsMarker = __DEV__ ? (
    <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.5, zIndex: 10 }}>
      <Text testID="ds-marker" variant="subtle" style={{ fontSize: 10 }}>
        DS
      </Text>
    </Box>
  ) : null;

  // Load spaces
  const load = useCallback(async () => {
    try {
      setSpaces(await repo.listSpaces());
    } catch (error) {
      console.error('Failed to load spaces:', error);
    }
  }, [repo]);

  // Load on mount
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const data = await repo.listSpaces();
        if (mounted) setSpaces(data);
      } catch (error) {
        console.error('Failed to load spaces:', error);
      }
    };
    void loadData();
    return () => {
      mounted = false;
    };
  }, [repo]);

  // Reload on focus
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Navigate to create
  const onCreateSpace = useCallback(() => {
    navigation.navigate('NewSpace');
  }, [navigation]);

  // Filter spaces by search query
  const filteredSpaces = q.trim()
    ? spaces.filter((s) => s.name?.toLowerCase().includes(q.toLowerCase()))
    : spaces;

  // Space count label
  const spaceCountLabel = `${filteredSpaces.length} space${filteredSpaces.length === 1 ? '' : 's'}`;

  // Empty state (no spaces or filtered empty)
  const isEmpty = filteredSpaces.length === 0;

  return (
    <Screen title="Spaces" padded scroll testID="spaces-screen">
      {dsMarker}
      <Box gap={3}>
        {/* Header row */}
        <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="subtle">{spaceCountLabel}</Text>
          <Button title="New Space" onPress={onCreateSpace} testID="spaces-new" />
        </Box>

        {/* Search */}
        <Box>
          <Input
            testID="spaces-search"
            placeholder="Search spaces…"
            value={q}
            onChangeText={setQ}
          />
        </Box>

        {/* List or Empty State */}
        {isEmpty ? (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <MascotIcon pose="neutral" size={96} />
              <Text variant="title" style={{ textAlign: 'center' }}>
                No Spaces yet
              </Text>
              <Text variant="body" style={{ textAlign: 'center' }}>
                Create one to organize your habits, to-dos, and notes.
              </Text>
              <Button title="New Space" onPress={onCreateSpace} testID="spaces-empty-cta" />
            </Box>
          </Card>
        ) : (
          <Box gap={2}>
            {filteredSpaces.map((space) => (
              <ListItem
                key={space.id}
                title={space.name}
                subtitle={space.description}
                onPress={() => navigation.navigate('SpaceDetail', { id: space.id })}
                testID={`space-item-${space.id}`}
              />
            ))}
          </Box>
        )}
      </Box>
    </Screen>
  );
}
