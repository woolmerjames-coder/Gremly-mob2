import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { useAllPeople } from '../../lib/store/worldsSelectors';

const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#D5E4D0', fg: '#1A3A28' },
  { bg: '#EBDDC5', fg: '#6B4A2E' },
  { bg: '#E2DFEE', fg: '#5A3B5A' },
  { bg: '#D9E1EA', fg: '#2C4A5C' },
  { bg: '#F1D8C9', fg: '#8C3F1E' },
  { bg: '#D0E0DA', fg: '#2E5540' },
  { bg: '#E8D6DF', fg: '#7B3F57' },
  { bg: '#DDE3D0', fg: '#4B5A33' },
];

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
          const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
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
