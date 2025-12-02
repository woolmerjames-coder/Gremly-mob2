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
import { StyleSheet, View, Image, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// Images for Mind Drop hero and Spaces section
import MINDDROP_HEADER from '../../assets/minddrop_header-removebg.png';
import BUTTON_HP from '../../assets/buttonforHP.png';
import SPACES_TITLE from '../../assets/spacestitle.png';
import GREMLY_WAVING from '../../assets/gremlywaving.png';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
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

  // Animation values for Mind Drop card press
  const mindDropScale = useSharedValue(1);
  const breathingScale = useSharedValue(1);

  // Breathing animation for Gremly button
  useEffect(() => {
    if (!isReducedMotion) {
      breathingScale.value = withRepeat(
        withTiming(1.03, {
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1, // infinite
        true, // reverse
      );
    }
  }, [isReducedMotion, breathingScale]);

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

  // Filter spaces by search query
  const filteredSpaces = q.trim()
    ? spaces.filter((s) => s.name?.toLowerCase().includes(q.toLowerCase()))
    : spaces;

  // Show all spaces on homepage
  const previewSpaces = filteredSpaces;

  // Space count label
  const spaceCountLabel = `${filteredSpaces.length} space${filteredSpaces.length === 1 ? '' : 's'}`;

  // Empty state (no spaces or filtered empty)
  const isEmpty = filteredSpaces.length === 0;

  // Animated styles for Mind Drop card
  const mindDropAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mindDropScale.value }],
  }));

  // Breathing animation style for Gremly button
  const breathingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathingScale.value }],
  }));

  // Press handlers for Mind Drop
  const handleMindDropPressIn = useCallback(() => {
    if (!isReducedMotion) {
      // eslint-disable-next-line react-hooks/immutability
      mindDropScale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
    }
  }, [isReducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMindDropPressOut = useCallback(() => {
    if (!isReducedMotion) {
      // eslint-disable-next-line react-hooks/immutability
      mindDropScale.value = withSpring(1, { damping: 15, stiffness: 150 });
    }
  }, [isReducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={{ flex: 1 }}
      entering={isReducedMotion || __DEV__ ? undefined : FadeIn.duration(150)}
    >
      <Screen scroll padded={false} testID="spaces-screen">
        {dsMarker}

        {/* Hero Section - New Welcome */}
        <View style={styles.heroSection}>
          <Image source={GREMLY_WAVING} style={styles.heroMascot} resizeMode="contain" />
          <Text style={styles.heroHeadline}>Hi, I'm Gremly — your calm companion.</Text>
          <Text style={styles.heroSubline}>Drop your thoughts. Build your spaces. Stay clear.</Text>
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

        {/* MindDrop Section - Full Width Band with Gradient */}
        <LinearGradient colors={['#c9ddcf', '#E8F4EA']} style={styles.mindDropSection}>
          <View style={styles.mindDropContent}>
            <Image
              source={MINDDROP_HEADER}
              style={styles.mindDropHeaderImage}
              resizeMode="contain"
            />
            <Text style={styles.mindDropHeadline}>Your brain dump, organized.</Text>
            <Text style={styles.mindDropDescription}>To-Dos • Habits • Anything</Text>
            <Pressable
              onPress={() => navigation.navigate('CatchAllNotepad')}
              onPressIn={handleMindDropPressIn}
              onPressOut={handleMindDropPressOut}
              testID="spaces-catchall-button"
              accessibilityRole="button"
              accessibilityLabel="Open Mind Drop"
            >
              <Animated.View style={mindDropAnimatedStyle}>
                <Animated.View style={[styles.mindDropPill, breathingAnimatedStyle]}>
                  <Image source={BUTTON_HP} style={styles.mindDropButton} resizeMode="contain" />
                  <Text style={styles.mindDropLabel}>Tap Gremly</Text>
                </Animated.View>
              </Animated.View>
            </Pressable>
            <Text style={styles.mindDropStat}>✨ 12 organized ever</Text>
          </View>
        </LinearGradient>

        {/* Section Divider */}
        <View style={styles.sectionDivider} />

        {/* Spaces Section - with padding */}
        <View style={styles.paddedContent}>
          {!error && (
            <Box gap={2}>
              <Box
                row
                style={{
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <View style={styles.spacesTitleContainer}>
                  <Image
                    source={SPACES_TITLE}
                    style={styles.spacesTitleImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.spacesSubtitle}>Organize by project or area.</Text>
                </View>
                <Button
                  title="New Space"
                  onPress={onCreateSpace}
                  testID="spaces-new"
                  variant="ghost"
                />
              </Box>

              {/* Spaces Preview (first 2) */}
              {isEmpty ? (
                <View style={styles.emptySpaces}>
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
                  <View style={{ marginTop: 8 }}>
                    <Button
                      title="Create a Space"
                      onPress={onCreateSpace}
                      testID="spaces-empty-cta"
                    />
                  </View>
                </View>
              ) : (
                <View>
                  {previewSpaces.map((space, index) => (
                    <View
                      key={space.id}
                      style={[
                        styles.spaceRow,
                        index < previewSpaces.length - 1 && styles.spaceRowWithDivider,
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
            </Box>
          )}
        </View>
      </Screen>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  heroMascot: {
    height: 150,
    width: 150,
    marginBottom: 16,
  },
  heroHeadline: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 28,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubline: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: 'rgba(34, 34, 34, 0.7)', // Charcoal Ink at 70%
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  paddedContent: {
    paddingHorizontal: 16,
  },
  mindDropSection: {
    backgroundColor: '#E8F4EA', // Light sage - full width band
    width: '100%',
    paddingVertical: 24,
    marginLeft: 0,
    marginRight: 0,
  },
  mindDropContent: {
    paddingHorizontal: 20,
  },
  mindDropHeaderImage: {
    height: 64,
    width: 162,
    alignSelf: 'center',
    marginBottom: 8,
  },
  mindDropHeadline: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 3,
    color: '#222222',
  },
  mindDropDescription: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    color: '#6A6F76',
    marginBottom: 20,
  },
  mindDropPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 8,
    borderRadius: 32,
    backgroundColor: '#2E5540', // Dark green
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    gap: 11,
    alignSelf: 'center',
    marginBottom: 12,
  },
  mindDropButton: {
    width: 48,
    height: 48,
  },
  mindDropLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#F9F6F1', // Cream
  },
  mindDropStat: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 0,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#D1D5DB',
    opacity: 0.7,
    marginTop: 24,
    marginBottom: 20,
    marginHorizontal: 16,
  },
  spacesTitleContainer: {
    alignItems: 'flex-start',
    marginLeft: -4,
  },
  spacesTitleImage: {
    height: 38,
    width: 160,
    marginBottom: 4,
  },
  spacesSubtitle: {
    fontSize: 15,
    opacity: 0.7,
    color: '#6A6F76',
    marginLeft: 2,
  },
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
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
  emptySpaces: {
    alignItems: 'center',
    marginTop: 16, // spacing[4]
    paddingVertical: 24, // spacing[6]
    paddingHorizontal: 16, // spacing[4]
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
