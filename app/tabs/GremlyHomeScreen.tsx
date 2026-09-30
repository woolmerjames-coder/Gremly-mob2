/**
 * GremlyHomeScreen - the centre tab.
 *
 * Mind Drop and Ask Gremly live side by side on one page. The DROP | CHAT
 * switch at the top and a sideways swipe both move between them, and the
 * switch follows the finger while swiping.
 *
 * One input box sits under both pages and stays put while they slide (see
 * components/home/GremlyHomeDock.tsx): the Drop page hands it over, and in
 * Chat it sends to the Chat page.
 *
 * Chat mounts the first time it is needed (a swipe starts, CHAT is tapped, or
 * another screen asks for it), so opening the app does not also ask the
 * Worker for a chat greeting.
 *
 * Other screens open a mode with navigate('Tabs', { screen: 'Gremly',
 * params: { mode: 'chat', prefillPrompt, autoSendKey } }). The chat prefill
 * params are read by AskGremlyScreen from this same route.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import CatchAllNotepad from '../screens/CatchAllNotepad';
import AskGremlyScreen from './AskGremlyScreen';
import GremlyModeSwitch, { type HomeMode } from '../../components/home/GremlyModeSwitch';
import {
  HomeDockContext,
  HomeModeContext,
  type HomeChatApi,
  type HomeDockApi,
  type HomeModeState,
} from '../../components/home/GremlyHomeDock';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useNeedsMindDropTutorial } from '../../lib/store/lifecycleSelectors';
import type { TabParamList } from '../../navigation/TabNavigator';

const LINEN = '#F9F6F1';
const HINT_DELAY_MS = 900;
const HINT_VISIBLE_MS = 5000;
const NUDGE_PX = 56;

export default function GremlyHomeScreen() {
  const route = useRoute<RouteProp<TabParamList, 'Gremly'>>();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, 'Gremly'>>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const pagerRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const progress = useMemo(
    () =>
      scrollX.interpolate({
        inputRange: [0, Math.max(width, 1)],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollX, width],
  );

  const [mode, setMode] = useState<HomeMode>('drop');
  const [pagerHeight, setPagerHeight] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);

  // The shared input box (handed over by the Drop page) and the Chat page's
  // send function. The API object never changes; see GremlyHomeDock.tsx.
  const [dock, setDock] = useState<React.ReactNode>(null);
  const [chatSending, setChatSending] = useState(false);
  const chatApiRef = useRef<HomeChatApi | null>(null);
  const draftSetterRef = useRef<((text: string) => void) | null>(null);
  const pendingDraftRef = useRef<string | null>(null);
  const dockApi = useMemo<HomeDockApi>(
    () => ({
      setDock,
      registerChat: (api) => {
        chatApiRef.current = api;
      },
      getChat: () => chatApiRef.current,
      setChatSending,
      prefillDraft: (text) => {
        if (draftSetterRef.current) draftSetterRef.current(text);
        else pendingDraftRef.current = text;
      },
      registerDraftSetter: (setter) => {
        draftSetterRef.current = setter;
        if (setter && pendingDraftRef.current !== null) {
          setter(pendingDraftRef.current);
          pendingDraftRef.current = null;
        }
      },
    }),
    [],
  );
  const modeState = useMemo<HomeModeState>(() => ({ mode, chatSending }), [mode, chatSending]);
  const pendingModeRef = useRef<HomeMode | null>(null);

  const hasOpenedHomeChat = useGremlyStore((s) => s.hasOpenedHomeChat);
  const hasSeenHomeSwipeHint = useGremlyStore((s) => s.hasSeenHomeSwipeHint);
  const markHomeChatOpened = useGremlyStore((s) => s.markHomeChatOpened);
  const markHomeSwipeHintSeen = useGremlyStore((s) => s.markHomeSwipeHintSeen);
  const isInTutorial = useNeedsMindDropTutorial();

  const dismissHint = useCallback(() => {
    setHintVisible(false);
    markHomeSwipeHintSeen();
  }, [markHomeSwipeHintSeen]);

  const goTo = useCallback(
    (next: HomeMode, animated = true) => {
      Keyboard.dismiss();
      setMode(next);
      if (next === 'chat') setChatMounted(true);
      if (pagerHeight === 0) {
        // not laid out yet: apply once the pager has a size
        pendingModeRef.current = next;
        return;
      }
      pagerRef.current?.scrollTo({ x: next === 'chat' ? width : 0, animated });
    },
    [pagerHeight, width],
  );

  const handleSelect = useCallback(
    (next: HomeMode) => {
      if (hintVisible) dismissHint();
      goTo(next);
    },
    [goTo, hintVisible, dismissHint],
  );

  // Chat has been seen: clear the new dot for good
  useEffect(() => {
    if (mode === 'chat' && !hasOpenedHomeChat) markHomeChatOpened();
  }, [mode, hasOpenedHomeChat, markHomeChatOpened]);

  // Another screen asked for a mode (e.g. "Chat with Gremly" on a drop)
  const requestedMode = route.params?.mode;
  const requestKey = route.params?.autoSendKey;
  useEffect(() => {
    if (requestedMode !== 'drop' && requestedMode !== 'chat') return;
    goTo(requestedMode);
    navigation.setParams({ mode: undefined });
  }, [requestedMode, requestKey, goTo, navigation]);

  // Keep the page in place if the screen size changes (rotation, split view)
  useEffect(() => {
    if (pagerHeight === 0) return;
    pagerRef.current?.scrollTo({ x: mode === 'chat' ? width : 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // One-time hint: point at CHAT and nudge the page so the swipe is discoverable
  useEffect(() => {
    if (hasSeenHomeSwipeHint || isInTutorial || !isFocused || pagerHeight === 0) return;
    if (mode !== 'drop') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setHintVisible(true);
        pagerRef.current?.scrollTo({ x: NUDGE_PX, animated: true });
        timers.push(setTimeout(() => pagerRef.current?.scrollTo({ x: 0, animated: true }), 380));
      }, HINT_DELAY_MS),
    );
    timers.push(setTimeout(dismissHint, HINT_DELAY_MS + HINT_VISIBLE_MS));
    return () => timers.forEach(clearTimeout);
  }, [hasSeenHomeSwipeHint, isInTutorial, isFocused, pagerHeight, mode, dismissHint]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
      }),
    [scrollX],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const page = Math.round(e.nativeEvent.contentOffset.x / width);
      setMode(page >= 1 ? 'chat' : 'drop');
    },
    [width],
  );

  const onScrollBeginDrag = useCallback(() => {
    Keyboard.dismiss();
    setChatMounted(true);
    if (hintVisible) dismissHint();
  }, [hintVisible, dismissHint]);

  const onPagerLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setPagerHeight(h);
    const pending = pendingModeRef.current;
    if (pending) {
      pendingModeRef.current = null;
      requestAnimationFrame(() =>
        pagerRef.current?.scrollTo({ x: pending === 'chat' ? width : 0, animated: false }),
      );
    }
  };

  const pageStyle = useMemo(
    () => ({ width, height: pagerHeight || undefined }),
    [width, pagerHeight],
  );

  // The pages are kept as the same elements between renders, so handing the
  // input box over (which re-renders this screen) does not re-render them
  const dropPage = useMemo(
    () => (
      <View style={pageStyle}>
        <CatchAllNotepad embedded active={mode === 'drop'} />
      </View>
    ),
    [pageStyle, mode],
  );
  const chatPage = useMemo(
    () => <View style={pageStyle}>{chatMounted ? <AskGremlyScreen embedded /> : null}</View>,
    [pageStyle, chatMounted],
  );

  return (
    <HomeDockContext.Provider value={dockApi}>
      <HomeModeContext.Provider value={modeState}>
        <View style={styles.root} testID="gremly-home">
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <GremlyModeSwitch
              progress={progress}
              mode={mode}
              onSelect={handleSelect}
              showChatDot={!hasOpenedHomeChat}
              hintVisible={hintVisible}
            />
          </View>

          <KeyboardAvoidingView
            style={styles.body}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Animated.ScrollView
              ref={pagerRef}
              style={styles.pager}
              horizontal
              pagingEnabled
              bounces={false}
              overScrollMode="never"
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={onScroll}
              onScrollBeginDrag={onScrollBeginDrag}
              onMomentumScrollEnd={onMomentumScrollEnd}
              onLayout={onPagerLayout}
              testID="gremly-home-pager"
            >
              {dropPage}
              {chatPage}
            </Animated.ScrollView>

            {/* The one input box, fixed under both pages, with Gremly perched on it */}
            <View style={styles.dock} testID="gremly-home-dock">
              {dock}
            </View>
          </KeyboardAvoidingView>
        </View>
      </HomeModeContext.Provider>
    </HomeDockContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LINEN,
  },
  header: {
    paddingBottom: 10,
    backgroundColor: LINEN,
    zIndex: 2,
  },
  body: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  // drawn after the pages, so Gremly and his speech can sit over them
  dock: {
    backgroundColor: LINEN,
    zIndex: 1,
  },
});
