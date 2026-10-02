import 'react-native-gesture-handler'; // must be first
import 'react-native-url-polyfill/auto'; // URL polyfill for React Native
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, Linking, View, Keyboard, AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SheetProvider } from 'react-native-actions-sheet';

import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import { RepoProvider } from './providers/RepoProvider';
import { CortexProvider } from './providers/CortexProvider';
import { DsToggleProvider } from './providers/DsToggleProvider';
import { CelebrationProvider } from './app/features/celebration/CelebrationProvider';
import { OverlayProvider } from './contexts/OverlayContext';
import { OverlayHost } from './components/OverlayHost';
import RootNavigator from './navigation/RootNavigator';
import { supabase } from './lib/supabase/client';
import { logAppEvent } from './lib/appEvents';
import { runCortexProxyDiag } from './lib/cortex/diag';
import { env } from './lib/env';
import { useBrandFonts } from './app/theme/fonts';
import { testLogger } from './src/utils/TestLogger';
import { eventBus } from './lib/events';
import { useGremlyStore } from './lib/store/useGremlyStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import NotificationAskSheet from './components/notifications/NotificationAskSheet';
import NotificationResponder from './components/notifications/NotificationResponder';
import { installNotificationHandlers } from './lib/notifications/handlers';
import { configurePurchases } from './lib/subscriptions/purchases';
// Navigation type imports available if needed:
// import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// import type { RootStackParamList } from './navigation/RootNavigator';
import celebrationController from './app/features/celebration/CelebrationController';
import AgeUpCelebrationModal from './components/ritual/AgeUpCelebrationModal';
import GraduationFlow from './app/screens/GraduationFlow';
import { GlobalEventPopup } from './components/calendar/GlobalEventPopup';
import { GlobalEventTimePicker } from './components/calendar/GlobalEventTimePicker';
import { initOfflineSync } from './lib/network/offlineSync';
import { startQueueRunner, stopQueueRunner } from './lib/minddrop/dropPipeline';
import { loadQueueIntoZustand } from './lib/minddrop/dropQueue';
import { useDayRollover } from './lib/today/hooks/useDayRollover';
import { useTimezoneSync } from './hooks/useTimezoneSync';
import { useMascotLifecycle } from './hooks/useMascotLifecycle';
import { MascotModeProvider } from './contexts/MascotModeContext';
import { OfflineBanner } from './app/components/OfflineBanner';
import { ReadOnlyBanner } from './app/components/ReadOnlyBanner';
import ReadOnlyIntroSheet from './app/components/ReadOnlyIntroSheet';
import { useIsReadOnly, useHasSeenReadonlyIntro } from './lib/store/lifecycleSelectors';
import * as Sentry from '@sentry/react-native';
import { useTodayThreadSync } from './lib/brief/todayThread';

Sentry.init({
  dsn: 'https://c61fbacb4a91e6c566fc9f1c67cc79b6@o4511237634260992.ingest.us.sentry.io/4511237636292608',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,

  release: Constants.expoConfig?.version,
  dist:
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? ''),
  environment: __DEV__ ? 'development' : 'production',
  beforeSend(event) {
    // PII-stripping hook; pass through for now.
    return event;
  },
});

// Prevent the splash screen from auto-hiding before app is ready
SplashScreen.preventAutoHideAsync();

// Notification taps and buttons are caught from the moment the code loads, so a
// tap that launched the app is never missed (lib/notifications/handlers.ts).
installNotificationHandlers();

function App() {
  const { fontsLoaded, fontsError } = useBrandFonts();
  const scheme = useColorScheme();
  const bootProbeRan = useRef(false);

  // Graduation flow state
  const pendingGraduation = useGremlyStore((s) => s.pendingGraduation);
  const finalizeGraduation = useGremlyStore((s) => s.finalizeGraduation);

  // Read-only intro sheet state
  const isReadOnly = useIsReadOnly();
  const hasSeenReadonlyIntro = useHasSeenReadonlyIntro();
  const markReadonlyIntroSeen = useGremlyStore((s) => s.markReadonlyIntroSeen);
  const isInitialized = useGremlyStore((s) => s.isInitialized);
  const [showReadonlyIntro, setShowReadonlyIntro] = useState(false);

  // Age-up celebration state - rendered at root level to work over navigation modals
  const [ageUpState, setAgeUpState] = useState<{
    visible: boolean;
    age: number;
    tierName?: string;
    isTierTransition?: boolean;
    previousTierName?: string;
  }>({
    visible: false,
    age: 0,
  });

  const navigationRef = useRef<any>(null);

  // Show read-only intro sheet once after entering read-only state
  useEffect(() => {
    if (isInitialized && isReadOnly && !hasSeenReadonlyIntro) {
      const timer = setTimeout(() => setShowReadonlyIntro(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, isReadOnly, hasSeenReadonlyIntro]);

  const handleReadonlyIntroDismiss = useCallback(() => {
    setShowReadonlyIntro(false);
    void markReadonlyIntroSeen();
  }, [markReadonlyIntroSeen]);

  const handleReadonlyIntroSubscribe = useCallback(() => {
    setShowReadonlyIntro(false);
    void markReadonlyIntroSeen();
    // Navigate to paywall after brief delay so sheet dismisses first
    setTimeout(() => {
      navigationRef.current?.navigate('TrialEndPaywall', { source: 'expiry' });
    }, 300);
  }, [markReadonlyIntroSeen]);

  // Start offline sync
  useEffect(() => {
    initOfflineSync();
  }, []);

  // Initialize RevenueCat SDK
  useEffect(() => {
    configurePurchases();
  }, []);

  // Start the drop pipeline queue runner
  useEffect(() => {
    void startQueueRunner();
    void logAppEvent('app_open');

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void logAppEvent('app_open');
        void loadQueueIntoZustand();
        void startQueueRunner();
      } else {
        stopQueueRunner();
      }
    });

    return () => {
      stopQueueRunner();
      subscription.remove();
    };
  }, []);

  // Subscribe to age-up celebration events
  useEffect(() => {
    const unsubscribe = celebrationController.subscribe((payload) => {
      if (payload.kind === 'age_up' && payload.age !== undefined) {
        if (__DEV__) {
          console.log('[App] Age-up celebration received, showing modal for age:', payload.age);
        }
        // Always dismiss keyboard first (no-op if not visible).
        // Short delay lets the keyboard animate away so the modal isn't obscured.
        Keyboard.dismiss();
        setTimeout(() => {
          setAgeUpState({
            visible: true,
            age: payload.age!,
            tierName: payload.tierName,
            isTierTransition: payload.isTierTransition ?? false,
            previousTierName: payload.previousTierName,
          });
        }, 300);
      }
    });
    return unsubscribe;
  }, []);

  const handleAgeUpDismiss = useCallback(() => {
    const dismissedAge = ageUpState.age;
    setAgeUpState({ visible: false, age: 0 });
    // Trigger post-age-up Gremly speech after a short delay
    // so the modal exit animation completes first
    if (dismissedAge > 0) {
      setTimeout(() => {
        celebrationController.showPostAgeUpSpeech(dismissedAge);
      }, 600);
    }
  }, [ageUpState.age]);

  // Derive app readiness from fonts (no setState needed)
  const appIsReady = fontsLoaded || fontsError;

  useEffect(() => {
    // Dev-only boot probe: emit 3 [TEST] lines on every app boot
    if (__DEV__ && !bootProbeRan.current) {
      bootProbeRan.current = true;
      testLogger.start('BOOT_TEST', { source: 'app' });
      testLogger.step('mounted');
      setTimeout(() => {
        testLogger.end(true);
      }, 250);
    }

    console.log('[ENV][summary]', {
      engine: process.env.EXPO_PUBLIC_CORTEX_ENGINE,
      classify: process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL,
      cortexUrl: (process.env.EXPO_PUBLIC_CORTEX_URL ?? '').slice(0, 40) + '…',
      debug: process.env.EXPO_PUBLIC_DEBUG_CORTEX,
    });

    // Print env config in dev
    if (__DEV__) {
      console.log('[CORTEX] env', {
        url: env.cortexUrl,
        model: env.cortex.model,
        timeoutMs: env.cortex.timeoutMs,
      });
    }

    // Run Cortex proxy diagnostics (dev only)
    if (__DEV__) {
      runCortexProxyDiag();
    }

    // Handle deep linking for magic link authentication
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (__DEV__) {
        console.log('[Deep Link] Received URL:', url);
      }

      // Trigger session refresh after magic link callback
      supabase.auth
        .getSession()
        .then(({ data: { session }, error }) => {
          if (__DEV__) {
            if (error) {
              console.error('[Deep Link] Session error:', error);
            } else if (session) {
              console.log('[Deep Link] Session established:', session.user.email);
            } else {
              console.log('[Deep Link] No session found');
            }
          }
        })
        .catch((err) => console.error('Deep link session error:', err));
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Wire eventBus → navigation
  useEffect(() => {
    const unsubReadOnly = eventBus.on('cortex:read_only', () => {
      if (navigationRef.current) {
        navigationRef.current.navigate('TrialEndPaywall', { source: 'expiry' });
      } else {
        console.warn('[App] cortex:read_only received but navigationRef not ready');
      }
    });

    // Mind Drop question answered with "Chat with Gremly": open the Chat page of
    // the Gremly home and send the drop so Gremly replies straight away.
    let openChatRequests = 0;
    const unsubOpenChat = eventBus.on('minddrop:open_chat', ({ text }) => {
      const nav = navigationRef.current;
      if (!nav || !text) return;
      openChatRequests += 1;
      nav.navigate('Tabs', {
        screen: 'Gremly',
        params: {
          mode: 'chat',
          prefillPrompt: text,
          autoSendKey: `minddrop-${openChatRequests}`,
        },
      });
    });

    // "Talk it through with Gremly" on a new drop: open Chat with the item
    // attached and Gremly's opener; nothing is sent until the user replies
    let talkRequests = 0;
    const unsubTalkAbout = eventBus.on('minddrop:talk_about', (item) => {
      const nav = navigationRef.current;
      if (!nav) return;
      talkRequests += 1;
      nav.navigate('Tabs', {
        screen: 'Gremly',
        params: { mode: 'chat', talkAbout: item, talkKey: `talk-${talkRequests}` },
      });
    });

    return () => {
      unsubReadOnly();
      unsubOpenChat();
      unsubTalkAbout();
    };
  }, []);

  // Detect calendar day changes (background resume + midnight timer)
  useDayRollover();

  // Daily brief in Chat: today's thread (unread or not), kept current
  useTodayThreadSync();

  // Auto-sync timezone + activity heartbeat for notification delivery
  useTimezoneSync();

  // Mascot lifecycle: sleep/wake cycle, waving, inactivity detection
  const { mode: mascotMode, resetInactivity, signalAnimationFinish } = useMascotLifecycle();
  const mascotModeValue = React.useMemo(
    () => ({ mode: mascotMode, resetInactivity, signalAnimationFinish }),
    [mascotMode, resetInactivity, signalAnimationFinish],
  );

  // Native splash is now hidden by RootNavigator when auth + hydration are ready
  const onLayoutRootView = useCallback(() => {
    // no-op: SplashScreen.hideAsync() is called in RootNavigator
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <DsToggleProvider>
              <ThemeProvider>
                <AuthProvider>
                  <RepoProvider>
                    <SheetProvider>
                      <CortexProvider>
                        <CelebrationProvider>
                          <OverlayProvider>
                            <MascotModeProvider value={mascotModeValue}>
                              <NavigationContainer
                                ref={navigationRef}
                                theme={scheme === 'dark' ? DarkTheme : DefaultTheme}
                                onStateChange={() => {
                                  Keyboard.dismiss();
                                  resetInactivity();
                                }}
                              >
                                <OfflineBanner />
                                <ReadOnlyBanner />
                                <RootNavigator />
                                <OverlayHost />
                                <NotificationResponder navigationRef={navigationRef} />
                              </NavigationContainer>
                              <GlobalEventPopup />
                              <GlobalEventTimePicker />
                              {/* Notifications: the one ask */}
                              <NotificationAskSheet />
                              {/* Age-up celebration modal - always mounted, visibility controlled by prop */}
                              <AgeUpCelebrationModal
                                visible={ageUpState.visible}
                                newAge={ageUpState.age}
                                tierName={ageUpState.tierName}
                                isTierTransition={ageUpState.isTierTransition}
                                previousTierName={ageUpState.previousTierName}
                                onDismiss={handleAgeUpDismiss}
                              />

                              {/* Graduation ceremony overlay */}
                              <GraduationFlow
                                visible={pendingGraduation}
                                onComplete={finalizeGraduation}
                              />

                              {/* One-time read-only intro sheet */}
                              <ReadOnlyIntroSheet
                                visible={showReadonlyIntro}
                                onDismiss={handleReadonlyIntroDismiss}
                                onSubscribe={handleReadonlyIntroSubscribe}
                              />
                            </MascotModeProvider>
                          </OverlayProvider>
                        </CelebrationProvider>
                      </CortexProvider>
                    </SheetProvider>
                  </RepoProvider>
                </AuthProvider>
              </ThemeProvider>
            </DsToggleProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </View>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);

/*
 * ============================================================================
 * CORTEX PROXY DIAG CHECKLIST
 * ============================================================================
 *
 * Required config in .env.local:
 * -------------------------------
 * EXPO_PUBLIC_DEBUG_CORTEX=true
 * EXPO_PUBLIC_CORTEX_URL=https://<project-ref>.supabase.co/functions/v1/cortex-proxy
 *
 * Server secrets (already set in Supabase):
 * ------------------------------------------
 * OPENAI_API_KEY=sk-...
 * CORTEX_TIMEOUT_MS=12000
 * CORTEX_RATE_WINDOW_MS=60000
 * CORTEX_RATE_MAX=30
 *
 * Restart command:
 * ----------------
 * npm start -c
 *
 * What you should see in Metro logs:
 * -----------------------------------
 * ✅ If proxy is configured:
 *    [CORTEX][PROXY_CHECK] { hasUrl: true, urlPrefix: 'https://...', model: 'gpt-4o-mini', timeout: 12000 }
 *
 * ✅ If proxy is working:
 *    [CORTEX][PROXY_TEST] { ok: true, hasResponse: true, platform: 'ios' }
 *
 * ❌ If proxy missing:
 *    [CORTEX][PROXY_CHECK] { hasUrl: false, ... }
 *
 * ❌ If proxy fails:
 *    [CORTEX][PROXY_TEST] error: [cortex] Missing EXPO_PUBLIC_CORTEX_URL
 *
 * Next Steps:
 * -----------
 * See SECURE_AI_PROXY_COMPLETE.md for deployment guide
 */
