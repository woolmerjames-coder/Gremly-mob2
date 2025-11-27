import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TodayScreen from '../app/tabs/TodayScreen';
import HubScreen from '../app/tabs/HubScreen';
import SpacesScreen from '../app/tabs/SpacesScreen';
import MeScreen from '../app/tabs/MeScreen';

const Tab = createBottomTabNavigator();

/**
 * TabNavigator - Main bottom tab navigation
 *
 * All screens now use Design System (DS) implementation.
 * Legacy Tailwind screens have been removed (Phase H).
 */

export default function TabNavigator() {
  return (
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
  );
}
