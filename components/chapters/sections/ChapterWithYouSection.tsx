import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useChapterPeople } from '../../../lib/store/chaptersSelectors';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterWithYouSectionProps {
  chapter: Chapter;
}

export function ChapterWithYouSection({ chapter }: ChapterWithYouSectionProps) {
  const people = useChapterPeople(chapter);

  const { experienceAccentSoft, experienceAccentDeep, warmGrey, worldsInk } = lightTokens.colors;

  if (people.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: experienceAccentDeep }]}>WITH YOU</Text>
      {people.map((person) => (
        <View key={person.id} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: experienceAccentSoft }]}>
            <Text style={[styles.initials, { color: experienceAccentDeep }]}>
              {person.initials}
            </Text>
          </View>
          <View style={styles.personInfo}>
            <Text style={[styles.name, { color: worldsInk }]}>{person.name}</Text>
            {person.mentionCount !== undefined && (
              <Text style={[styles.meta, { color: warmGrey }]}>
                {person.mentionCount === 1 ? '1 mention' : `${person.mentionCount} mentions`}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initials: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
  },
  personInfo: {
    flex: 1,
  },
  name: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 16,
  },
});
