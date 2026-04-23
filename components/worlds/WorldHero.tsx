import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotIcon from '../MascotIcon';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import type { World } from '../../lib/supabase/types';

interface WorldHeroProps {
  world: World;
  narrativeQuote?: string | null;
}

export function WorldHero({ world, narrativeQuote }: WorldHeroProps) {
  const palette = useWorldPalette(world.id);
  const { label, color } = resolveVelocityChip(world, palette);
  const velocityText = formatVelocityNumber(world.signal_velocity);

  return (
    <View style={styles.hero}>
      <MascotIcon size={50} />
      <View style={styles.body}>
        <Text style={[styles.tag, { color }]}>
          <Text style={[styles.dot, { color }]}>{'● '}</Text>
          {label}
          {velocityText ? ` · ${velocityText}` : ''}
        </Text>
        {narrativeQuote ? (
          <Text style={styles.quote}>{narrativeQuote}</Text>
        ) : (
          <Text style={styles.quotePlaceholder}>
            Your pattern for this world appears here after your next weekly summary.
          </Text>
        )}
      </View>
    </View>
  );
}

function resolveVelocityChip(
  world: World,
  palette: { dot: string; base: string },
): { label: string; color: string } {
  switch (world.signal_velocity_delta) {
    case 'growing':
      return { label: 'RISING', color: palette.dot };
    case 'stable':
      return { label: 'STEADY', color: lightTokens.colors.ambergoldDeep };
    case 'declining':
      return { label: 'COOLING', color: 'rgba(15,47,32,0.6)' };
    default:
      return { label: 'STEADY', color: lightTokens.colors.ambergoldDeep };
  }
}

function formatVelocityNumber(raw: string | number | null | undefined): string {
  if (raw == null) return '';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (isNaN(n)) return '';
  if (n < 1) return '< 1 DROPS/WK';
  return `${n.toFixed(1)} DROPS/WK`;
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.05)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  body: { flex: 1, minWidth: 0 },
  tag: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  dot: { fontSize: 10 },
  quote: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: lightTokens.colors.deepForest,
    marginTop: 6,
  },
  quotePlaceholder: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
    marginTop: 6,
  },
});
