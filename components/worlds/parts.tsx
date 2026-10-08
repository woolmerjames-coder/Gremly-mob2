/**
 * Small pieces the Worlds screens share: a section's heading, Gremly's
 * diamond, the dashed note for an empty section, and a text link.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { F, W } from '../../lib/worlds/look';

export function SectionHead({ title, count }: { title: string; count?: string | number | null }) {
  return (
    <View style={styles.sec} accessibilityRole="header">
      <Text style={styles.secText}>{title}</Text>
      {count !== undefined && count !== null && count !== '' ? (
        <Text style={styles.secCount}>{String(count)}</Text>
      ) : null}
    </View>
  );
}

/** Gremly's mark: a small periwinkle diamond. */
export function Diamond({ size = 8, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: W.peri,
          borderRadius: 1.5,
          transform: [{ rotate: '45deg' }],
        },
        style,
      ]}
    />
  );
}

/** A quiet dashed box for a section with nothing in it. */
export function NoneYet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.none}>
      <Text style={styles.noneText}>{children}</Text>
    </View>
  );
}

export function TextLink({
  label,
  onPress,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={[{ alignSelf: 'flex-start' }, style]}
      testID={testID}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

/** The plural people expect: 1 thing, 2 things. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const styles = StyleSheet.create({
  sec: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 6,
    marginHorizontal: 2,
  },
  secText: { fontFamily: F.ui, fontSize: 17, color: W.forest },
  secCount: { fontFamily: F.bodyMedium, fontSize: 13, color: W.muted },
  none: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(46,85,64,0.25)',
    borderRadius: 18,
    padding: 16,
  },
  noneText: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: W.muted },
  link: {
    fontFamily: F.bodySemi,
    fontSize: 14,
    color: W.moss,
    textDecorationLine: 'underline',
  },
});
