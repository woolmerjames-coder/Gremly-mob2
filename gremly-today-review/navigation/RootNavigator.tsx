import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import DevLogin from '../app/(dev)/DevLogin';
import RecentItems from '../app/(dev)/RecentItems';
import SpaceDetailScreen from '../app/screens/SpaceDetailScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import PersonDetailScreen from '../app/people/PersonDetailScreen';
import SpaceHomeScreen from '../app/spaces/SpaceHomeScreen';
import ChatThreadScreen from '../app/spaces/ChatThreadScreen';
import { ListsScreen } from '../app/screens/ListsScreen';

export type RootStackParamList = {
  Tabs: undefined;
  DSPreview: undefined;
  DevLogin: undefined;
  RecentItems: undefined;
  SpaceDetail: { id: string };
  CatchAllNotepad: undefined;
  PersonDetail: { personName: string; personEmail?: string }; // Phase 8
  SpaceHome: { spaceId: string }; // Phase 8 Spaces v2
  ChatThread: { spaceId: string; chatId: string }; // Phase 10.5 - Updated to include spaceId
  Lists: undefined; // Phase 10.7 Lists UX
  // NewSpace removed - now using NewSpaceModal (Phase H)
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="SpaceDetail"
        component={SpaceDetailScreen}
        options={{
          title: 'Space',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="CatchAllNotepad"
        component={CatchAllNotepad}
        options={{ headerShown: true }}
      />
      {/* Phase 8: Person Detail Screen */}
      <Stack.Screen
        name="PersonDetail"
        component={PersonDetailScreen}
        options={{
          title: 'Person',
          headerShown: false, // Using custom header in component
        }}
      />
      {/* Phase 8 Spaces v2: Space Home Screen */}
      <Stack.Screen
        name="SpaceHome"
        component={SpaceHomeScreen}
        options={{
          title: 'Space',
          headerShown: false, // v33 uses custom header
        }}
      />
      {/* Phase 8 Spaces v2: Chat Thread Screen */}
      <Stack.Screen
        name="ChatThread"
        component={ChatThreadScreen}
        options={{
          title: 'Chat',
          headerShown: true,
        }}
      />
      {/* Phase 10.7: Lists UX */}
      <Stack.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          title: 'Lists',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="DSPreview"
        component={DSPreview}
        options={{
          title: 'Design System Preview',
          presentation: 'modal',
          headerShown: true,
        }}
      />
      {/* DEV-ONLY: Phase 4 auth & repo smoke test */}
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
      {/* DEV-ONLY: Recent Items */}
      {__DEV__ && (
        <Stack.Screen
          name="RecentItems"
          component={RecentItems}
          options={{
            title: 'Recent Items',
            presentation: 'modal',
            headerShown: true,
          }}
        />
      )}
    </Stack.Navigator>
  );
}
