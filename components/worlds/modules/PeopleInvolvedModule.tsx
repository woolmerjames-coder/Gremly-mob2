import { View, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useWorldPeople } from '../../../lib/store/worldsSelectors';
import { avatarForIndex } from '../../../lib/worlds/peopleAvatars';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import type { WorldModuleProps } from './types';

export function PeopleInvolvedModule({ world }: WorldModuleProps) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const people = useWorldPeople(world.id);
  if (people.length === 0) return null;

  return (
    <ModuleSection label="PEOPLE IN THIS WORLD">
      <View style={styles.row}>
        {people.map((p, i) => {
          const pal = avatarForIndex(i);
          return (
            <Pressable
              key={p.id}
              onPress={() => nav.navigate('PersonDetail', { personName: p.name })}
              style={styles.item}
              testID={`world-person-${p.id}`}
            >
              <View style={[styles.av, { backgroundColor: pal.bg }]}>
                <Text style={[styles.initials, { color: pal.fg }]}>{p.initials}</Text>
              </View>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.count}>{p.dropCount}</Text>
            </Pressable>
          );
        })}
      </View>
    </ModuleSection>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
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
  count: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    marginTop: -3,
  },
});
