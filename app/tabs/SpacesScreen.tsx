/**
 * =============================================================================
 * SPACES SCREEN
 * =============================================================================
 *
 * Dedicated Spaces list screen for browsing and managing user's Spaces.
 *
 * FEATURES:
 * - List of all user's Spaces with icons
 * - Create new Space button
 * - Empty state with mascot illustration
 * - Navigation to SpaceHome/SpaceDetail
 *
 * NAVIGATION INTEGRATION:
 * - Registered in TabNavigator as "Spaces" tab
 * - Routes TO: SpaceHome, SpaceDetail, NewSpaceModal
 * - TestID: "spaces-screen" (used by automated tests)
 *
 * CRITICAL TEST IDs (DO NOT CHANGE):
 * - "spaces-screen" - Main screen container
 * - "spaces-empty-cta" - New Space button in empty state
 * - "space-item-{spaceId}" - Individual space list items
 *
 * =============================================================================
 */

import { useCallback, useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SheetManager } from 'react-native-actions-sheet';
import { StyleSheet, View, Pressable, Alert, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Plus, ChevronDown } from 'lucide-react-native';

import SPACES_TITLE from '../../assets/spacestitle.png';

import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  useActiveSpaces,
  useNewSpaceSuggestions,
  useEntitiesByIds,
  type DropEntity,
} from '../../lib/store/selectors';
import { Text } from '../../ui';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { setNewSpaceCallback } from '../../components/CreateSpaceModal';
import { useReducedMotion } from '../../design/animations';
import { getSpaceIcon } from '../../lib/utils/spaceIconMatcher';
import MascotIcon from '../../components/MascotIcon';
import type { SpaceSuggestion } from '../../lib/types';

/**
 * Shows expanded list of items in a suggestion
 */
interface SuggestionItemsListProps {
  dropIds: string[];
}

function SuggestionItemsList({ dropIds }: SuggestionItemsListProps) {
  const entities = useEntitiesByIds(dropIds);

  const getEntityTitle = (entity: DropEntity): string => {
    // Use type-safe property access based on _type discriminator
    const e = entity as unknown as Record<string, unknown>;
    if (entity._type === 'todo') {
      return (e.title as string) || 'Untitled task';
    }
    if (entity._type === 'note') {
      return (e.title as string) || ((e.content as string) || '').slice(0, 50) || 'Untitled note';
    }
    if (entity._type === 'habit') {
      return (e.name as string) || 'Untitled habit';
    }
    return 'Item';
  };

  return (
    <View style={styles.itemsList}>
      {entities.map((entity) => (
        <View key={entity.id} style={styles.itemRow}>
          <View style={styles.itemBullet} />
          <Text style={styles.itemTitle} numberOfLines={1}>
            {getEntityTitle(entity)}
          </Text>
          <Text style={styles.itemType}>{entity._type}</Text>
        </View>
      ))}
    </View>
  );
}

function SpacesScreen() {
  const activeSpaces = useActiveSpaces();
  const newSpaceSuggestions = useNewSpaceSuggestions();
  const deleteSpace = useGremlyStore((s) => s.deleteSpace);
  const createSpace = useGremlyStore((s) => s.createSpace);
  const acceptSuggestion = useGremlyStore((s) => s.acceptSuggestion);
  const declineSuggestion = useGremlyStore((s) => s.declineSuggestion);
  const assignDropsToSpace = useGremlyStore((s) => s.assignDropsToSpace);
  const fetchSpaceSuggestions = useGremlyStore((s) => s.fetchSpaceSuggestions);
  const spaceSuggestionsLoaded = useGremlyStore((s) => s.spaceSuggestionsLoaded);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isReducedMotion = useReducedMotion();

  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());

  // Fetch space suggestions when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!spaceSuggestionsLoaded) {
        console.log('[SpacesScreen] Fetching space suggestions...');
        fetchSpaceSuggestions().catch((err) => {
          console.error('[SpacesScreen] Failed to fetch suggestions:', err);
        });
      }
    }, [spaceSuggestionsLoaded, fetchSpaceSuggestions]),
  );

  const toggleExpanded = useCallback((suggestionId: string) => {
    setExpandedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  }, []);

  const spaces = activeSpaces;

  // Navigate to create (opens modal)
  const onCreateSpace = useCallback(() => {
    setNewSpaceCallback((space) => {
      navigation.navigate('SpaceHome', { spaceId: space.id });
    });
    SheetManager.show('new-space');
  }, [navigation]);

  // Handle space menu (three-dot menu)
  const handleSpaceMenu = useCallback(
    (space: { id: string; name: string }) => {
      Alert.alert(space.name, 'Choose an action', [
        {
          text: 'Delete space',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSpace(space.id);
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to delete space';
              Alert.alert('Error', message);
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    },
    [deleteSpace],
  );

  // Handle creating a suggested space
  const handleCreateSuggestedSpace = useCallback(
    async (suggestion: SpaceSuggestion) => {
      try {
        const newSpace = await createSpace({ name: suggestion.suggested_name || 'New Space' });
        await assignDropsToSpace(suggestion.drop_ids, newSpace.id);
        await acceptSuggestion(suggestion.id);
        navigation.navigate('SpaceHome', { spaceId: newSpace.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create space';
        Alert.alert('Error', message);
      }
    },
    [createSpace, assignDropsToSpace, acceptSuggestion, navigation],
  );

  // Show confirmation before creating suggested space
  const confirmCreateSpace = useCallback(
    (suggestion: SpaceSuggestion) => {
      Alert.alert(
        `Create "${suggestion.suggested_name}"?`,
        `This will create a new Space with ${suggestion.drop_ids.length} items.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Create',
            onPress: () => handleCreateSuggestedSpace(suggestion),
          },
        ],
      );
    },
    [handleCreateSuggestedSpace],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View
        style={styles.animatedContainer}
        entering={isReducedMotion || __DEV__ ? undefined : FadeIn.duration(150)}
        testID="spaces-screen"
      >
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={SPACES_TITLE}
            style={styles.headerTitleImage}
            resizeMode="contain"
            accessibilityLabel="Spaces"
          />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Create Space Button */}
          <Pressable
            onPress={onCreateSpace}
            testID="spaces-empty-cta"
            style={({ pressed }) => [styles.createSpaceButton, pressed && { opacity: 0.9 }]}
          >
            <Plus size={20} color="#2E5540" />
            <Text style={styles.createSpaceButtonText}>Create a Space</Text>
          </Pressable>

          {/* Spaces List or Empty State */}
          {spaces.length === 0 && newSpaceSuggestions.length === 0 ? (
            <View style={styles.emptyState}>
              <MascotIcon size={72} />
              <Text style={styles.emptyTitle}>Where your deeper thinking lives</Text>
              <Text style={styles.emptySubtitle}>Projects · Plans · Habits · Research</Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: '#2E5540',
                  marginTop: 12,
                  textAlign: 'center',
                }}
              >
                Chat with Gremly
              </Text>
            </View>
          ) : spaces.length === 0 && newSpaceSuggestions.length > 0 ? (
            /* Empty state with suggestions */
            <View>
              <View style={styles.emptyStateWithSuggestions}>
                <MascotIcon size={56} />
                <Text style={styles.suggestionsIntro}>
                  Gremly noticed some themes in your drops:
                </Text>
              </View>
              <View style={styles.spacesList}>
                {newSpaceSuggestions.slice(0, 3).map((suggestion) => {
                  const isExpanded = expandedSuggestions.has(suggestion.id);
                  const SuggestedIcon = getSpaceIcon(suggestion.suggested_name || '');
                  return (
                    <View key={suggestion.id} style={styles.suggestionContainer}>
                      <View style={styles.suggestionRowWrapper}>
                        {/* Left side - tappable to expand/collapse */}
                        <Pressable
                          onPress={() => toggleExpanded(suggestion.id)}
                          style={styles.suggestionRowLeft}
                        >
                          <SuggestedIcon size={20} color="#6A6F76" />
                          <View style={styles.suggestionText}>
                            <Text variant="body" style={styles.spaceName}>
                              {suggestion.suggested_name}
                            </Text>
                            <Text style={styles.suggestionMeta}>
                              {suggestion.drop_ids.length} items · tap to preview
                            </Text>
                          </View>
                          <ChevronDown
                            size={16}
                            color="#6A6F76"
                            style={isExpanded ? styles.expandIconRotated : undefined}
                          />
                        </Pressable>
                        {/* Right side - tappable to create (separate touch target) */}
                        <Pressable
                          onPress={() => confirmCreateSpace(suggestion)}
                          style={styles.addButton}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.addButtonText}>Add →</Text>
                        </Pressable>
                      </View>
                      {isExpanded && <SuggestionItemsList dropIds={suggestion.drop_ids} />}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.spacesList}>
                {/* Existing Spaces */}
                {spaces.map((space, index) => (
                  <View
                    key={space.id}
                    style={[
                      styles.spaceRow,
                      index < spaces.length - 1 && styles.spaceRowWithDivider,
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on')
                          .toString()
                          .trim()
                          .toLowerCase();
                        const v3 =
                          raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
                        if (v3) {
                          navigation.navigate('SpaceHome', { spaceId: space.id });
                        } else {
                          navigation.navigate('SpaceDetail', { id: space.id });
                        }
                      }}
                      testID={`space-item-${space.id}`}
                      style={styles.spaceRowContent}
                    >
                      {(() => {
                        const SpaceIcon = getSpaceIcon(space.name);
                        return <SpaceIcon size={20} color="#6A6F76" />;
                      })()}
                      <Text variant="body" style={styles.spaceName}>
                        {space.name}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleSpaceMenu(space)}
                      style={styles.spaceMenu}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.spaceMenuIcon}>⋯</Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              {/* Section divider between spaces and suggestions */}
              {spaces.length > 0 && newSpaceSuggestions.length > 0 && (
                <View style={styles.suggestionDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>✨ Gremly suggestions</Text>
                  <View style={styles.dividerLine} />
                </View>
              )}
              {newSpaceSuggestions.length > 0 && (
                <Text style={styles.suggestionSubtext}>new spaces</Text>
              )}

              {/* Suggested Spaces - appear after divider */}
              {newSpaceSuggestions.length > 0 && (
                <View style={styles.spacesList}>
                  {newSpaceSuggestions.slice(0, 3).map((suggestion) => {
                    const isExpanded = expandedSuggestions.has(suggestion.id);
                    const SuggestedIcon = getSpaceIcon(suggestion.suggested_name || '');
                    return (
                      <View key={suggestion.id} style={styles.suggestionContainer}>
                        <View style={styles.suggestionRowWrapper}>
                          {/* Left side - tappable to expand/collapse */}
                          <Pressable
                            onPress={() => toggleExpanded(suggestion.id)}
                            style={styles.suggestionRowLeft}
                          >
                            <SuggestedIcon size={20} color="#6A6F76" />
                            <View style={styles.suggestionText}>
                              <Text variant="body" style={styles.spaceName}>
                                {suggestion.suggested_name}
                              </Text>
                              <Text style={styles.suggestionMeta}>
                                {suggestion.drop_ids.length} items · tap to preview
                              </Text>
                            </View>
                            <ChevronDown
                              size={16}
                              color="#6A6F76"
                              style={isExpanded ? styles.expandIconRotated : undefined}
                            />
                          </Pressable>
                          {/* Right side - tappable to create (separate touch target) */}
                          <Pressable
                            onPress={() => confirmCreateSpace(suggestion)}
                            style={styles.addButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Text style={styles.addButtonText}>Add →</Text>
                          </Pressable>
                        </View>
                        {isExpanded && <SuggestionItemsList dropIds={suggestion.drop_ids} />}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Temporary test button - move to bottom, remove before shipping */}
          {__DEV__ && (
            <Pressable
              onPress={async () => {
                try {
                  const userId = useGremlyStore.getState().userId;
                  const response = await fetch(
                    'https://gremly-inngest-jobs.woolmerjames.workers.dev/api/generate-space-suggestions',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ user_id: userId }),
                    },
                  );
                  const result = await response.json();
                  console.log('[Test] Space suggestions result:', result);
                  await useGremlyStore.getState().fetchSpaceSuggestions();
                  Alert.alert('Done', JSON.stringify(result));
                } catch (err) {
                  console.error('[Test] Error:', err);
                  Alert.alert('Error', err instanceof Error ? err.message : 'Unknown error');
                }
              }}
              style={styles.testButton}
            >
              <Text style={styles.testButtonText}>🧪 Generate Space Suggestions</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F1',
  },
  animatedContainer: {
    flex: 1,
    backgroundColor: '#F9F6F1',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitleImage: {
    height: 34,
    width: 140,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100, // Account for tab bar
  },
  createSpaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8F0E9',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  createSpaceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E5540',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 16,
  },
  emptyStateWithSuggestions: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  suggestionsIntro: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500',
    color: '#6A6F76',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 20,
    fontWeight: '600',
    color: '#222222',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '500',
    color: '#6A6F76',
    marginTop: 8,
    textAlign: 'center',
  },
  spacesList: {
    backgroundColor: '#F9F6F1',
    borderRadius: 16,
    overflow: 'hidden',
  },
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#F9F6F1',
  },
  spaceRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  spaceRowWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  spaceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222222',
    flex: 1,
  },
  spaceMenu: {
    padding: 4,
  },
  spaceMenuIcon: {
    fontSize: 20,
    color: '#6A6F76',
    lineHeight: 20,
  },
  suggestionRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#F9F6F1',
  },
  suggestionRowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
    paddingVertical: 14,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMeta: {
    fontSize: 13,
    color: '#6A6F76',
    marginTop: 2,
  },
  addButton: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E5540',
  },
  suggestionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6A6F76',
    paddingHorizontal: 12,
  },
  suggestionSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  suggestionContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  expandIconRotated: {
    transform: [{ rotate: '180deg' }],
  },
  itemsList: {
    paddingLeft: 32,
    paddingBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6A6F76',
    marginRight: 10,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    color: '#222222',
  },
  itemType: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 8,
    textTransform: 'capitalize',
  },
  testButton: {
    padding: 16,
    backgroundColor: '#E0C47A',
    borderRadius: 8,
    marginTop: 32,
    opacity: 0.6,
  },
  testButtonText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default SpacesScreen;
