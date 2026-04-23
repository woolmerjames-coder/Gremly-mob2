import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { usePendingProposalCount } from '../../lib/store/worldsSelectors';

interface ProposalBannerProps {
  onPress: () => void;
}

export function ProposalBanner({ onPress }: ProposalBannerProps) {
  const count = usePendingProposalCount();
  if (count === 0) return null;
  return (
    <Pressable onPress={onPress} style={styles.card} testID="proposal-banner">
      <Text style={styles.tag}>
        GREMLY HAS {count} SUGGESTION{count === 1 ? '' : 'S'}
      </Text>
      <Text style={styles.body}>Review proposed changes to your graph -&gt;</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(162,153,201,0.1)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(162,153,201,0.35)',
    borderRadius: 12,
  },
  tag: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: lightTokens.colors.noticedLabel,
    marginBottom: 3,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.noticedText,
  },
});
