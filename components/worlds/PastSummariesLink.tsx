import { Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface PastSummariesLinkProps {
  onPress: () => void;
}

export function PastSummariesLink({ onPress }: PastSummariesLinkProps) {
  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <Text style={styles.text}>see past weekly summaries</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
  },
});
