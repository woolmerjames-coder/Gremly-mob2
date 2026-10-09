/**
 * The box at the foot of the Worlds home, a World and a Chapter, with Gremly
 * sitting on it, the same moving Gremly as on Ask Gremly's box. It opens the
 * page's own chat over the page
 * (components/worlds/PageChat.tsx); on the Worlds home, a fresh one. Above
 * it, on the Worlds home, the one question Gremly has waiting (stage 3).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MascotLottie from '../../app/components/MascotLottie';
import { F, W } from '../../lib/worlds/look';
import { Diamond } from './parts';

export const BOX_SPACE = 92;
/** The room the question above the box takes, when there is one. */
export const CHIP_SPACE = 48;

// Gremly sits on the box as he does on Ask Gremly's (app/tabs/AskGremlyScreen.tsx):
// 95 by 111, his feet 23 down into the box
const MASCOT_OVER_BOX = 23;

export function GremlyBox({
  onPress,
  above,
  chip,
}: {
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
      <Pressable
        onPress={onPress}
        style={[styles.g, { bottom: 10 + edge + 54 - MASCOT_OVER_BOX }]}
        accessible={false}
        testID="gremly-box-mascot"
      >
        <MascotLottie />
      </Pressable>
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
  g: { position: 'absolute', right: 14, width: 95, height: 111, zIndex: 3 },
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
  chips: { flexDirection: 'row', marginRight: 104, paddingBottom: 10 },
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
