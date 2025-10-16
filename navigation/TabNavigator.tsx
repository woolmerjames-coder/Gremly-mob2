import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FLAGS } from '../config/flags';
import MeScreen from '../app/tabs/MeScreen';

const Tab = createBottomTabNavigator();

/**
 * TabNavigator - Main bottom tab navigation
 *
 * Feature Flag: FLAGS.USE_DS_UI
 * - When true: Uses DS-migrated screens (Today, Hub, Spaces from C4/C5)
 * - When false: Uses legacy Tailwind screens (to be preserved for fallback)
 *
 * Note: Today, Hub, and Spaces in app/tabs/ are already DS-migrated.
 * For true legacy fallback, we'd need to preserve pre-C4/C5 versions.
 * For now, DS path points to current migrated versions.
 */

// Conditional lazy imports based on feature flag
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TodayScreen = FLAGS.USE_DS_UI
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../app/tabs/TodayScreen').default // DS version (migrated in C4)
  : // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../app/tabs/TodayScreen').default; // TODO: Preserve legacy pre-C4 version if needed

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HubScreen = FLAGS.USE_DS_UI
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../app/tabs/HubScreen').default // DS version (migrated in C5)
  : // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../app/tabs/HubScreen').default; // TODO: Preserve legacy pre-C5 version if needed

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SpacesScreen = FLAGS.USE_DS_UI
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../screens2/Spaces').default // DS version (separate file)
  : // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../app/tabs/SpacesScreen').default; // Legacy Tailwind version

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
