import 'react-native-gesture-handler'; // must be first
import './app.css'; // CRITICAL: Import Tailwind directives for NativeWind
import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SheetProvider } from 'react-native-actions-sheet';

import { ThemeProvider } from './providers/ThemeProvider';
import { OverlayHost } from './components/OverlayHost';
import RootNavigator from './navigation/RootNavigator';

export default function App() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SheetProvider>
          <ThemeProvider>
            <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
              <RootNavigator />
              <OverlayHost />
            </NavigationContainer>
          </ThemeProvider>
        </SheetProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
