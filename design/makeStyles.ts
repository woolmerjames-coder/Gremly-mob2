/**
 * makeStyles - StyleSheet factory with theme support
 * Inspired by React Native Paper's useTheme pattern
 */

import { StyleSheet } from 'react-native';
import { useTheme, Theme } from './theme';
import { spacing, borderRadius, fontSize, fontWeight, lineHeight, shadows } from './tokens';

// Re-export tokens for convenience
export { spacing, borderRadius, fontSize, fontWeight, lineHeight, shadows };

/**
 * Creates a stylesheet with theme support
 * Usage:
 *   const styles = makeStyles((theme) => ({
 *     container: { backgroundColor: theme.colors.bg.DEFAULT },
 *     text: { color: theme.colors.text.primary }
 *   }))
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  styleFactory: (theme: Theme) => T,
): () => T {
  return function useStyles(): T {
    const { theme } = useTheme();
    return StyleSheet.create(styleFactory(theme));
  };
}

/**
 * Helper to create static styles (no theme dependency)
 * Usage:
 *   const styles = createStyles({ container: { flex: 1 } })
 */
export function createStyles<T extends StyleSheet.NamedStyles<T>>(styles: T): T {
  return StyleSheet.create(styles);
}
