import { Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface AddWorldCTAProps {
  onPress: () => void;
}

export function AddWorldCTA({ onPress }: AddWorldCTAProps) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID="add-world-cta">
      <Plus size={18} color={lightTokens.colors.warmGrey} />
      <Text style={styles.label}>add world</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(15,47,32,0.25)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
  },
});
