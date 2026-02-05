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

import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SheetManager } from 'react-native-actions-sheet';
import { StyleSheet, View, Pressable, Alert, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Plus } from 'lucide-react-native';

import SPACES_TITLE from '../../assets/spacestitle.png';

import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useActiveSpaces, useNewSpaceSuggestions } from '../../lib/store/selectors';
import { Text } from '../../ui';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { setNewSpaceCallback } from '../../components/CreateSpaceModal';
import { useReducedMotion } from '../../design/animations';
import { getSpaceIcon } from '../../lib/utils/spaceIconMatcher';
import MascotIcon from '../../components/MascotIcon';
import SpaceSuggestionCard from '../../components/spaces/SpaceSuggestionCard';

function SpacesScreen() {
  const activeSpaces = useActiveSpaces();
  const newSpaceSuggestions = useNewSpaceSuggestions();
  const deleteSpace = useGremlyStore((s) => s.deleteSpace);
  const createSpace = useGremlyStore((s) => s.createSpace);
  const acceptSuggestion = useGremlyStore((s) => s.acceptSuggestion);
  const declineSuggestion = useGremlyStore((s) => s.declineSuggestion);
  const assignDropsToSpace = useGremlyStore((s) => s.assignDropsToSpace);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isReducedMotion = useReducedMotion();

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

          {/* Space Suggestions (max 2) */}
          {newSpaceSuggestions.length > 0 && (
            <View style={styles.suggestionsSection}>
              {newSpaceSuggestions.slice(0, 2).map((suggestion) => (
                <SpaceSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onAccept={async () => {
                    try {
                      const newSpace = await createSpace({
                        name: suggestion.suggested_name || 'New Space',
                      });
                      await assignDropsToSpace(suggestion.drop_ids, newSpace.id);
                      await acceptSuggestion(suggestion.id);
                      navigation.navigate('SpaceHome', { spaceId: newSpace.id });
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'Failed to create space';
                      Alert.alert('Error', message);
                    }
                  }}
                  onDecline={() => declineSuggestion(suggestion.id)}
                />
              ))}
            </View>
          )}

          {/* Spaces List or Empty State */}
          {spaces.length === 0 ? (
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
          ) : (
            <View style={styles.spacesList}>
              {spaces.map((space, index) => (
                <View
                  key={space.id}
                  style={[styles.spaceRow, index < spaces.length - 1 && styles.spaceRowWithDivider]}
                >
                  <Pressable
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
  suggestionsSection: {
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 16,
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
});

export default SpacesScreen;
