import React from 'react';
import { Image, StyleSheet, Dimensions } from 'react-native';
import Animated, { SlideOutUp, Easing } from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../providers/AuthProvider';
import { Text } from '../ui';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../assets/mascot/gremly-mascot.png');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

import LoginScreen from '../app/screens/LoginScreen';
import TabNavigator from './TabNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import DevLogin from '../app/(dev)/DevLogin';
import RecentItems from '../app/(dev)/RecentItems';
import SpaceDetailScreen from '../app/screens/SpaceDetailScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import SweepFlowScreen from '../app/screens/SweepFlowScreen';
import PersonDetailScreen from '../app/people/PersonDetailScreen';
import SpaceHomeScreen from '../app/spaces/SpaceHomeScreen';
import ChatThreadScreen from '../app/spaces/ChatThreadScreen';
import { ListsScreen } from '../app/screens/ListsScreen';
import ArchivedItemsScreen from '../app/screens/ArchivedItemsScreen';
import SweepTestScreen from '../app/screens/SweepTestScreen';

export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  DSPreview: undefined;
  DevLogin: undefined;
  RecentItems: undefined;
  SpaceDetail: { id: string };
  CatchAllNotepad: undefined;
  PersonDetail: { personName: string; personEmail?: string };
  SpaceHome: { spaceId: string };
  ChatThread: { spaceId: string; chatId?: string };
  Lists: undefined;
  Sweep: { initialStep?: number; initialCardIndex?: number } | undefined;
  ArchivedItems: { searchQuery?: string } | undefined;
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

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
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
          />
          <Stack.Screen
            name="ChatThread"
            component={ChatThreadScreen}
            options={{ title: 'Chat', headerShown: false }}
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
