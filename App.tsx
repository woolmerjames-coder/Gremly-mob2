import 'react-native-gesture-handler'; // must be first
import 'react-native-url-polyfill/auto'; // URL polyfill for React Native
import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, Linking, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SheetProvider } from 'react-native-actions-sheet';

import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import { RepoProvider } from './providers/RepoProvider';
import { CortexProvider } from './providers/CortexProvider';
import { DsToggleProvider } from './providers/DsToggleProvider';
import { OverlayHost } from './components/OverlayHost';
import RootNavigator from './navigation/RootNavigator';
import { supabase } from './lib/supabase/client';

const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';

function runOpenAIKeyAndNetworkDiag() {
  if (!DEBUG) return;

  // 1) Show whether the key is injected at runtime:
  console.log('[CORTEX][KEYCHECK]', {
    keyPrefix: process.env.EXPO_PUBLIC_OPENAI_API_KEY?.slice(0, 7),
    hasKey: !!process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  });

  // 2) Try a lightweight OpenAI endpoint to prove network + auth:
  (async () => {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
        },
      });
      const data = await res.json();
      console.log('[CORTEX][KEYTEST]', {
        ok: res.ok,
        status: res.status,
        sample: Array.isArray(data?.data) ? data.data[0]?.id : undefined,
        platform: Platform.OS,
      });
    } catch (err) {
      console.error('[CORTEX][KEYTEST] network error', String(err));
    }
  })();
}

export default function App() {
  const scheme = useColorScheme();

  useEffect(() => {
    // Run OpenAI key and network diagnostics
    runOpenAIKeyAndNetworkDiag();

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SheetProvider>
          <DsToggleProvider>
            <ThemeProvider>
              <AuthProvider>
                <RepoProvider>
                  <CortexProvider>
                    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
                      <RootNavigator />
                      <OverlayHost />
                    </NavigationContainer>
                  </CortexProvider>
                </RepoProvider>
              </AuthProvider>
            </ThemeProvider>
          </DsToggleProvider>
        </SheetProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/*
 * ============================================================================
 * DIAG RUN CHECKLIST
 * ============================================================================
 *
 * Required flags in .env.local:
 * -------------------------------
 * EXPO_PUBLIC_DEBUG_CORTEX=true
 * EXPO_PUBLIC_OPENAI_API_KEY=sk-... (real key)
 *
 * Restart command:
 * ----------------
 * npm start -c
 *
 * What you should see in Metro logs:
 * -----------------------------------
 * ✅ If key is injected:
 *    [CORTEX][KEYCHECK] { keyPrefix: 'sk-proj', hasKey: true }
 *
 * ✅ If network allowed:
 *    [CORTEX][KEYTEST] { ok: true, status: 200, sample: 'gpt-4o-mini', platform: 'ios' }
 *
 * ❌ If blocked by Expo Go:
 *    [CORTEX][KEYTEST] network error ... OR status: 401/403
 *
 * Next Steps:
 * -----------
 * See docs/DEV-OPENAI-SETUP.md for troubleshooting guide
 */
