import 'react-native-gesture-handler'; // must be first
import 'react-native-url-polyfill/auto'; // URL polyfill for React Native
import React, { useEffect, useRef, useCallback } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, Linking, View, Keyboard } from 'react-native';
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

// Prevent the splash screen from auto-hiding before app is ready
SplashScreen.preventAutoHideAsync();

export default function App() {
  const { fontsLoaded, fontsError } = useBrandFonts();
  const scheme = useColorScheme();
  const bootProbeRan = useRef(false);

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
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (__DEV__) {
          if (error) {
            console.error('[Deep Link] Session error:', error);
          } else if (session) {
            console.log('[Deep Link] Session established:', session.user.email);
          } else {
            console.log('[Deep Link] No session found');
          }
        }
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Hide splash screen after root view layout
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // Hide the splash screen after the root view has laid out
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
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
                          <NavigationContainer
                            theme={scheme === 'dark' ? DarkTheme : DefaultTheme}
                            onStateChange={() => Keyboard.dismiss()}
                          >
                            <RootNavigator />
                            <OverlayHost />
                          </NavigationContainer>
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
  );
}

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
