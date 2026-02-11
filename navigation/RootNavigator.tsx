import React, { useMemo } from 'react';
import { Image, StyleSheet, Dimensions } from 'react-native';
import Animated, { SlideOutUp, Easing } from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../providers/AuthProvider';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { useDropRecovery } from '../hooks/useDropRecovery';
import { Text } from '../ui';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../assets/mascot/gremly-mascot.png');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

import LoginScreen from '../app/screens/LoginScreen';
import TabNavigator from './TabNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import DevLogin from '../app/(dev)/DevLogin';
import RecentItems from '../app/(dev)/RecentItems';
import DevTools from '../app/(dev)/DevTools';
import SpaceDetailScreen from '../app/screens/SpaceDetailScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import SweepFlowScreen from '../app/screens/SweepFlowScreen';
import OnboardingScreen from '../app/screens/OnboardingScreen';
import PersonDetailScreen from '../app/people/PersonDetailScreen';
import SpaceHomeScreen from '../app/spaces/SpaceHomeScreen';
import ChatThreadScreen from '../app/spaces/ChatThreadScreen';
import { ListsScreen } from '../app/screens/ListsScreen';
import ArchivedItemsScreen from '../app/screens/ArchivedItemsScreen';
import SweepTestScreen from '../app/screens/SweepTestScreen';
import CalendarScreen from '../app/screens/CalendarScreen';
import HabitsScreen from '../app/screens/HabitsScreen';
import HabitDetailScreen from '../app/screens/HabitDetailScreen';
import SettingsScreen from '../app/screens/SettingsScreen';
import RitualsSettingsScreen from '../app/screens/RitualsSettingsScreen';
import TimeBlocksSettingsScreen from '../app/screens/TimeBlocksSettingsScreen';
import CalendarSettingsScreen from '../app/screens/CalendarSettingsScreen';
import WhatGremlyKnowsScreen from '../app/screens/WhatGremlyKnowsScreen';
import { HabitBuilderScreen } from '../screens/habits/HabitBuilderScreen';

// Wrapper to bridge navigation params to HabitBuilderScreen props
function HabitBuilderWrapper({ navigation, route }: any) {
  return (
    <HabitBuilderScreen
      prefill={route.params?.prefill}
      spaceId={route.params?.spaceId}
      onClose={() => navigation.goBack()}
      onHabitCreated={() => {
        navigation.goBack();
      }}
    />
  );
}

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  Tabs: undefined;
  DSPreview: undefined;
  DevLogin: undefined;
  DevTools: undefined;
  RecentItems: undefined;
  SpaceDetail: { id: string };
  CatchAllNotepad: undefined;
  PersonDetail: { personName: string; personEmail?: string };
  SpaceHome: { spaceId: string; openKeyDatesModal?: boolean };
  ChatThread: {
    spaceId: string;
    chatId?: string;
    goalContext?: {
      goal_id: string;
      goal_name: string;
      checkIns?: { title: string; created_at: string }[];
    };
    returnToKeyDates?: boolean;
  };
  Lists: undefined;
  Sweep: { initialStep?: number; initialCardIndex?: number } | undefined;
  ArchivedItems: { searchQuery?: string } | undefined;
  CalendarScreen: undefined;
  Habits: undefined;
  HabitDetail: { habitId: string };
  Settings: undefined;
  RitualsSettings: undefined;
  TimeBlocksSettings: undefined;
  CalendarSettings: undefined;
  WhatGremlyKnows: undefined;
  HabitBuilder: { prefill?: string; spaceId?: string } | undefined;
  SweepTest: undefined; // DEV only
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <Animated.View
      style={styles.loadingContainer}
      exiting={SlideOutUp.duration(400).easing(Easing.out(Easing.ease))}
    >
      <Image source={GREMLY_MASCOT} style={styles.loadingMascot} resizeMode="contain" />
      <Text style={styles.loadingText}>Gremly</Text>
    </Animated.View>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const onboardingCompletedAt = useGremlyStore((s) => s.onboardingCompletedAt);
  const isInitialized = useGremlyStore((s) => s.isInitialized);

  // Recover any pending drops from previous session
  useDropRecovery();

  // Determine initial route based on onboarding status
  const initialRouteName = useMemo(() => {
    if (!onboardingCompletedAt) return 'Onboarding';
    return 'Tabs';
  }, [onboardingCompletedAt]);

  // Show loading screen while auth or store is initializing
  if (loading || (user && !isInitialized)) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator initialRouteName={user ? initialRouteName : 'Login'}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{
              headerShown: false,
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen
            name="SpaceDetail"
            component={SpaceDetailScreen}
            options={{ title: 'Space', headerShown: true }}
          />
          <Stack.Screen
            name="CatchAllNotepad"
            component={CatchAllNotepad}
            options={{ headerShown: true }}
          />
          <Stack.Screen
            name="PersonDetail"
            component={PersonDetailScreen}
            options={{ title: 'Person', headerShown: false }}
          />
          <Stack.Screen
            name="SpaceHome"
            component={SpaceHomeScreen}
            options={{ title: 'Space', headerShown: false }}
            getId={({ params }) => params?.spaceId}
          />
          <Stack.Screen
            name="ChatThread"
            component={ChatThreadScreen}
            options={{ title: 'Chat', headerShown: false }}
            getId={({ params }) => `${params?.spaceId}-${params?.chatId ?? 'new'}`}
          />
          <Stack.Screen
            name="Lists"
            component={ListsScreen}
            options={{ title: 'Lists', headerShown: true }}
          />
          <Stack.Screen
            name="Sweep"
            component={SweepFlowScreen}
            options={{ headerShown: false, presentation: 'card', gestureEnabled: false }}
          />
          <Stack.Screen
            name="ArchivedItems"
            component={ArchivedItemsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CalendarScreen"
            component={CalendarScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="Habits"
            component={HabitsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="HabitDetail"
            component={HabitDetailScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="RitualsSettings"
            component={RitualsSettingsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="TimeBlocksSettings"
            component={TimeBlocksSettingsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="CalendarSettings"
            component={CalendarSettingsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="WhatGremlyKnows"
            component={WhatGremlyKnowsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="HabitBuilder"
            component={HabitBuilderWrapper}
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="DSPreview"
            component={DSPreview}
            options={{ title: 'Design System Preview', presentation: 'modal', headerShown: true }}
          />
          {__DEV__ && (
            <Stack.Screen
              name="DevLogin"
              component={DevLogin}
              options={{
                title: 'Dev Login & Smoke Test',
                presentation: 'modal',
                headerShown: true,
              }}
            />
          )}
          {__DEV__ && (
            <Stack.Screen
              name="RecentItems"
              component={RecentItems}
              options={{ title: 'Recent Items', presentation: 'modal', headerShown: true }}
            />
          )}
          {__DEV__ && (
            <Stack.Screen
              name="SweepTest"
              component={SweepTestScreen}
              options={{ title: 'Sweep Test Mode', presentation: 'modal', headerShown: false }}
            />
          )}
          {__DEV__ && (
            <Stack.Screen
              name="DevTools"
              component={DevTools}
              options={{ title: 'Dev Tools', presentation: 'modal', headerShown: true }}
            />
          )}
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#BFD8C0',
  },
  loadingMascot: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 28,
    fontFamily: 'PlusJakartaSans-Bold',
    color: '#2D3A35',
    lineHeight: 40,
  },
});
