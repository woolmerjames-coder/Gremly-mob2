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
    <View>
      <View style={styles.grid}>
        {sorted.map((w) => (
          <View key={w.id} style={styles.cell}>
            <WorldCardSwitcher worldId={w.id} world={w} onPress={onPressWorld} />
          </View>
        ))}
      </View>
      <View style={styles.addRow}>
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
  return [...worlds].sort((a, b) => {
    // Primary: signal_velocity desc (most active first).
    // signal_velocity is numeric-as-string in the DB; parse defensively.
    const va = parseVelocity(a.signal_velocity);
    const vb = parseVelocity(b.signal_velocity);
    if (va !== vb) return vb - va;

    // Tiebreaker: most recent signal first.
    return (b.last_signal_at ?? '').localeCompare(a.last_signal_at ?? '');
  });
}

function parseVelocity(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
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
  addRow: {
    paddingHorizontal: 14,
    marginTop: 8,
  },
});
