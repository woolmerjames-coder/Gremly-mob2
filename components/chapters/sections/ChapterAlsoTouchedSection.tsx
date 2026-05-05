import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useAlsoTouchedWorldsForChapter } from '../../../lib/store/chaptersSelectors';
import type { Chapter } from '../../../lib/supabase/types';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

interface ChapterAlsoTouchedSectionProps {
  chapter: Chapter;
}

export function ChapterAlsoTouchedSection({ chapter }: ChapterAlsoTouchedSectionProps) {
  const worlds = useAlsoTouchedWorldsForChapter(chapter.id);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (worlds.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>ALSO TOUCHED</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {worlds.map((w) => (
          <Pressable
            key={w.id}
            style={styles.chip}
            onPress={() => nav.navigate('WorldDetail', { worldId: w.id })}
            testID={`chapter-also-touched-${w.id}`}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {w.display_name || w.name}
            </Text>
            {w.drop_count > 1 ? <Text style={styles.chipCount}>{w.drop_count}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: lightTokens.colors.warmGrey,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    borderColor: lightTokens.colors.worldsCardBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: lightTokens.colors.worldsInk,
  },
  chipCount: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
  },
});
