/**
 * Pick a World: for moving a Chapter, merging two Worlds, or bringing a
 * hidden one back.
 */
import { View } from 'react-native';
import type { World } from '../../lib/supabase/types';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { worldGremly, worldName } from '../../lib/worlds/model';
import { MenuRow, SheetNote, SheetTitle } from './Sheet';

export function WorldPick({
  title,
  note,
  worlds,
  current,
  onPick,
}: {
  title: string;
  note?: string | null;
  worlds: World[];
  current?: string | null;
  onPick: (world: World) => void;
}) {
  return (
    <View>
      <SheetTitle>{title}</SheetTitle>
      {note ? <SheetNote>{note}</SheetNote> : <View style={{ height: 8 }} />}
      {worlds.map((w) => (
        <MenuRow
          key={w.id}
          image={resolveMascotAsset(worldGremly(w))}
          title={worldName(w)}
          selected={w.id === current}
          onPress={() => onPick(w)}
          testID={`pick-world-${w.id}`}
        />
      ))}
    </View>
  );
}
