/**
 * A Gremly in its World's colour: the round face used for Worlds, Chapters
 * and the pickers.
 */
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { TINT } from '../../lib/worlds/look';
import type { WorldTint } from '../../lib/worlds/model';

export function GremlyFace({
  slug,
  tint,
  size,
  style,
}: {
  slug: string | null | undefined;
  tint: WorldTint;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.face,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: TINT[tint].wash },
        style,
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={resolveMascotAsset(slug)}
        style={{
          width: size * 0.86,
          height: size * 0.86,
          transform: [{ translateY: size * 0.08 }],
        }}
        resizeMode="contain"
      />
    </View>
  );
}

/** A Gremly on its own, no circle: the big ones on a page's header. */
export function GremlyImage({ slug, size }: { slug: string | null | undefined; size: number }) {
  return (
    <Image
      source={resolveMascotAsset(slug)}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
    />
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
