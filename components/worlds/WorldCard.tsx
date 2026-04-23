import { Pressable, View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import type { World } from '../../lib/supabase/types';

interface WorldCardProps {
  world: World;
  onPress: (worldId: string) => void;
}

export function WorldCard({ world, onPress }: WorldCardProps) {
  const palette = useWorldPalette(world.id);
  const name = world.display_name || world.name;
  const subtitle = deriveSubtitle(world);

  return (
    <Pressable
      onPress={() => onPress(world.id)}
      style={[styles.card, { backgroundColor: palette.tint }]}
      testID={`world-card-${world.id}`}
    >
      <View>
        <View style={styles.hdr}>
          <View style={[styles.dot, { backgroundColor: palette.dot }]} />
        </View>
        <Text style={styles.name}>{name}</Text>
      </View>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </Pressable>
  );
}

function deriveSubtitle(world: World): string {
  if (world.description) {
    const first = world.description.split(/[.!?]/)[0];
    if (first && first.length < 60) return first.trim().toLowerCase();
    return world.description.slice(0, 55).trim().toLowerCase() + '...';
  }
  const v = world.signal_velocity;
  const vNum = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!isNaN(vNum) && vNum > 0) return `${vNum.toFixed(1)} drops/wk`;
  return '';
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 80,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  name: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: lightTokens.colors.deepForest,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(15,47,32,0.68)',
    marginTop: 6,
  },
});
