import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import TodayScreen from '../app/tabs/TodayScreen';
import SpacesScreen from '../app/tabs/SpacesScreen';
import WorldsScreen from '../app/tabs/WorldsScreen';
import GremlyHomeScreen from '../app/tabs/GremlyHomeScreen';
import {
  GREMLY_BUTTON_IMAGE_SIZE,
  gremlyButtonFillHeight,
} from '../components/home/gremlyButtonFill';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import type { TalkAboutItem } from '../lib/chat/talkAboutOpeners';
import { lightTokens } from '../design/tokens';

// Tab bar icon images (v1.20 brand refresh)
import TODAY_ICON from '../assets/todayicon1.22.png';
import SPACES_ICON from '../assets/spacesicon1.20.png';
import WORLDS_ICON from '../assets/worldicon4.28.png';
import GREMLY_BUTTON from '../assets/buttonforHP.png';
import GREMLY_BUTTON_GREY from '../assets/buttonforHP-grey.png';

/**
 * Tab navigator param list for type safety
 */
export type TabParamList = {
  Today: undefined;
  /** Gremly home: Drop and Chat side by side. `mode` opens a page; the prefill
   *  params are read by the Chat page (AskGremlyScreen). */
  Gremly:
    | {
        mode?: 'drop' | 'chat';
        prefillPrompt?: string;
        autoSendKey?: string;
        /** Chat opens about this drop ("Talk it through with Gremly") */
        talkAbout?: TalkAboutItem;
        talkKey?: string;
        /** Daily brief in Chat: open today's thread (the notification, Plan with Gremly) */
        thread?: 'today';
        /** With thread: jump to a step of the brief once it has played ('plan') */
        step?: 'plan';
        /** Changes on every request, so the same thread can be asked for twice */
        threadKey?: string;
      }
    | undefined;
  Spaces: undefined;
  Worlds: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const IMAGE_SIZE = GREMLY_BUTTON_IMAGE_SIZE;
const IMAGE_OVERHANG = (IMAGE_SIZE - 60) / 2;

/**
 * The centre tab: Gremly's face, sitting a little above the bar. Like the
 * mascot, it fills from grey to green as Gremly is fed through the day.
 */
function GremlyTabButton({
  onPress,
  onLongPress,
  accessibilityState,
  testID,
  style,
}: BottomTabBarButtonProps) {
  const focused = !!accessibilityState?.selected;
  const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
  const isFedToday = useGremlyStore((s) => s.isFedToday);
  const target = gremlyButtonFillHeight(feedingGaugeValue, isFedToday);
  const fillHeight = useSharedValue(target);

  useEffect(() => {
    fillHeight.value = withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [target, fillHeight]);

  const fillStyle = useAnimatedStyle(() => ({ height: fillHeight.value }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={isFedToday ? 'Gremly, fed today' : 'Gremly'}
      accessibilityState={accessibilityState}
      testID={testID ?? 'tab-gremly'}
      style={[style, styles.centerTab]}
    >
      <View style={[styles.centerButton, !focused && styles.centerButtonIdle]}>
        <Image source={GREMLY_BUTTON_GREY} style={styles.centerImage} resizeMode="contain" />
        <Animated.View style={[styles.centerFill, fillStyle]} pointerEvents="none">
          <Image source={GREMLY_BUTTON} style={styles.centerFillImage} resizeMode="contain" />
        </Animated.View>
      </View>
    </Pressable>
  );
}

/**
 * TabNavigator - Main bottom tab navigation
 *
 * Three tabs:
 * - Today: Daily view with todos, habits, and schedule
 * - Gremly (centre): Drop and Chat, switched with DROP | CHAT or a swipe
 * - Spaces: Browse and manage Spaces (non-testers)
 * - Worlds: Worlds & Chapters index (testers only)
 */

export default function TabNavigator() {
  const isTester = useGremlyStore((s) => s.isTester);

  return (
    <Tab.Navigator
      initialRouteName="Gremly"
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
        name="Gremly"
        component={GremlyHomeScreen}
        options={{
          tabBarLabel: 'Gremly',
          tabBarButton: GremlyTabButton,
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

const styles = StyleSheet.create({
  centerTab: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // Rises 6px above the bar; the Drop and Chat pages leave room for it
  centerButton: {
    marginTop: -12,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: lightTokens.colors.linenCream,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F3B2C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  centerButtonIdle: {
    opacity: 0.75,
  },
  // buttonforHP.png has clear space around the circle; this size makes the
  // circle itself about 58px
  centerImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  // the green layer, cut from the bottom up to how fed Gremly is
  centerFill: {
    position: 'absolute',
    left: -IMAGE_OVERHANG,
    bottom: -IMAGE_OVERHANG,
    width: IMAGE_SIZE,
    overflow: 'hidden',
  },
  centerFillImage: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
});
