/**
 * makeStyles - StyleSheet factory with tokens support
 */

import { StyleSheet, useColorScheme, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { useMemo } from 'react';
import { lightTokens, darkTokens, Tokens } from './tokens';

/**
 * Returns 'light' or 'dark', fallback to 'light' if undefined
 */
export function useColorSchemeSafe(): 'light' | 'dark' {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}

/**
 * Returns the current Tokens based on the color scheme
 */
export function useTokens(): Tokens {
  const scheme = useColorSchemeSafe();
  // Cast to remove literal type constraints
  return (scheme === 'dark' ? darkTokens : lightTokens) as Tokens;
}

/**
 * Creates a stylesheet hook with tokens support
 * Usage:
 *   const useStyles = makeStyles((t) => ({
 *     container: { backgroundColor: t.colors.bg },
 *     text: { color: t.colors.text }
 *   }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<unknown>>(
  creator: (t: Tokens) => T,
) {
  return () => {
    const t = useTokens();
    return useMemo(() => StyleSheet.create(creator(t)), [t]);
  };
}

/**
 * Helper to safely merge style arrays
 */
export const sx = {
  merge: (
    ...styles: Array<ViewStyle | TextStyle | ImageStyle | undefined | false | null>
  ): Array<ViewStyle | TextStyle | ImageStyle> => {
    return styles.filter(Boolean) as Array<ViewStyle | TextStyle | ImageStyle>;
  },
};

/**
 * Helper to create pressed state with opacity
 */
export function pressableState(opacity: number = 0.85) {
  return { opacity };
}
