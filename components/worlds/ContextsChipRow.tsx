import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useLifeContexts } from '../../lib/store/worldsSelectors';

export function ContextsChipRow() {
  const contexts = useLifeContexts().filter((c) => c.active);
  if (contexts.length === 0) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>CONTEXTS</Text>
      {contexts.map((c) => (
        <View key={c.id} style={styles.chip}>
          <View style={styles.chipDot} />
          <Text style={styles.chipText}>
            {c.name} · {c.kind}
          </Text>
        </View>
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
    backgroundColor: lightTokens.colors.chipNeutralBg,
    borderWidth: 1,
    borderColor: lightTokens.colors.chipNeutralBorder,
    borderRadius: 999,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: lightTokens.colors.chipNeutralDot,
  },
  chipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    color: lightTokens.colors.chipNeutralText,
  },
});
