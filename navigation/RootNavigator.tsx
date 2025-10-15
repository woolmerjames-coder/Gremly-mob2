import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import DevLogin from '../app/(dev)/DevLogin';
import SpaceDetailScreen from '../app/screens/SpaceDetailScreen';

export type RootStackParamList = {
  Tabs: undefined;
  DSPreview: undefined;
  DevLogin: undefined;
  SpaceDetail: { id: string };
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
