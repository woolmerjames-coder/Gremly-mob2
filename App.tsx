import 'react-native-gesture-handler'; // must be first
import 'react-native-url-polyfill/auto'; // URL polyfill for React Native
import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, Linking } from 'react-native';
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

export default function App() {
  const scheme = useColorScheme();

  useEffect(() => {
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
