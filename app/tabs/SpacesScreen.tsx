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

import { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SheetManager } from 'react-native-actions-sheet';
import { StyleSheet, View, Image, Pressable, Alert, Modal, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, X, ChevronRight, Layers, ArrowDown } from 'lucide-react-native';

// Images for Mind Drop hero and Spaces section
import BUTTON_HP from '../../assets/buttonforHP.png';
import GREMLY_WORDMARK from '../../assets/gremly_wordmark-removebg.png';
import MINDDROP_HEADER from '../../assets/minddrop_header-removebg.png';
import SPACES_TITLE from '../../assets/spacestitle.png';

import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useActiveSpaces } from '../../lib/store/selectors';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { setNewSpaceCallback } from '../../components/CreateSpaceModal';
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
  const activeSpaces = useActiveSpaces();
  const deleteSpace = useGremlyStore((s) => s.deleteSpace);
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isReducedMotion = useReducedMotion();

  // Use activeSpaces directly - no mapping needed
  const spaces = activeSpaces;
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

  // Navigate to create (now opens modal instead of screen route)
  const onCreateSpace = useCallback(() => {
    // Set callback to navigate to the new space after creation
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
              // Zustand store handles state updates automatically
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

  // Use all spaces directly (search removed for simplified tile UI)

  return (
    <Animated.View
      style={{ flex: 1, backgroundColor: '#F9F6F1' }}
      entering={isReducedMotion || __DEV__ ? undefined : FadeIn.duration(150)}
    >
      <Screen padded={false} testID="spaces-screen" style={{ backgroundColor: '#F9F6F1', flex: 1 }}>
        {dsMarker}

        {/* Top Navigation Bar */}
        <View style={styles.topNavBar}>
          <Image source={GREMLY_WORDMARK} style={styles.topNavWordmark} resizeMode="contain" />
        </View>
        <View style={styles.topNavDivider} />

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

        {/* Main Home Content */}
        <View style={styles.homeContent}>
          {/* Spaces / Deep Mind section */}
          <Pressable
            onPress={() => setSpacesModalVisible(true)}
            testID="spaces-new"
            accessibilityRole="button"
            accessibilityLabel="Open Spaces"
            style={({ pressed }) => [styles.deepMindSection, pressed && styles.sectionPressed]}
          >
            {/* title image or text for Spaces */}
            <Image source={SPACES_TITLE} style={styles.sectionTitleSpaces} resizeMode="contain" />
            <View style={styles.sectionDividerSpaces} />
            <Text style={styles.sectionSubtitle}>
              Where your deeper thinking lives — projects, plans, habits, and research.
            </Text>
            <View style={styles.ctaPillSpaces}>
              <Text style={styles.ctaPillTextSpaces}>Go deeper</Text>
              <Layers size={18} color="#2E5540" style={{ marginLeft: 8 }} />
            </View>
          </Pressable>

          {/* Cortex node with circular Gremly head */}
          <View style={styles.cortexNode}>
            <Image source={BUTTON_HP} style={styles.cortexImage} resizeMode="contain" />
          </View>

          {/* Gradient bridge between Spaces and MindDrop */}
          <LinearGradient colors={['#F9F6F1', '#D6E4D3']} style={styles.gradientBridge} />

          {/* MindDrop / Surface Mind section */}
          <Pressable
            onPress={() => navigation.navigate('CatchAllNotepad')}
            testID="spaces-catchall-button"
            accessibilityRole="button"
            accessibilityLabel="Open MindDrop"
            style={({ pressed }) => [styles.surfaceMindSection, pressed && styles.sectionPressed]}
          >
            <Image
              source={MINDDROP_HEADER}
              style={styles.sectionTitleMindDrop}
              resizeMode="contain"
            />
            <View style={styles.sectionDividerMindDrop} />
            <Text style={styles.sectionSubtitle}>
              Drop anything on your mind — tasks, thoughts, ideas, reminders. I'll organize it for
              you.
            </Text>
            <View style={styles.ctaPillMindDrop}>
              <Text style={styles.ctaPillTextMindDrop}>Drop something</Text>
              <ArrowDown size={18} color="#F9F6F1" style={{ marginLeft: 8 }} />
            </View>
          </Pressable>
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
                  source={require('../../assets/mascot/gremly-mascot.png')}
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
    backgroundColor: 'rgba(46, 85, 64, 0.10)', // very soft Moss Green line
  },
  paddedContent: {
    paddingHorizontal: 16,
  },
  // Main Home Content wrapper - fills space and centers vertically
  homeContent: {
    flex: 1,
    alignSelf: 'stretch',
  },
  // Spaces / Deep Mind section - top block
  deepMindSection: {
    flex: 1,
    backgroundColor: '#F9F6F1', // Linen Cream for Spaces
    paddingHorizontal: 24,
    paddingTop: 56, // increased for content to sit lower
    paddingBottom: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  // MindDrop / Surface Mind section - bottom block
  surfaceMindSection: {
    flex: 1,
    backgroundColor: '#D6E4D3', // slightly richer, warmer than #DCE8D8
    paddingHorizontal: 24,
    paddingTop: 80, // increased for content to sit lower
    paddingBottom: 48,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  // Pressed state for sections
  sectionPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  // Section title images
  sectionTitleSpaces: {
    height: 44,
    maxWidth: 166,
  },
  sectionTitleMindDrop: {
    height: 51,
    maxWidth: 193,
  },
  // Section dividers
  sectionDividerSpaces: {
    height: 1,
    backgroundColor: 'rgba(156, 166, 224, 0.3)', // Periwinkle tint
    marginTop: 9,
    width: '28%',
    borderRadius: 999,
    alignSelf: 'center',
  },
  sectionDividerMindDrop: {
    height: 1,
    backgroundColor: 'rgba(46, 85, 64, 0.15)', // Moss Green tint
    marginTop: 9,
    width: '28%',
    borderRadius: 999,
    alignSelf: 'center',
  },
  // Shared section subtitle
  sectionSubtitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    color: 'rgba(34, 34, 34, 0.78)', // Charcoal Ink at 78%
    marginTop: 12,
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 25,
  },
  // Gradient bridge between Spaces and MindDrop zones
  gradientBridge: {
    height: 100,
    alignSelf: 'stretch',
    marginTop: -50,
    marginBottom: -50,
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 1,
  },
  // Cortex node - floating circular element between sections
  cortexNode: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -48, // slightly less overlap into cream
    marginBottom: -64, // slightly more overlap into sage
    zIndex: 10,
  },
  cortexImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  // CTA Pills (placeholder containers for now)
  ctaPillSpaces: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(156, 166, 224, 0.18)', // Periwinkle wash
    height: 48,
    minWidth: 200,
    borderRadius: 9999,
    paddingHorizontal: 26,
    alignSelf: 'center',
    marginTop: 18,
  },
  ctaPillTextSpaces: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
  },
  ctaPillMindDrop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E5540', // solid Moss Green
    height: 48,
    minWidth: 200,
    borderRadius: 9999,
    paddingHorizontal: 26,
    alignSelf: 'center',
    marginTop: 18,
  },
  ctaPillTextMindDrop: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: '#F9F6F1', // Linen Cream
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
