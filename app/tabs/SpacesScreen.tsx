/**
 * =============================================================================
 * GREMLY HOME SCREEN (formerly Spaces Screen)
 * =============================================================================
 *
 * REDESIGN TARGET: This screen is being transformed into the new Gremly homepage.
 *
 * PLANNED STRUCTURE:
 * 1. Greeting section (personalized welcome message)
 * 2. Mind Drop section (quick capture interface)
 * 3. Spaces Preview section (overview of user's spaces)
 *
 * CURRENT IMPLEMENTATION:
 * - DS-only implementation (no Tailwind)
 * - Displays list of user's Spaces with search
 * - Catch-All prominent card at top
 * - Phase H: Uses NewSpaceModal instead of NewSpace screen route
 *
 * NAVIGATION INTEGRATION:
 * - Registered in TabNavigator as "Spaces" tab (3rd position)
 * - Routes TO: CatchAllNotepad, SpaceHome, SpaceDetail, NewSpaceModal
 * - TestID: "spaces-screen" (used by automated tests)
 *
 * CRITICAL TEST IDs (DO NOT CHANGE):
 * - "spaces-screen" - Main screen container
 * - "spaces-catchall-button" - Catch-All card (navigates to CatchAllNotepad)
 * - "spaces-new" - New Space button in header
 * - "spaces-search" - Search input field
 * - "spaces-empty-cta" - New Space button in empty state
 * - "space-item-{spaceId}" - Individual space list items
 *
 * SAFE TO MODIFY:
 * - Visual layout and styling (Card, Box, Text components)
 * - Search functionality (can be moved/redesigned)
 * - Empty state messaging and design
 * - Header row layout and spacing
 * - Space list presentation (grid vs list, card style, etc.)
 *
 * MUST PRESERVE:
 * - Navigation routes: CatchAllNotepad, SpaceHome/SpaceDetail, NewSpaceModal
 * - All testID attributes (referenced by test suites)
 * - Core functionality: load spaces, search, create new space
 * - Error handling and authentication checks
 * - EXPO_PUBLIC_SPACE_V3 feature flag logic for navigation
 *
 * =============================================================================
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SheetManager } from 'react-native-actions-sheet';
import { StyleSheet, View, Image, Pressable, Alert, Modal, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Plus, X, ChevronRight } from 'lucide-react-native';

// Images for Mind Drop hero and Spaces section
import BUTTON_HP from '../../assets/buttonforHP.png';
import GREMLY_WAVING from '../../assets/gremlywaving.png';
import GREMLY_WORDMARK from '../../assets/gremly_wordmark-removebg.png';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { setNewSpaceCallback } from '../../components/NewSpaceModal';
import { useReducedMotion } from '../../design/animations';

// Helper to get space icon based on name
const getSpaceIcon = (name: string) => {
  if (/fit|gym|run|health|workout/i.test(name)) return '🏃';
  if (/work|job|proj|career/i.test(name)) return '💼';
  if (/travel|trip|vacation/i.test(name)) return '✈️';
  if (/home|house|family/i.test(name)) return '🏠';
  if (/learn|study|book|education/i.test(name)) return '📚';
  return '📁';
};

function GremlyHomeScreen() {
  const repo = useRepo();
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isReducedMotion = useReducedMotion();

  // State
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string; description?: string }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [spacesModalVisible, setSpacesModalVisible] = useState(false);

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

  // Handle space menu (three-dot menu)
  const handleSpaceMenu = useCallback(
    (space: { id: string; name: string }) => {
      Alert.alert(space.name, 'Choose an action', [
        {
          text: 'Delete space',
          style: 'destructive',
          onPress: async () => {
            try {
              await repo.deleteSpace(space.id);
              setSpaces((prev) => prev.filter((s) => s.id !== space.id));
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
    [repo],
  );

  // Use all spaces directly (search removed for simplified tile UI)

  return (
    <Animated.View
      style={{ flex: 1, backgroundColor: '#F9F6F1' }}
      entering={isReducedMotion || __DEV__ ? undefined : FadeIn.duration(150)}
    >
      <Screen scroll padded={false} testID="spaces-screen" style={{ backgroundColor: '#F9F6F1' }}>
        {dsMarker}

        {/* Top Navigation Bar */}
        <View style={styles.topNavBar}>
          <Image source={GREMLY_WORDMARK} style={styles.topNavWordmark} resizeMode="contain" />
        </View>
        <View style={styles.topNavDivider} />

        {/* Hero Section - Centered Mascot */}
        <View style={styles.heroSection}>
          <Image source={GREMLY_WAVING} style={styles.heroMascot} resizeMode="contain" />
          <Text style={styles.heroText}>So… where do we begin?</Text>
        </View>

        {/* Error state - with padding */}
        {error && (
          <View style={styles.paddedContent}>
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
          </View>
        )}

        {/* Feature Grid - 2 Column Layout */}
        <View style={styles.featureGrid}>
          {/* MindDrop Tile */}
          <View style={styles.featureGridLeft}>
            <Pressable
              onPress={() => navigation.navigate('CatchAllNotepad')}
              testID="spaces-catchall-button"
              accessibilityRole="button"
              accessibilityLabel="Open Mind Drop"
              style={({ pressed }) => [
                styles.featureTile,
                styles.mindDropTile,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <View style={styles.featureTileContent}>
                <Image source={BUTTON_HP} style={styles.featureTileIcon} resizeMode="contain" />
                <Text style={styles.featureTileTitle}>MindDrop</Text>
                <Text style={styles.featureTileDescription}>Drop thoughts here</Text>
              </View>
              <ChevronRight size={20} color="#2E5540" style={styles.featureTileChevron} />
            </Pressable>
          </View>

          {/* Spaces Tile */}
          <View style={styles.featureGridRight}>
            <Pressable
              onPress={() => setSpacesModalVisible(true)}
              testID="spaces-new"
              accessibilityRole="button"
              accessibilityLabel="Open Spaces"
              style={({ pressed }) => [
                styles.featureTile,
                styles.spacesTile,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <View style={styles.featureTileContent}>
                <Image source={BUTTON_HP} style={styles.featureTileIcon} resizeMode="contain" />
                <Text style={styles.featureTileTitle}>Spaces</Text>
                <Text style={styles.featureTileDescription}>Organize by project</Text>
              </View>
              <ChevronRight size={20} color="#5A6199" style={styles.featureTileChevron} />
            </Pressable>
          </View>
        </View>

        {/* Philosophy Footer */}
        <View style={styles.philosophyFooter}>
          <Image source={BUTTON_HP} style={styles.philosophyIcon} resizeMode="contain" />
          <Text style={styles.philosophyText}>From scattered to unstoppable.</Text>
        </View>
      </Screen>

      {/* Spaces Modal */}
      <Modal
        visible={spacesModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSpacesModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Spaces</Text>
            <Pressable
              onPress={() => setSpacesModalVisible(false)}
              style={styles.modalCloseButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color="#6A6F76" />
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Create Space Button */}
            <Pressable
              onPress={() => {
                setSpacesModalVisible(false);
                onCreateSpace();
              }}
              testID="spaces-empty-cta"
              style={({ pressed }) => [styles.createSpaceButton, pressed && { opacity: 0.9 }]}
            >
              <Plus size={20} color="#2E5540" />
              <Text style={styles.createSpaceButtonText}>Create a Space</Text>
            </Pressable>

            {/* Spaces List */}
            {spaces.length === 0 ? (
              <View style={styles.emptySpacesModal}>
                <Image
                  source={require('../../assets/mascot/ACTUAL GREMLY.png')}
                  style={styles.emptyMascot}
                  resizeMode="contain"
                />
                <Text variant="title" style={styles.emptyTitle}>
                  No spaces yet
                </Text>
                <Text variant="body" style={styles.emptySubtitle}>
                  Create one to organize by topic.
                </Text>
              </View>
            ) : (
              <View style={styles.spacesListModal}>
                {spaces.map((space, index) => (
                  <View
                    key={space.id}
                    style={[
                      styles.spaceRowModal,
                      index < spaces.length - 1 && styles.spaceRowWithDivider,
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        setSpacesModalVisible(false);
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
                      <Text style={styles.spaceEmoji}>{getSpaceIcon(space.name)}</Text>
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
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Top Navigation Bar
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F6F1', // Linen Cream
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  topNavWordmark: {
    height: 28,
    width: 90,
  },
  topNavDivider: {
    height: 1,
    backgroundColor: 'rgba(46, 85, 64, 0.12)', // Moss Green at ~12%
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 40,
    gap: 16,
  },
  heroMascot: {
    height: 150,
    width: 150,
  },
  heroText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 17,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
    textAlign: 'left',
    maxWidth: 140,
    lineHeight: 24,
  },
  paddedContent: {
    paddingHorizontal: 16,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Wrap on very small devices
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 28,
    paddingHorizontal: 20,
  },
  featureGridLeft: {
    flex: 1,
    marginRight: 10,
  },
  featureGridRight: {
    flex: 1,
    marginLeft: 10,
  },
  // Compact Feature Tile
  featureTile: {
    borderRadius: 16, // rounded-2xl
    padding: 16,
    minHeight: 160,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  featureTileContent: {
    flex: 1,
  },
  featureTileIcon: {
    width: 32,
    height: 32,
    marginBottom: 12,
  },
  featureTileTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 4,
  },
  featureTileDescription: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: 'rgba(34, 34, 34, 0.6)',
  },
  featureTileChevron: {
    marginLeft: 8,
  },
  mindDropTile: {
    backgroundColor: 'rgba(46, 85, 64, 0.08)', // Sage Mist - Gremly brand
  },
  spacesTile: {
    backgroundColor: 'rgba(156, 166, 224, 0.12)', // Periwinkle Smoke - Gremly brand
  },
  // Philosophy Footer
  philosophyFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 36,
    marginBottom: 80,
    gap: 8,
  },
  philosophyIcon: {
    width: 16,
    height: 16,
    tintColor: '#2E5540', // Moss Green
  },
  philosophyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: 'rgba(34, 34, 34, 0.5)', // Charcoal Ink at 50%
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 22,
    fontWeight: '600',
    color: '#222222',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
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
    color: '#2E5540', // Moss Green
  },
  emptySpacesModal: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  spacesListModal: {
    backgroundColor: '#F9F6F1', // Linen Cream
    borderRadius: 16,
    overflow: 'hidden',
  },
  spaceRowModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
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
  spaceEmoji: {
    fontSize: 20,
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
  emptyMascot: {
    width: 72,
    height: 72,
  },
  emptyTitle: {
    marginTop: 12, // spacing[3]
    textAlign: 'center',
  },
  emptySubtitle: {
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 4, // spacing[1]
  },
});

// Export as SpacesScreen to maintain compatibility with TabNavigator
export default GremlyHomeScreen;
