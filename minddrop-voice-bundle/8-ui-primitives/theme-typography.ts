// theme/typography.ts
import { StyleSheet } from 'react-native';
import { colors } from './tokens';

export const type = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '700', color: colors.deepTeal, letterSpacing: 0.2 },
  h2: { fontSize: 20, fontWeight: '700', color: colors.deepTeal },
  subtitle: { fontSize: 14, color: colors.gray600 },
  body: { fontSize: 16, color: colors.ink },
  meta: { fontSize: 12, color: colors.gray600 },
});
