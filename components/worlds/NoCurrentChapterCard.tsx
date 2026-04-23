import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface NoCurrentChapterCardProps {
  worldId: string;
}

export function NoCurrentChapterCard({ worldId }: NoCurrentChapterCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>No active chapter</Text>
      <Text style={styles.sub}>
        Chapters help you track bounded effort — a project, season, or milestone.
      </Text>
      <Pressable
        onPress={() => console.log('[NoCurrentChapterCard] add chapter pressed', worldId)}
        style={styles.button}
        testID="add-chapter-cta"
      >
        <Text style={styles.buttonLabel}>+ add a chapter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: lightTokens.colors.oatDeeper,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
  },
  heading: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
    marginBottom: 6,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: lightTokens.colors.warmGrey,
    textAlign: 'center',
    marginBottom: 14,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatDeeper,
  },
  buttonLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: lightTokens.colors.warmGrey,
  },
});
