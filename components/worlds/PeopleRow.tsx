import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { useAllPeople } from '../../lib/store/worldsSelectors';
import { avatarForIndex } from '../../lib/worlds/peopleAvatars';

interface PeopleRowProps {
  onPressPerson: (personId: string) => void;
}

export function PeopleRow({ onPressPerson }: PeopleRowProps) {
  const people = useAllPeople();
  if (people.length === 0) return null;

  return (
    <View>
      <View style={styles.sec}>
        <Text style={styles.label}>PEOPLE</Text>
      </View>
      <View style={styles.row}>
        {people.map((p, i) => {
          const palette = avatarForIndex(i);
          return (
            <Pressable
              key={p.id}
              onPress={() => onPressPerson(p.id)}
              style={styles.item}
              testID={`people-${p.id}`}
            >
              <View style={[styles.av, { backgroundColor: palette.bg }]}>
                <Text style={[styles.initials, { color: palette.fg }]}>{p.initials}</Text>
              </View>
              <Text style={styles.name}>{p.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  item: { alignItems: 'center', gap: 4 },
  av: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  name: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    fontWeight: '500',
  },
});
