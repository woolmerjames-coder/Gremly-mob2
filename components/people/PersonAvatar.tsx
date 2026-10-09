/**
 * Someone's circle: the first letter of how they are named, in a colour that
 * stays the same wherever they are drawn (People, their page, the People row).
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { initialOf, personTitle, type PersonRecord } from '../../lib/people/people';
import { F } from '../../lib/worlds/look';

const AVATARS = lightTokens.colors.avatarPalette;

/** The colours of someone's circle. Pure. */
export function avatarOf(p: Pick<PersonRecord, 'name' | 'relationship'>) {
  return AVATARS[(personTitle(p).charCodeAt(0) || 0) % AVATARS.length];
}

export function PersonAvatar({
  person,
  size = 44,
  style,
}: {
  person: Pick<PersonRecord, 'name' | 'relationship'>;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pal = avatarOf(person);
  return (
    <View
      style={[
        styles.c,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: pal.bg },
        style,
      ]}
    >
      <Text style={[styles.t, { color: pal.fg, fontSize: Math.round(size * 0.39) }]}>
        {initialOf(person)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { alignItems: 'center', justifyContent: 'center' },
  t: { fontFamily: F.ui },
});
