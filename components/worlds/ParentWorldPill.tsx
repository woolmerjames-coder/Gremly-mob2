import { Pressable, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface ParentWorldPillProps {
  worldName: string;
  onPress: () => void;
}

export function ParentWorldPill({ worldName, onPress }: ParentWorldPillProps) {
  return (
    <Pressable onPress={onPress} style={styles.pill} testID="parent-world-pill">
      <Globe size={14} color="#3A4C60" />
      <Text style={styles.text}>
        part of <Text style={styles.name}>{worldName}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(138,148,165,0.12)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '500',
    color: '#3A4C60',
  },
  name: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    color: lightTokens.colors.deepForest,
  },
});
