import { useColorScheme } from 'react-native';
import { colors, motion } from './tokens';

export function useTheme() {
  const scheme = useColorScheme(); // 'light' | 'dark' | null
  const mode = scheme === 'dark' ? 'dark' : 'light';
  return { mode, c: colors[mode], motion } as const;
}
