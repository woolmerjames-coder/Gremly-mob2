/**
 * The bar at the top of a World or a Chapter: back, where it sits, and the
 * menu. Dark on a Chapter, light on a World.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Ellipsis } from 'lucide-react-native';
import { F, W } from '../../lib/worlds/look';

export function PageTop({
  dark,
  crumb,
  onBack,
  onCrumb,
  onMenu,
}: {
  dark?: boolean;
  crumb: string;
  onBack: () => void;
  onCrumb?: () => void;
  onMenu?: () => void;
}) {
  const ink = dark ? W.linen : W.moss;
  const btn = [styles.hbtn, { backgroundColor: dark ? W.onDarkWash : 'rgba(46,85,64,0.08)' }];
  return (
    <View style={[styles.top, dark && { backgroundColor: W.forest }]}>
      <Pressable
        onPress={onBack}
        style={btn}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="page-back"
      >
        <ChevronLeft size={22} color={ink} />
      </Pressable>
      <Pressable
        onPress={onCrumb}
        disabled={!onCrumb}
        style={styles.crumb}
        accessibilityRole={onCrumb ? 'button' : 'text'}
        accessibilityLabel={onCrumb ? `Open ${crumb}` : crumb}
        testID="page-crumb"
      >
        <Text style={[styles.crumbText, { color: dark ? W.sage : W.off }]} numberOfLines={1}>
          {crumb}
        </Text>
      </Pressable>
      {onMenu ? (
        <Pressable
          onPress={onMenu}
          style={btn}
          accessibilityRole="button"
          accessibilityLabel="More"
          testID="page-menu"
        >
          <Ellipsis size={20} color={ink} />
        </Pressable>
      ) : (
        <View style={{ width: 36 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, paddingHorizontal: 10 },
  hbtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  crumb: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  crumbText: { fontFamily: F.bodySemi, fontSize: 14 },
});
