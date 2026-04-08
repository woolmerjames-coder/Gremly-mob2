import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../providers/AuthProvider';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { useDropRecovery } from '../hooks/useDropRecovery';

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
import TrialIntroScreen from '../app/screens/TrialIntroScreen';
import TrialEndPaywallScreen from '../app/screens/TrialEndPaywallScreen';
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
import { MorningBriefSheet } from '../app/components/morning-brief/MorningBriefSheet';
import WeeklySummaryScreen from '../app/screens/WeeklySummaryScreen';
import WeeklySummaryV2Screen from '../app/screens/WeeklySummaryV2Screen';
import HubScreen from '../app/tabs/HubScreen';

// Wrapper to bridge navigation params to MorningBriefSheet props
function MorningBriefWrapper({ navigation, route }: any) {
  return (
    <MorningBriefSheet onClose={() => navigation.goBack()} targetDate={route.params?.targetDate} />
  );
}

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

// Placeholder until Phase 6 builds the screen
const GraduationFlowPlaceholder = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text>Graduation Flow - Coming Soon</Text>
  </View>
);

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  TrialIntro: undefined;
  TrialEndPaywall: undefined;
  TrainingIntro: undefined; // kept for type compat, screen removed
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
  Sweep: { initialStep?: number; initialCardIndex?: number; demoMode?: boolean } | undefined;
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
  MorningBrief: { targetDate?: string } | undefined;
  WeeklySummary: { weekStartDate?: string } | undefined;
  WeeklySummaryV2: { weekStartDate?: string } | undefined;
  GraduationFlow: undefined;
  SweepTest: undefined; // DEV only
  HubScreen: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const onboardingCompletedAt = useGremlyStore((s) => s.onboardingCompletedAt);
  const isInitialized = useGremlyStore((s) => s.isInitialized);

  // Wait for MMKV hydration so onboardingCompletedAt is available from persisted state
  const [hasHydrated, setHasHydrated] = useState(useGremlyStore.persist.hasHydrated());

  useEffect(() => {
    if (hasHydrated) return;
    const unsub = useGremlyStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
    return unsub;
  }, [hasHydrated]);

  // Recover any pending drops from previous session
  useDropRecovery();

  const isReady = hasHydrated && !(loading && !user);
  const splashHidden = useRef(false);

  useEffect(() => {
    if (isReady && !splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  // Determine initial route based on onboarding and training status
  const initialRouteName = useMemo(() => {
    if (!onboardingCompletedAt) return 'Onboarding';
    return 'Tabs';
  }, [onboardingCompletedAt]);

  if (!isReady) {
    return <View style={styles.splashHolder} />;
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
          <Stack.Screen
            name="TrialIntro"
            component={TrialIntroScreen}
            options={{
              headerShown: false,
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="TrialEndPaywall"
            component={TrialEndPaywallScreen}
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
            name="MorningBrief"
            component={MorningBriefWrapper}
            options={{ headerShown: false, presentation: 'card', gestureEnabled: false }}
          />
          <Stack.Screen
            name="WeeklySummary"
            component={WeeklySummaryScreen}
            options={{ headerShown: false, presentation: 'card', gestureEnabled: false }}
          />
          <Stack.Screen
            name="WeeklySummaryV2"
            component={WeeklySummaryV2Screen}
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
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
            name="GraduationFlow"
            component={GraduationFlowPlaceholder}
            options={{
              headerShown: false,
              gestureEnabled: false,
              presentation: 'fullScreenModal',
            }}
          />
          <Stack.Screen
            name="DSPreview"
            component={DSPreview}
            options={{ title: 'Design System Preview', presentation: 'modal', headerShown: true }}
          />
          <Stack.Screen
            name="HubScreen"
            component={HubScreen}
            options={{ headerShown: false, animation: 'slide_from_right' }}
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
  splashHolder: {
    flex: 1,
    backgroundColor: '#BFD8C0',
  },
});
