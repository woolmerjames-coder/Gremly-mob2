import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useLifeContexts } from '../../lib/store/worldsSelectors';

interface ContextsChipRowProps {
  onPressContext: (contextId: string) => void;
}

export function ContextsChipRow({ onPressContext }: ContextsChipRowProps) {
  const contexts = useLifeContexts().filter((c) => c.active);
  if (contexts.length === 0) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>CONTEXTS</Text>
      {contexts.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onPressContext(c.id)}
          style={styles.chip}
          testID={`context-chip-${c.id}`}
        >
          <View style={styles.chipDot} />
          <Text style={styles.chipText}>
            {c.name} · {c.kind}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 4,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(138,148,165,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(138,148,165,0.3)',
    borderRadius: 999,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8A94A5',
  },
  chipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    color: '#3A4C60',
  },
});
