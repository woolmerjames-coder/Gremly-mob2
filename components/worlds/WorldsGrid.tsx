import { View, StyleSheet } from 'react-native';
import { useWorlds, useWorldDormancy, useWorldIsEmerging } from '../../lib/store/worldsSelectors';
import { WorldCard } from './WorldCard';
import { WorldCardEmerging } from './WorldCardEmerging';
import { WorldCardDormant } from './WorldCardDormant';
import { AddWorldCTA } from './AddWorldCTA';
import type { World } from '../../lib/supabase/types';

interface WorldsGridProps {
  onPressWorld: (worldId: string) => void;
  onPressAdd: () => void;
}

export function WorldsGrid({ onPressWorld, onPressAdd }: WorldsGridProps) {
  const worlds = useWorlds();
  const sorted = sortWorldsForGrid(worlds);

  return (
    <View style={styles.grid}>
      {sorted.map((w) => (
        <View key={w.id} style={styles.cell}>
          <WorldCardSwitcher worldId={w.id} world={w} onPress={onPressWorld} />
        </View>
      ))}
      <View style={styles.cell}>
        <AddWorldCTA onPress={onPressAdd} />
      </View>
    </View>
  );
}

interface SwitcherProps {
  worldId: string;
  world: World;
  onPress: (worldId: string) => void;
}

function WorldCardSwitcher({ worldId, world, onPress }: SwitcherProps) {
  const dormancy = useWorldDormancy(worldId);
  const isEmerging = useWorldIsEmerging(worldId);
  if (isEmerging) return <WorldCardEmerging world={world} onPress={onPress} />;
  if (dormancy === 'quiet' || dormancy === 'dormant' || dormancy === 'archived') {
    return <WorldCardDormant world={world} onPress={onPress} />;
  }
  return <WorldCard world={world} onPress={onPress} />;
}

function sortWorldsForGrid(worlds: World[]): World[] {
  // Active worlds first (most recent signal), then quieter ones after
  return [...worlds].sort((a, b) => {
    return (b.last_signal_at ?? '').localeCompare(a.last_signal_at ?? '');
  });
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    gap: 8,
  },
  cell: {
    width: '48.5%',
  },
});
