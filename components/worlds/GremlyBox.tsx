/**
 * The box at the foot of a World or a Chapter, with Gremly sitting on it.
 * Until the box opens in place (stage 2), it opens the chat for this World
 * or Chapter.
 */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { F, W } from '../../lib/worlds/look';

export const BOX_SPACE = 92;

export function GremlyBox({ slug, onPress }: { slug: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { paddingBottom: 10 + insets.bottom }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(249,246,241,0)', W.linen]}
        style={styles.fade}
        pointerEvents="none"
      />
      <Image
        source={resolveMascotAsset(slug)}
        style={[styles.g, { bottom: 46 + insets.bottom }]}
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
});
