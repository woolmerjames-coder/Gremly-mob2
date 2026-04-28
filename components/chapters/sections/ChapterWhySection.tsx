import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterWhySectionProps {
  chapter: Chapter;
}

export function ChapterWhySection({ chapter }: ChapterWhySectionProps) {
  if (!chapter.target_description) return null;

  return (
    <View style={styles.container}>
      {/* alias for commitmentAccentDeep — same hex as chipRelationshipText,
          different semantic origin. Token consolidation deferred. */}
      <Text style={[styles.label, { color: lightTokens.colors.chipRelationshipText }]}>WHY</Text>
      <Text style={styles.body}>{chapter.target_description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 22,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
});
