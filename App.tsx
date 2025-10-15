import 'react-native-gesture-handler'; // must be first
import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SheetProvider } from 'react-native-actions-sheet';

import { ThemeProvider } from './providers/ThemeProvider';
import { OverlayHost } from './components/OverlayHost';

import TodayScreen from './app/tabs/TodayScreen';
import HubScreen from './app/tabs/HubScreen';
import SpacesScreen from './app/tabs/SpacesScreen';
import MeScreen from './app/tabs/MeScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SheetProvider>
          <ThemeProvider>
            <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Tab.Navigator
                screenOptions={{
                  headerShown: false,
                  tabBarActiveTintColor: '#86E5C2',
                  tabBarInactiveTintColor: '#4B5B5B',
                  tabBarStyle: {
                    height: 60,
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderTopWidth: 1,
                    borderTopColor: '#D8E1DF',
                    backgroundColor: '#FFF7EA',
                  },
                  tabBarLabelStyle: { fontSize: 12 },
                }}
              >
                <Tab.Screen name="Today" component={TodayScreen} />
                <Tab.Screen name="Hub" component={HubScreen} />
                <Tab.Screen name="Spaces" component={SpacesScreen} />
                <Tab.Screen name="Me" component={MeScreen} />
              </Tab.Navigator>
              <OverlayHost />
            </NavigationContainer>
          </ThemeProvider>
        </SheetProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
