import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type QuickStatsRowProps = {
  habitsCount: number;
  todosCount: number;
  notesCount: number;
  journalCount: number;
};

const Chip = ({ icon, label, value }: { icon: string; label: string; value: number }) => (
  <View style={styles.chip}>
    <Text style={styles.icon}>{icon}</Text>
    <Text style={styles.text}>{label}</Text>
    <Text style={styles.count}>{value}</Text>
  </View>
);

export const QuickStatsRow: React.FC<QuickStatsRowProps> = ({
  habitsCount,
  todosCount,
  notesCount,
  journalCount,
}) => {
  const entries = [
    { icon: '✓', label: 'Habits', value: habitsCount },
    { icon: '□', label: 'To-Dos', value: todosCount },
    { icon: '🗒', label: 'Notes', value: notesCount },
    { icon: '✍️', label: 'Journal', value: journalCount },
  ].filter((e) => e.value > 0);

  if (entries.length === 0) return null;

  return (
    <View style={styles.row}>
      {entries.map((e, idx) => (
        <Chip key={idx} icon={e.icon} label={e.label} value={e.value} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'transparent',
  },
  icon: { fontSize: 16, color: t.colors.charcoalInk },
  text: { fontSize: 13, color: t.colors.charcoalInk },
  count: { fontSize: 13, color: t.colors.charcoalInk, fontWeight: '600' },
});

export default QuickStatsRow;
