import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, View, StyleSheet } from 'react-native';
import TodayScreen from '../app/tabs/TodayScreen';
import HubScreen from '../app/tabs/HubScreen';
import SpacesScreen from '../app/tabs/SpacesScreen';

// Tab bar icons
import TODAY_ICON from '../assets/todayiconnobg.png';
import SEARCH_ICON from '../assets/searchiconnobg.png';
import GREMLY_BUTTON from '../assets/buttonforHP.png';

/**
 * Tab navigator param list for type safety
 */
export type TabParamList = {
  Today: undefined;
  Gremly: undefined;
  Search: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

// Brand colors
const MOSS_GREEN = '#2E5540';
const LINEN_CREAM = '#F9F6F1';
const LINEN_GRAY = '#E3E0D9';

/**
 * TabIcon - Renders tab bar icons with focus state
 */
function TabIcon({
  source,
  focused,
  size = 26,
  tinted = true,
}: {
  source: any;
  focused: boolean;
  size?: number;
  tinted?: boolean;
}) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
      <Image
        source={source}
        style={[
          { width: size, height: size },
          { opacity: focused ? 1 : 0.6 },
          tinted && { tintColor: MOSS_GREEN },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

/**
 * TabNavigator - Main bottom tab navigation
 *
 * Three tabs:
 * - Today: Daily view with todos, habits, and schedule
 * - Gremly: Home screen with MindDrop capture + Spaces list
 * - Search: Global search across all content (formerly Hub)
 */

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Gremly"
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
          tabBarIcon: ({ focused }) => <TabIcon source={TODAY_ICON} focused={focused} size={26} />,
        }}
      />
      <Tab.Screen
        name="Gremly"
        component={SpacesScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon source={GREMLY_BUTTON} focused={focused} size={32} tinted={false} />
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={HubScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon source={SEARCH_ICON} focused={focused} size={26} />,
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
