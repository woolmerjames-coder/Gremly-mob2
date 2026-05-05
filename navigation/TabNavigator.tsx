import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, StyleSheet } from 'react-native';
import TodayScreen from '../app/tabs/TodayScreen';
import SpacesScreen from '../app/tabs/SpacesScreen';
import WorldsScreen from '../app/tabs/WorldsScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import AskGremlyScreen from '../app/tabs/AskGremlyScreen';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { lightTokens } from '../design/tokens';

// Tab bar icon images (v1.20 brand refresh)
import TODAY_ICON from '../assets/todayicon1.22.png';
import MINDDROP_ICON from '../assets/minddropicon1.20.png';
import SPACES_ICON from '../assets/spacesicon1.20.png';
import ASK_GREMLY_ICON from '../assets/askgremlyicon.png';
import WORLDS_ICON from '../assets/worldicon4.28.png';

/**
 * Tab navigator param list for type safety
 */
export type TabParamList = {
  Today: undefined;
  MindDrop: undefined;
  AskGremly: { prefillPrompt?: string } | undefined;
  Spaces: undefined;
  Worlds: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * TabNavigator - Main bottom tab navigation
 *
 * Four tabs:
 * - Today: Daily view with todos, habits, and schedule
 * - MindDrop: Quick capture notepad
 * - AskGremly: Chat with Gremly
 * - Spaces: Browse and manage Spaces (non-testers)
 * - Worlds: Worlds & Chapters index (testers only)
 */

export default function TabNavigator() {
  const isTester = useGremlyStore((s) => s.isTester);

  return (
    <Tab.Navigator
      initialRouteName="MindDrop"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightTokens.colors.moss,
        tabBarInactiveTintColor: lightTokens.colors.moss,
        tabBarStyle: {
          height: 72,
          paddingTop: 6,
          paddingBottom: 20,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: lightTokens.colors.border,
          backgroundColor: lightTokens.colors.linenCream,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '400',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Image
              source={TODAY_ICON}
              style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="MindDrop"
        component={CatchAllNotepad}
        options={{
          tabBarIcon: ({ focused }) => (
            <Image
              source={MINDDROP_ICON}
              style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="AskGremly"
        component={AskGremlyScreen}
        options={{
          tabBarLabel: 'Ask Gremly',
          tabBarIcon: ({ focused }) => (
            <Image
              source={ASK_GREMLY_ICON}
              style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
              resizeMode="contain"
            />
          ),
        }}
      />
      {isTester ? (
        <Tab.Screen
          name="Worlds"
          component={WorldsScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <Image
                source={WORLDS_ICON}
                style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
                resizeMode="contain"
              />
            ),
            tabBarLabel: 'Worlds',
          }}
        />
      ) : (
        <Tab.Screen
          name="Spaces"
          component={SpacesScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <Image
                source={SPACES_ICON}
                style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
                resizeMode="contain"
              />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
}
