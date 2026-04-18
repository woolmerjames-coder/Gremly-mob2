import 'react-native-gesture-handler'; // must be first
import 'react-native-url-polyfill/auto'; // URL polyfill for React Native
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, Linking, View, Keyboard, AppState } from 'react-native';
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
import { runCortexProxyDiag } from './lib/cortex/diag';
import { env } from './lib/env';
import { useBrandFonts } from './app/theme/fonts';
import { testLogger } from './src/utils/TestLogger';
import {
  setupNotificationResponseHandler,
  getInitialNotification,
  requestNotificationPermissionContextual,
  savePushToken,
} from './src/utils/notifications';
import { getDateService } from './lib/date/DateService';
import { NotificationPermissionPrompt } from './components/notifications/NotificationPermissionPrompt';
import { eventBus } from './lib/events';
import { useGremlyStore } from './lib/store/useGremlyStore';
import { scheduleQuickReminder } from './lib/notifications/itemReminderService';
import { ErrorBoundary } from './components/ErrorBoundary';
import NotificationQuickActionSheet from './components/notifications/NotificationQuickActionSheet';
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
});

// Prevent the splash screen from auto-hiding before app is ready
SplashScreen.preventAutoHideAsync();

async function logSnoozeEvent(
  entityId: string,
  entityType: string,
  snoozeDuration: string,
  snoozeCount: number,
): Promise<void> {
  try {
    const { supabase } = await import('./lib/supabase/client');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    await supabase.from('events').insert({
      user_id: session.user.id,
      owner_id: session.user.id,
      kind: 'reminder_snoozed',
      payload_json: {
        entity_id: entityId,
        entity_type: entityType,
        snooze_duration: snoozeDuration,
        snooze_count: snoozeCount,
      },
    });
  } catch (err) {
    // Fire and forget — don't break the snooze flow
    console.warn('[Notifications] Failed to log snooze event:', err);
  }
}

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

  const [quickActionState, setQuickActionState] = useState<{
    visible: boolean;
    entityId: string | null;
    entityType: 'todo' | 'habit' | 'event' | null;
  }>({ visible: false, entityId: null, entityType: null });

  const navigationRef = useRef<any>(null);

  const [permissionPrompt, setPermissionPrompt] = useState<{
    visible: boolean;
    context: 'reminder' | 'sweep';
  }>({ visible: false, context: 'reminder' });

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

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
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

  // Ensure notification categories (action buttons) are registered on every launch
  useEffect(() => {
    import('./src/utils/notifications')
      .then(({ ensureNotificationCategories }) => {
        ensureNotificationCategories();
      })
      .catch((err) => console.error('Notification categories error:', err));
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

  // Handle notification responses (taps)
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      // Check cold-start notification
      const initialData = await getInitialNotification();
      if (initialData) {
        setTimeout(() => {
          if (initialData.action === 'open_flow') {
            eventBus.emit('notification:open_flow', { type: initialData.type });
          } else if (initialData.action === 'open_item') {
            eventBus.emit('notification:open_item', {
              itemId: initialData.entityId ?? initialData.itemId,
              itemType: initialData.entityType ?? initialData.itemType,
            });
          }
        }, 1000);
      }

      cleanup = await setupNotificationResponseHandler({
        onOpenFlow: (type) => eventBus.emit('notification:open_flow', { type }),

        onOpenItem: (entityId, entityType) =>
          eventBus.emit('notification:open_item', { itemId: entityId, itemType: entityType }),

        onDoneAction: async (entityId, entityType) => {
          try {
            if (entityType === 'todo') {
              const todo = useGremlyStore.getState().todos.find((t) => t.id === entityId);

              // Skip if already completed or archived
              if (todo?.completed_at) {
                console.log(`[Notifications] Todo ${entityId} already completed, skipping`);
                return;
              }
              if ((todo as any)?.archived) {
                console.log(`[Notifications] Todo ${entityId} archived, skipping`);
                return;
              }

              await useGremlyStore.getState().completeTodo(entityId);
            }
            // For habits, emit an event that the habit check-in can handle
            if (entityType === 'habit') {
              eventBus.emit('notification:habit_done', { entityId });
            }
            console.log(`[Notifications] Completed ${entityType} ${entityId} from notification`);
          } catch (err) {
            console.error('[Notifications] Done action failed:', err);
          }
        },

        onSnooze: async (entityId, entityType, seconds, label) => {
          try {
            const state = useGremlyStore.getState();
            const entity =
              entityType === 'todo'
                ? state.todos.find((t) => t.id === entityId)
                : state.habits.find((h) => h.id === entityId);

            if (!entity) {
              console.warn('[Notifications] Snooze: entity not found', entityId);
              return;
            }

            // Don't snooze completed or archived items
            if ((entity as any).completed_at || (entity as any).archived) {
              console.log(`[Notifications] Skipping snooze for completed/archived ${entityId}`);
              return;
            }

            const title = (entity as any).title ?? (entity as any).name ?? 'Reminder';

            // Check if snoozed past due date — will affect next notification copy
            const dueDay = (entity as any).due_day ?? null;
            if (dueDay) {
              const today = getDateService().today();
              if (dueDay < today) {
                console.log(
                  `[Notifications] Snoozing overdue item ${entityId} (was due ${dueDay})`,
                );
                // The next notification will pick up the overdue state
                // from the entity's due_day automatically
              }
            }

            // Count existing snoozes from reminders metadata
            const currentReminders = (entity as any).reminders ?? [];
            const snoozeCount = currentReminders.reduce(
              (count: number, r: any) => count + (r.snooze_count ?? 0),
              0,
            );

            if (snoozeCount >= 3) {
              // Cap reached — don't reschedule, surface in Sweep instead
              console.log(`[Notifications] Snooze cap reached for ${entityId}, deferring to Sweep`);

              // Update the entity to flag it for Sweep attention
              if (entityType === 'todo') {
                const { supabase } = await import('./lib/supabase/client');
                await supabase.from('todos').update({ sweep_flagged: true }).eq('id', entityId);

                useGremlyStore.setState((s: any) => ({
                  todos: s.todos.map((t: any) =>
                    t.id === entityId ? { ...t, sweep_flagged: true } : t,
                  ),
                }));
              }
              return;
            }

            // Schedule the snoozed reminder
            await scheduleQuickReminder(entityId, title, entityType as 'todo' | 'habit', seconds);

            // Log snooze event for weekly summary (fire and forget)
            logSnoozeEvent(entityId, entityType, label, snoozeCount + 1);

            // Build updated reminders with new snoozed time + incremented snooze count
            const snoozeTargetDate = new Date(getDateService().now().getTime() + seconds * 1000);
            const snoozeTime = `${String(snoozeTargetDate.getHours()).padStart(2, '0')}:${String(snoozeTargetDate.getMinutes()).padStart(2, '0')}`;
            const snoozeDate = getDateService().toLocalDate(snoozeTargetDate);

            const updatedReminders =
              currentReminders.length > 0
                ? currentReminders.map((r: any, i: number) =>
                    i === 0
                      ? {
                          ...r,
                          time: snoozeTime,
                          date: snoozeDate,
                          frequency: 'once',
                          snooze_count: (r.snooze_count ?? 0) + 1,
                        }
                      : r,
                  )
                : [
                    {
                      id: `snooze-${getDateService().now().getTime()}`,
                      time: snoozeTime,
                      date: snoozeDate,
                      frequency: 'once',
                      snooze_count: 1,
                    },
                  ];

            // Update Zustand (bell chip reflects new time immediately)
            if (entityType === 'todo') {
              useGremlyStore.setState((s: any) => ({
                todos: s.todos.map((t: any) =>
                  t.id === entityId ? { ...t, reminders: updatedReminders } : t,
                ),
              }));
            } else if (entityType === 'habit') {
              useGremlyStore.setState((s: any) => ({
                habits: s.habits.map((h: any) =>
                  h.id === entityId ? { ...h, reminders: updatedReminders } : h,
                ),
              }));
            }

            // Persist to Supabase (same array)
            if (entityType === 'todo') {
              const { supabase } = await import('./lib/supabase/client');
              await supabase
                .from('todos')
                .update({ reminders_json: updatedReminders })
                .eq('id', entityId);
            } else if (entityType === 'habit') {
              const { supabase } = await import('./lib/supabase/client');
              await supabase
                .from('habits')
                .update({ reminders_json: updatedReminders })
                .eq('id', entityId);
            }

            console.log(
              `[Notifications] Snoozed ${entityType} ${entityId} by ${label} (count: ${snoozeCount + 1})`,
            );
          } catch (err) {
            console.error('[Notifications] Snooze failed:', err);
          }
        },

        onSnoozBeforeDue: async (entityId, entityType, dueDate, dueTime) => {
          try {
            const entity =
              entityType === 'todo'
                ? useGremlyStore.getState().todos.find((t) => t.id === entityId)
                : useGremlyStore.getState().habits.find((h) => h.id === entityId);

            const title = (entity as any)?.title ?? (entity as any)?.name ?? 'Reminder';

            // Calculate 30 minutes before due
            if (dueDate && dueTime) {
              const [h, m] = dueTime.split(':').map(Number);
              const dueDateTime = new Date(`${dueDate}T00:00:00`);
              dueDateTime.setHours(h, m, 0, 0);
              const snoozeTarget = new Date(dueDateTime.getTime() - 30 * 60 * 1000);
              const secondsFromNow = Math.max(
                60,
                Math.floor((snoozeTarget.getTime() - getDateService().now().getTime()) / 1000),
              );
              await scheduleQuickReminder(
                entityId,
                title,
                entityType as 'todo' | 'habit',
                secondsFromNow,
              );
              logSnoozeEvent(entityId, entityType, 'before_due', 1);
            } else {
              // Fallback: snooze 1 hour if no due time
              await scheduleQuickReminder(entityId, title, entityType as 'todo' | 'habit', 3600);
              logSnoozeEvent(entityId, entityType, 'before_due', 1);
            }
            console.log(`[Notifications] Snoozed ${entityType} ${entityId} to 30min before due`);
          } catch (err) {
            console.error('[Notifications] Snooze-before-due failed:', err);
          }
        },

        onStartFlow: (type) => {
          eventBus.emit('notification:open_flow', { type });
        },
      });
    };

    setup();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Listen for contextual notification permission prompt
  useEffect(() => {
    const unsub = eventBus.on(
      'notification:permission_prompt',
      (payload: { context: 'reminder' | 'sweep' }) => {
        setPermissionPrompt({ visible: true, context: payload.context });
      },
    );
    return () => {
      unsub();
    };
  }, []);

  // Wire eventBus → navigation for notification deep links + quick action sheet
  useEffect(() => {
    const unsubFlow = eventBus.on('notification:open_flow', (payload) => {
      const nav = navigationRef.current;
      if (!nav) return;

      switch (payload.type) {
        case 'morning':
          nav.navigate('MorningBrief');
          break;
        case 'evening':
          nav.navigate('Sweep');
          break;
        case 'weekly_summary':
          nav.navigate('WeeklySummary');
          break;
        case 'afternoon_checkin':
          nav.navigate('Tabs', { screen: 'Today' });
          break;
      }
    });

    const unsubItem = eventBus.on('notification:open_item', (payload) => {
      setQuickActionState({
        visible: true,
        entityId: payload.itemId,
        entityType: payload.itemType as 'todo' | 'habit' | 'event',
      });
    });

    return () => {
      unsubFlow();
      unsubItem();
    };
  }, []);

  // Detect calendar day changes (background resume + midnight timer)
  useDayRollover();

  // Auto-sync timezone + activity heartbeat for notification delivery
  useTimezoneSync();

  // Mascot lifecycle: sleep/wake cycle, waving, inactivity detection
  const { mode: mascotMode, resetInactivity } = useMascotLifecycle();
  const mascotModeValue = React.useMemo(
    () => ({ mode: mascotMode, resetInactivity }),
    [mascotMode, resetInactivity],
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
                              </NavigationContainer>
                              <GlobalEventPopup />
                              <GlobalEventTimePicker />
                              {/* Notification quick-action sheet - slides up on entity reminder tap */}
                              <NotificationQuickActionSheet
                                visible={quickActionState.visible}
                                entityId={quickActionState.entityId}
                                entityType={quickActionState.entityType}
                                onDismiss={() =>
                                  setQuickActionState({
                                    visible: false,
                                    entityId: null,
                                    entityType: null,
                                  })
                                }
                                onDone={async (entityId, entityType) => {
                                  try {
                                    if (entityType === 'todo') {
                                      await useGremlyStore.getState().completeTodo(entityId);
                                    }
                                    if (entityType === 'habit') {
                                      eventBus.emit('notification:habit_done', { entityId });
                                    }
                                  } catch (err) {
                                    console.error('[QuickAction] Done failed:', err);
                                  }
                                }}
                                onSnooze={async (entityId, entityType, seconds) => {
                                  try {
                                    const state = useGremlyStore.getState();
                                    const entity =
                                      entityType === 'todo'
                                        ? state.todos.find((t) => t.id === entityId)
                                        : state.habits.find((h) => h.id === entityId);
                                    const title =
                                      (entity as any)?.title ?? (entity as any)?.name ?? 'Reminder';

                                    // 1. Schedule the snoozed notification
                                    await scheduleQuickReminder(
                                      entityId,
                                      title,
                                      entityType as 'todo' | 'habit',
                                      seconds,
                                    );

                                    // 2. Build updated reminders with new snoozed time
                                    const currentReminders = (entity as any)?.reminders ?? [];
                                    const snoozeTargetDate = new Date(
                                      getDateService().now().getTime() + seconds * 1000,
                                    );
                                    const snoozeTime = `${String(snoozeTargetDate.getHours()).padStart(2, '0')}:${String(snoozeTargetDate.getMinutes()).padStart(2, '0')}`;
                                    const snoozeDate =
                                      getDateService().toLocalDate(snoozeTargetDate);

                                    const updatedReminders =
                                      currentReminders.length > 0
                                        ? currentReminders.map((r: any, i: number) =>
                                            i === 0
                                              ? {
                                                  ...r,
                                                  time: snoozeTime,
                                                  date: snoozeDate,
                                                  frequency: 'once',
                                                  snooze_count: (r.snooze_count ?? 0) + 1,
                                                }
                                              : r,
                                          )
                                        : [
                                            {
                                              id: `snooze-${getDateService().now().getTime()}`,
                                              time: snoozeTime,
                                              date: snoozeDate,
                                              frequency: 'once',
                                              snooze_count: 1,
                                            },
                                          ];

                                    // 3. Update Zustand (chip reflects new time immediately)
                                    if (entityType === 'todo') {
                                      useGremlyStore.setState((s: any) => ({
                                        todos: s.todos.map((t: any) =>
                                          t.id === entityId
                                            ? { ...t, reminders: updatedReminders }
                                            : t,
                                        ),
                                      }));
                                    } else if (entityType === 'habit') {
                                      useGremlyStore.setState((s: any) => ({
                                        habits: s.habits.map((h: any) =>
                                          h.id === entityId
                                            ? { ...h, reminders: updatedReminders }
                                            : h,
                                        ),
                                      }));
                                    }

                                    // 4. Persist to Supabase
                                    const { supabase: sb } = await import('./lib/supabase/client');
                                    const table = entityType === 'todo' ? 'todos' : 'habits';
                                    await sb
                                      .from(table)
                                      .update({ reminders_json: updatedReminders })
                                      .eq('id', entityId);

                                    // 5. Log snooze event (fire and forget)
                                    const snoozeLabel =
                                      seconds <= 900
                                        ? '15m'
                                        : seconds <= 3600
                                          ? '1hr'
                                          : `${seconds}s`;
                                    const snoozeCount = currentReminders.reduce(
                                      (count: number, r: any) => count + (r.snooze_count ?? 0),
                                      0,
                                    );
                                    logSnoozeEvent(
                                      entityId,
                                      entityType,
                                      snoozeLabel,
                                      snoozeCount + 1,
                                    );

                                    console.log(
                                      `[QuickAction] Snoozed ${entityType} ${entityId} by ${snoozeLabel}`,
                                    );
                                  } catch (err) {
                                    console.error('[QuickAction] Snooze failed:', err);
                                  }
                                }}
                                onOpen={(entityId, entityType) => {
                                  eventBus.emit('overlay:open', { entityId, entityType });
                                }}
                              />
                              {/* Contextual notification permission prompt */}
                              <NotificationPermissionPrompt
                                visible={permissionPrompt.visible}
                                context={permissionPrompt.context}
                                onAllow={async () => {
                                  setPermissionPrompt({ visible: false, context: 'reminder' });
                                  const token = await requestNotificationPermissionContextual();
                                  if (token) {
                                    const { supabase } = await import('./lib/supabase/client');
                                    const {
                                      data: { session },
                                    } = await supabase.auth.getSession();
                                    if (session?.user?.id) {
                                      await savePushToken(session.user.id, token);
                                    }
                                  }
                                }}
                                onNotNow={() => {
                                  setPermissionPrompt({ visible: false, context: 'reminder' });
                                }}
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
        <GraduationFlow visible={pendingGraduation} onComplete={finalizeGraduation} />

        {/* One-time read-only intro sheet */}
        <ReadOnlyIntroSheet
          visible={showReadonlyIntro}
          onDismiss={handleReadonlyIntroDismiss}
          onSubscribe={handleReadonlyIntroSubscribe}
        />
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
