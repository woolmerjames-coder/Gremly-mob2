import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import celebrationController from '../app/features/celebration/CelebrationController';
import TodayScreen from '../app/tabs/TodayScreen';
import WorldsScreen from '../app/tabs/WorldsScreen';
import GremlyHomeScreen from '../app/tabs/GremlyHomeScreen';
import {
  GREMLY_BUTTON_IMAGE_SIZE,
  gremlyButtonFillHeight,
} from '../components/home/gremlyButtonFill';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { firstWorldsArrived, markWorldsNew, useWorldsDot } from '../lib/worlds/dot';
import type { TalkAboutItem } from '../lib/chat/talkAboutOpeners';
import type { ThreadStep } from '../lib/brief/pinned';
import { lightTokens } from '../design/tokens';

// Tab bar icon images (v1.20 brand refresh)
import TODAY_ICON from '../assets/todayicon1.22.png';
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
        /**
         * Daily brief in Chat: open today's thread (the notification, Plan
         * with Gremly), or the thread of an earlier day (day), which Your
         * week opens to go back to the conversation a review happened in
         */
        thread?: 'today' | 'day';
        day?: string;
        /** With thread: what today's thread goes on to once it is open (lib/brief/pinned.ts) */
        step?: ThreadStep;
        /** With step 'plan': plan tomorrow instead of today (Plan tomorrow, after Sweep) */
        planDay?: 'tomorrow';
        /** Changes on every request, so the same thread can be asked for twice */
        threadKey?: string;
      }
    | undefined;
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

  // The fed moment: one pop with a ring, on the controller's pop beat
  const pop = useSharedValue(1);
  const ring = useSharedValue(0);
  useEffect(() => {
    return celebrationController.subscribe((payload) => {
      if (payload.kind !== 'moment' || payload.moment?.phase !== 'pop') return;
      if (payload.moment.reducedMotion) return;
      pop.value = withSequence(
        withTiming(1.24, { duration: 275, easing: Easing.bezier(0.2, 0.9, 0.3, 1.4) }),
        withTiming(1, { duration: 225, easing: Easing.out(Easing.cubic) }),
      );
      ring.value = withSequence(
        withTiming(0.001, { duration: 0 }),
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
      );
    });
  }, [pop, ring]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value <= 0 ? 0 : 1 - ring.value,
    transform: [{ scale: 1 + ring.value * 0.75 }],
  }));

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
      <Animated.View style={[styles.centerButton, !focused && styles.centerButtonIdle, popStyle]}>
        <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />
        <Image source={GREMLY_BUTTON_GREY} style={styles.centerImage} resizeMode="contain" />
        <Animated.View style={[styles.centerFill, fillStyle]} pointerEvents="none">
          <Image source={GREMLY_BUTTON} style={styles.centerFillImage} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * TabNavigator - Main bottom tab navigation
 *
 * Three tabs:
 * - Today: Daily view with todos, habits, and schedule
 * - Gremly (centre): Drop and Chat, switched with DROP | CHAT or a swipe
 * - Worlds: Worlds and Chapters, for everyone (Worlds rebuild, stage 4; Spaces are gone)
 */

export default function TabNavigator() {
  // the dot on the Worlds tab: something new landed there from somewhere else
  const worldsNew = useWorldsDot((s) => s.on);
  const worldCount = useGremlyStore((s) => (s.worlds ?? []).length);
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (lastCount.current !== null && firstWorldsArrived(lastCount.current, worldCount))
      markWorldsNew();
    lastCount.current = worldCount;
  }, [worldCount]);

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
      <Tab.Screen
        name="Worlds"
        component={WorldsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View>
              <Image
                source={WORLDS_ICON}
                style={{ width: 32, height: 32, opacity: focused ? 1 : 0.4 }}
                resizeMode="contain"
              />
              {worldsNew && !focused ? (
                <View style={styles.newDot} testID="worlds-tab-dot" />
              ) : null}
            </View>
          ),
          tabBarLabel: 'Worlds',
          tabBarAccessibilityLabel: worldsNew ? 'Worlds, something new' : 'Worlds',
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  newDot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4E9A62',
    borderWidth: 1.5,
    borderColor: lightTokens.colors.linenCream,
  },
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
  ring: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: 'rgba(94, 158, 108, 0.75)',
    opacity: 0,
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
