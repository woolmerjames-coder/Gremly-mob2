import { Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface AddWorldCTAProps {
  onPress: () => void;
}

export function AddWorldCTA({ onPress }: AddWorldCTAProps) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID="add-world-cta">
      <Plus size={18} color={lightTokens.colors.warmGrey} />
      <Text style={styles.label}>add world</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.worldsInkOutline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
  },
});
