/**
 * Spaces Screen - DS-only implementation (no Tailwind)
 * Grid view of user's Spaces with search
 * Phase H: Updated to use NewSpaceModal instead of NewSpace screen route
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SheetManager } from 'react-native-actions-sheet';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button, Input } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
import MascotIcon from '../../components/MascotIcon';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { setNewSpaceCallback } from '../../components/NewSpaceModal';

export default function SpacesScreen() {
  const repo = useRepo();
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // State
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string; description?: string }>>(
    [],
  );
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  // DEV: DS marker for QA
  const dsMarker = __DEV__ ? (
    <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.5, zIndex: 10 }}>
      <Text testID="ds-marker" variant="subtle" style={{ fontSize: 10 }}>
        DS
      </Text>
    </Box>
  ) : null;

  // Load on mount and when dependencies change
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      // Skip if not authenticated - don't set error to avoid infinite loop
      if (!user) {
        return;
      }

      setError(null);
      try {
        const data = await repo.listSpaces();
        if (mounted) setSpaces(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load spaces';
        console.error('Failed to load spaces:', err);
        if (mounted) setError(message);
      }
    };
    void loadData();
    return () => {
      mounted = false;
    };
  }, [repo, user]);

  // Navigate to create (now opens modal instead of screen route)
  const onCreateSpace = useCallback(() => {
    // Set callback to refresh spaces list when new space is created
    setNewSpaceCallback((newSpace) => {
      setSpaces((prev) => [...prev, newSpace]);
    });
    SheetManager.show('new-space');
  }, []);

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
        {/* Error state */}
        {error && (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                Error
              </Text>
              <Text variant="body" style={{ textAlign: 'center', color: theme.colors.error }}>
                {error}
              </Text>
              {__DEV__ && !user && (
                <Button
                  title="Open Dev Login"
                  onPress={() => navigation.navigate('DevLogin')}
                  testID="dev-login-cta"
                />
              )}
            </Box>
          </Card>
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('CatchAllNotepad')}
          testID="spaces-catchall-button"
          accessibilityRole="button"
          accessibilityLabel="Open Gremly Catch-All"
        >
          <Card>
            <View style={styles.catchallCard}>
              <View style={styles.shimmerOverlay} />
              <Box gap={1}>
                <Text variant="title" style={styles.catchallTitle}>
                  Catch-All
                </Text>
                <Text variant="body" style={styles.catchallSubtitle}>
                  Drop anything — I’ll help you sort it.
                </Text>
              </Box>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Header row */}
        {!error && (
          <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="subtle">{spaceCountLabel}</Text>
            <Button title="New Space" onPress={onCreateSpace} testID="spaces-new" />
          </Box>
        )}

        {/* Search */}
        {!error && (
          <Box>
            <Input
              testID="spaces-search"
              placeholder="Search spaces…"
              value={q}
              onChangeText={setQ}
            />
          </Box>
        )}

        {/* List or Empty State */}
        {isEmpty && !error ? (
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
                onPress={() => {
                  const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on')
                    .toString()
                    .trim()
                    .toLowerCase();
                  const v3 = raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
                  if (v3) {
                    navigation.navigate('SpaceHome', { spaceId: space.id });
                  } else {
                    navigation.navigate('SpaceDetail', { id: space.id });
                  }
                }}
                testID={`space-item-${space.id}`}
              />
            ))}
          </Box>
        )}
      </Box>
    </Screen>
  );
}

const styles = StyleSheet.create({
  catchallCard: {
    overflow: 'hidden',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#F1F7F5',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.18)',
    pointerEvents: 'none',
  },
  catchallTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1D4D4F',
  },
  catchallSubtitle: {
    fontSize: 16,
    color: '#3F6B6B',
  },
});
