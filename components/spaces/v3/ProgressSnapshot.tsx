import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type ProgressSnapshotProps = {
  habitsCompleted: number;
  habitsTotal: number;
  todosOpen: number;
  notesAddedThisWeek: number;
  chatsActive: number;
  onPress?: () => void;
};

const AnimatedValueText = ({ value, style }: { value: number; style?: any }) => {
  const anim = useMemo(() => new Animated.Value(0), []);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    anim.stopAnimation();
    anim.removeAllListeners?.();
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(anim, { toValue: value, duration: 350, useNativeDriver: false }).start(() => {
      anim.removeListener?.(id);
      setDisplay(value);
    });
    return () => {
      anim.removeAllListeners?.();
    };
  }, [value, anim]);
  return <Text style={style}>{display}</Text>;
};

export const ProgressSnapshot: React.FC<ProgressSnapshotProps> = ({
  habitsCompleted,
  habitsTotal,
  todosOpen,
  notesAddedThisWeek,
  chatsActive,
  onPress,
}) => {
  const content = (
    <View style={styles.row}>
      <Chip label="Habits" value={`${habitsCompleted}/${habitsTotal}`} />
      <Chip label="To-Dos" value={<AnimatedValueText value={todosOpen} style={styles.value} />} />
      <Chip
        label="Notes"
        value={<AnimatedValueText value={notesAddedThisWeek} style={styles.value} />}
      />
      <Chip label="Chats" value={<AnimatedValueText value={chatsActive} style={styles.value} />} />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.container}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.container}>{content}</View>;
};

const Chip = ({ label, value }: { label: string; value: React.ReactNode | string }) => (
  <View style={styles.chip}>
    <Text style={styles.label}>{label}</Text>
    {typeof value === 'string' ? <Text style={styles.value}>{value}</Text> : value}
  </View>
);

const C = t.colors;
const S = t.spacing;
const R = t.radius;

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderRadius: R[2],
    padding: S[3],
    ...t.elevation.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    flex: 1,
    marginHorizontal: S[1],
    paddingVertical: S[2],
    paddingHorizontal: S[2],
    borderRadius: R[1],
    backgroundColor: C.linenCreamLight,
  },
  label: { color: C.subtle, fontSize: t.typography.size.xs, marginBottom: 2 },
  value: { color: C.text, fontSize: t.typography.size.md, fontWeight: '600' },
});

export default ProgressSnapshot;
