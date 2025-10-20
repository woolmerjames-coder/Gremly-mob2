import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import DevLogin from '../app/(dev)/DevLogin';
import SpaceDetailScreen from '../app/screens/SpaceDetailScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import PersonDetailScreen from '../app/people/PersonDetailScreen';

export type RootStackParamList = {
  Tabs: undefined;
  DSPreview: undefined;
  DevLogin: undefined;
  SpaceDetail: { id: string };
  CatchAllNotepad: undefined;
  PersonDetail: { personName: string; personEmail?: string }; // Phase 8
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
        options={{
          title: 'Catch-All',
          headerShown: true,
        }}
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
    </Stack.Navigator>
  );
}
