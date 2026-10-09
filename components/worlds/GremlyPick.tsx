/**
 * Pick its Gremly: the grid of every Gremly a World or a Chapter can wear.
 */
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { GREMLY_CATALOG } from '../../workers/shared/gremlys';
import { MASCOT_ASSETS, resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { W } from '../../lib/worlds/look';
import { MenuRow, SheetNote, SheetTitle } from './Sheet';

/** Every Gremly that has a picture, in the catalogue's order. */
export const PICKABLE_GREMLYS = GREMLY_CATALOG.filter((g) => !!MASCOT_ASSETS[g.slug]);

export function GremlyGrid({
  current,
  onPick,
}: {
  current: string | null;
  onPick: (slug: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {PICKABLE_GREMLYS.map((g) => {
        const on = g.slug === current;
        return (
          <Pressable
            key={g.slug}
            onPress={() => onPick(g.slug)}
            style={({ pressed }) => [
              styles.cell,
              on && styles.cellOn,
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Gremly with ${g.visual}`}
            accessibilityState={{ selected: on }}
            testID={`gremly-${g.slug}`}
          >
            <Image
              source={MASCOT_ASSETS[g.slug]}
              style={{ width: '78%', height: '78%' }}
              resizeMode="contain"
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function GremlyPick({
  forChapter,
  current,
  worldSlug,
  ownSet,
  onPick,
}: {
  forChapter: boolean;
  /** The Gremly it wears now */
  current: string;
  /** Its World's Gremly, for a Chapter */
  worldSlug?: string;
  /** A Chapter wearing its own Gremly rather than its World's */
  ownSet?: boolean;
  /** A slug, or null to wear its World's again */
  onPick: (slug: string | null) => void;
}) {
  return (
    <View>
      <SheetTitle>Pick its Gremly</SheetTitle>
      <SheetNote>
        {forChapter
          ? 'A Chapter can wear its own outfit. Leave it and it wears its World’s Gremly.'
          : 'Each World has its own little guy looking after it.'}
      </SheetNote>
      {forChapter && ownSet ? (
        <View style={{ marginBottom: 8 }}>
          <MenuRow
            image={resolveMascotAsset(worldSlug)}
            title={'Wear its World’s Gremly again'}
            onPress={() => onPick(null)}
            testID="gremly-world"
          />
        </View>
      ) : null}
      <GremlyGrid current={current} onPick={onPick} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  cell: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: W.white,
    borderWidth: 1.5,
    borderColor: W.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { borderColor: W.moss, backgroundColor: W.sageWash },
});
