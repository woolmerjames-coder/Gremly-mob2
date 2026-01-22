import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, StyleSheet } from 'react-native';
import TodayScreen from '../app/tabs/TodayScreen';
import HubScreen from '../app/tabs/HubScreen';
import SpacesScreen from '../app/tabs/SpacesScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

// Tab bar icon images (v1.20 brand refresh)
import TODAY_ICON from '../assets/todayicon1.22.png';
import MINDDROP_ICON from '../assets/minddropicon1.20.png';
import SPACES_ICON from '../assets/spacesicon1.20.png';
import HUB_ICON from '../assets/hubicon1.20.png';

/**
 * Tab navigator param list for type safety
 */
export type TabParamList = {
  Today: undefined;
  MindDrop: undefined;
  Spaces: undefined;
  Hub: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

// Brand colors
const MOSS_GREEN = '#2E5540';
const LINEN_CREAM = '#F9F6F1';
const LINEN_GRAY = '#E3E0D9';

/**
 * TabNavigator - Main bottom tab navigation
 *
 * Four tabs:
 * - Today: Daily view with todos, habits, and schedule
 * - MindDrop: Quick capture notepad
 * - Spaces: Browse and manage Spaces
 * - Hub: Global search across all content
 */

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="MindDrop"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: MOSS_GREEN,
        tabBarInactiveTintColor: MOSS_GREEN,
        tabBarStyle: {
          height: 72,
          paddingTop: 6,
          paddingBottom: 20,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: LINEN_GRAY,
          backgroundColor: LINEN_CREAM,
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
      <Tab.Screen
        name="Hub"
        component={HubScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Image
              source={HUB_ICON}
              style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
              resizeMode="contain"
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
