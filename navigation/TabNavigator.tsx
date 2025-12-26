import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { CalendarDays, ArrowDown, Globe, Search } from 'lucide-react-native';
import TodayScreen from '../app/tabs/TodayScreen';
import HubScreen from '../app/tabs/HubScreen';
import SpacesScreen from '../app/tabs/SpacesScreen';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

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
 * TabIcon - Renders tab bar icons with focus state using Lucide icons
 */
function TabIcon({
  Icon,
  focused,
  size = 26,
}: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  focused: boolean;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconContainer,
        focused && styles.iconContainerFocused,
        { opacity: focused ? 1 : 0.6 },
      ]}
    >
      <Icon size={size} color={MOSS_GREEN} strokeWidth={focused ? 2 : 1.5} />
    </View>
  );
}

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
          tabBarIcon: ({ focused }) => <TabIcon Icon={CalendarDays} focused={focused} size={26} />,
        }}
      />
      <Tab.Screen
        name="MindDrop"
        component={CatchAllNotepad}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={ArrowDown} focused={focused} size={26} />,
        }}
      />
      <Tab.Screen
        name="Spaces"
        component={SpacesScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={Globe} focused={focused} size={26} />,
        }}
      />
      <Tab.Screen
        name="Hub"
        component={HubScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={Search} focused={focused} size={26} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerFocused: {
    marginTop: -2, // Subtle lift when active
  },
});
