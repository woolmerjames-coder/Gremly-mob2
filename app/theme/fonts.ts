import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';

/**
 * Loads brand fonts (Inter + Plus Jakarta Sans) and surfaces loading state.
 * Warns in development if fonts fail to load so we do not ship system fallbacks silently.
 */
export function useBrandFonts() {
  const [fontsLoaded, fontsError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    Fraunces: Fraunces_400Regular,
    'Fraunces-Italic': Fraunces_400Regular_Italic,
    'Fraunces-Medium': Fraunces_500Medium,
    'Fraunces-SemiBold': Fraunces_600SemiBold,
  });
  const warnedRef = useRef(false);

  useEffect(() => {
    if (__DEV__) {
      if (fontsError && !warnedRef.current) {
        console.error('[Fonts] Failed to load brand fonts', fontsError);
        warnedRef.current = true;
      } else if (!fontsLoaded && !fontsError && !warnedRef.current) {
        console.warn('[Fonts] Brand fonts not loaded yet; falling back to system fonts.');
        warnedRef.current = true;
      } else if (fontsLoaded && warnedRef.current) {
        warnedRef.current = false; // reset if we hot-reload and fonts load successfully
      }
    }
  }, [fontsLoaded, fontsError]);

  return { fontsLoaded, fontsError } as const;
}
