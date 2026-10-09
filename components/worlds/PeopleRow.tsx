/**
 * The People row on the Worlds home, beside Your story (Worlds rebuild,
 * stage 5): the circles of those who matter most to them now, and the way
 * to everyone in their life Gremly keeps. Not shown until someone is known.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { personTitle, type PersonListEntry } from '../../lib/people/people';
import { F, SHADOW, W } from '../../lib/worlds/look';
import { PersonAvatar } from '../people/PersonAvatar';

export function PeopleRow({ people, onOpen }: { people: PersonListEntry[]; onOpen: () => void }) {
  if (!people.length) return null;
  const top = people.slice(0, 4);
  const names = top.slice(0, 3).map(personTitle);
  const line =
    people.length > 3
      ? `${names.join(', ')} and ${people.length - 3} more`
      : names.length > 1
        ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
        : names[0];
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.94 }]}
      accessibilityRole="button"
      accessibilityLabel={`People: ${line}`}
      testID="worlds-people"
    >
      <View style={styles.faces}>
        {top.map((p, i) => (
          <PersonAvatar
            key={p.id}
            person={p}
            size={34}
            style={[styles.face, i > 0 && { marginLeft: -9 }]}
          />
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.k}>People</Text>
        <Text style={styles.b} numberOfLines={2}>
          {line}
        </Text>
      </View>
      <ChevronRight size={18} color={W.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    backgroundColor: W.white,
    borderRadius: 20,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 14,
    ...SHADOW,
  },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 2, borderColor: W.white },
  k: {
    fontFamily: F.ui,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: W.off,
  },
  b: { fontFamily: F.body, fontSize: 15, lineHeight: 20, color: W.forest, marginTop: 3 },
});
