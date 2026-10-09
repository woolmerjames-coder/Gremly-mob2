/**
 * The box at the foot of the Worlds home, a World and a Chapter, with Gremly
 * sitting on it. It opens the page's own chat over the page
 * (components/worlds/PageChat.tsx); on the Worlds home, a fresh one. Above
 * it, on the Worlds home, the one question Gremly has waiting (stage 3).
 */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { F, W } from '../../lib/worlds/look';
import { Diamond } from './parts';

export const BOX_SPACE = 92;
/** The room the question above the box takes, when there is one. */
export const CHIP_SPACE = 48;

export function GremlyBox({
  slug,
  onPress,
  above,
  chip,
}: {
  slug: string;
  onPress: () => void;
  /** Sits this far up, over a tab bar that already keeps clear of the screen's edge */
  above?: number;
  /** Gremly's question, waiting as a button above the box */
  chip?: { label: string; onPress: () => void } | null;
}) {
  const insets = useSafeAreaInsets();
  const edge = above === undefined ? insets.bottom : 0;
  return (
    <View
      style={[styles.dock, { bottom: above ?? 0, paddingBottom: 10 + edge }]}
      pointerEvents="box-none"
    >
      <LinearGradient
        colors={['rgba(249,246,241,0)', W.linen]}
        style={styles.fade}
        pointerEvents="none"
      />
      {chip ? (
        <View style={styles.chips}>
          <Pressable
            onPress={chip.onPress}
            style={({ pressed }) => [styles.chip, pressed && { transform: [{ scale: 0.97 }] }]}
            accessibilityRole="button"
            accessibilityLabel={`Gremly asks: ${chip.label}`}
            testID="worlds-ask"
          >
            <Diamond size={8} />
            <Text style={styles.chipText} numberOfLines={1}>
              {chip.label}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Image
        source={resolveMascotAsset(slug)}
        style={[styles.g, { bottom: 46 + edge }]}
        resizeMode="contain"
        accessible={false}
      />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.box, pressed && { borderColor: W.moss }]}
        accessibilityRole="button"
        accessibilityLabel="Add to this, or ask Gremly"
        testID="gremly-box"
      >
        <Text style={styles.ph}>Add to this, or ask Gremly</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 30,
    backgroundColor: 'transparent',
  },
  fade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  g: { position: 'absolute', right: 22, width: 64, height: 64, zIndex: 3 },
  box: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.field,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 92,
    shadowColor: '#1A3328',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  ph: { flex: 1, fontFamily: F.body, fontSize: 16, color: '#8a8a8a' },
  chips: { flexDirection: 'row', marginRight: 68, paddingBottom: 10 },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingLeft: 13,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: 'rgba(156,166,224,0.65)',
    shadowColor: '#1A3328',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chipText: { flexShrink: 1, fontFamily: F.bodySemi, fontSize: 14, color: W.forest },
});
