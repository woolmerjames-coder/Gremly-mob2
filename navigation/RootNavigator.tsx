import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../providers/AuthProvider';

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
  Sweep: undefined;
  ArchivedItems: { searchQuery?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#5B7C6B" />
    </View>
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
    backgroundColor: '#FAF9F6',
  },
});
