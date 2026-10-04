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
  LayoutAnimation,
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
import { getDateService } from '../../lib/date/DateService';
import { CHAT_CAPTION, DROP_CAPTION, inFirstWeek } from '../../components/home/homeCaptions';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useBriefUnread } from '../../lib/brief/todayThread';

const LINEN = '#F9F6F1';
const HINT_DELAY_MS = 900;
const HINT_VISIBLE_MS = 5000;
const NUDGE_PX = 56;
// Talk it through: the keyboard opens once the page has slid over to Chat
const FOCUS_AFTER_SLIDE_MS = 450;

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
  const [chatPlaceholder, setChatPlaceholder] = useState<string | null>(null);
  const [chatScrolling, setChatScrollingState] = useState(false);
  const scrollSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gremly steps aside as soon as the conversation moves, and comes back a
  // moment after it stops, so a quick flick does not make him bob
  const setChatScrolling = useCallback((scrolling: boolean) => {
    if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    scrollSettleRef.current = null;
    if (scrolling) {
      setChatScrollingState(true);
    } else {
      scrollSettleRef.current = setTimeout(() => setChatScrollingState(false), 700);
    }
  }, []);
  useEffect(
    () => () => {
      if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    },
    [],
  );

  // While typing in Chat, the switch and dots tuck away to leave more room to
  // read; they come back when the keyboard closes
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const onShow = () => {
      if (Platform.OS === 'ios')
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardOpen(true);
    };
    const onHide = () => {
      if (Platform.OS === 'ios')
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardOpen(false);
    };
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow,
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide,
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const chatApiRef = useRef<HomeChatApi | null>(null);
  const focusRef = useRef<(() => void) | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    [],
  );
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
      setChatPlaceholder,
      setChatScrolling,
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
      focusInput: () => focusRef.current?.(),
      registerFocus: (focus) => {
        focusRef.current = focus;
      },
    }),
    [setChatScrolling],
  );
  const modeState = useMemo<HomeModeState>(
    () => ({ mode, chatSending, chatScrolling, chatPlaceholder }),
    [mode, chatSending, chatScrolling, chatPlaceholder],
  );
  const switchTucked = keyboardOpen && mode === 'chat';
  const pendingModeRef = useRef<HomeMode | null>(null);

  const hasOpenedHomeChat = useGremlyStore((s) => s.hasOpenedHomeChat);
  // Daily brief in Chat: the dot also says today's brief is waiting
  const briefUnread = useBriefUnread();
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
  const requestKey = route.params?.autoSendKey ?? route.params?.talkKey ?? route.params?.threadKey;
  const talkKey = route.params?.talkKey;
  useEffect(() => {
    if (requestedMode !== 'drop' && requestedMode !== 'chat') return;
    goTo(requestedMode);
    navigation.setParams({ mode: undefined });
    // Talk it through: the drop is attached and Gremly has asked, so the
    // keyboard opens for the answer once the page has slid over
    if (requestedMode === 'chat' && talkKey) {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => focusRef.current?.(), FOCUS_AFTER_SLIDE_MS);
    }
  }, [requestedMode, requestKey, talkKey, goTo, navigation]);

  // In the first week, a line under the switch says what each side is for;
  // it crossfades with the swipe, like the switch itself
  const accountCreatedAt = useGremlyStore((s) => s.accountCreatedAt) as string | null | undefined;
  const firstWeek = inFirstWeek(accountCreatedAt, getDateService().now().getTime());
  const dropCaptionOpacity = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [progress],
  );

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
          <View
            style={[
              styles.header,
              { paddingTop: insets.top + (switchTucked ? 4 : 8) },
              switchTucked && styles.headerTucked,
            ]}
          >
            {switchTucked ? null : (
              <GremlyModeSwitch
                progress={progress}
                mode={mode}
                onSelect={handleSelect}
                showChatDot={!hasOpenedHomeChat || briefUnread}
                hintVisible={hintVisible}
              />
            )}
            {firstWeek && !switchTucked && !hintVisible ? (
              <View
                style={styles.captionRow}
                testID="home-first-week-caption"
                accessible
                accessibilityLabel={mode === 'chat' ? CHAT_CAPTION : DROP_CAPTION}
              >
                <Animated.Text style={[styles.caption, { opacity: dropCaptionOpacity }]}>
                  {DROP_CAPTION}
                </Animated.Text>
                <Animated.Text style={[styles.caption, styles.captionOver, { opacity: progress }]}>
                  {CHAT_CAPTION}
                </Animated.Text>
              </View>
            ) : null}
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
  headerTucked: {
    paddingBottom: 0,
  },
  captionRow: {
    height: 18,
    marginTop: 6,
    justifyContent: 'center',
  },
  caption: {
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 12.5,
    color: '#4B6A50',
    textAlign: 'center',
  },
  captionOver: {
    position: 'absolute',
    left: 0,
    right: 0,
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
