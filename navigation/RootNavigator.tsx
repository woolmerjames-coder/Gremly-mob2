import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import DSPreview from '../app/(dev)/DSPreview';

export type RootStackParamList = {
  Tabs: undefined;
  DSPreview: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="DSPreview"
        component={DSPreview}
        options={{
          title: 'Design System Preview',
          presentation: 'modal',
          headerShown: true,
        }}
      />
    </Stack.Navigator>
  );
}
