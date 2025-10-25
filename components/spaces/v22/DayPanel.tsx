import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export type HabitItem = { id: string; title: string; doneCount: number; target: number };
export type TodoItem = { id: string; title: string; done: boolean };

export type DayPanelProps = {
  dateISO: string;
  habits: HabitItem[];
  todos: TodoItem[];
  onToggleHabit?: (id: string) => void;
  onToggleTodo?: (id: string) => void;
};

export const DayPanel: React.FC<DayPanelProps> = ({
  dateISO,
  habits,
  todos,
  onToggleHabit,
  onToggleTodo,
}) => {
  const dateLabel = useMemo(() => {
    const d = new Date(dateISO);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }, [dateISO]);

  return (
    <View style={styles.card}>
      <Text style={styles.headerText}>{dateLabel}</Text>

      {!!habits.length && (
        <View style={{ marginTop: SPACE.sm }}>
          {habits.map((h, idx) => (
            <HabitRow key={h.id} item={h} delay={idx * 60} onToggle={onToggleHabit} />
          ))}
        </View>
      )}

      {!!todos.length && (
        <View style={{ marginTop: SPACE.md }}>
          {todos.map((t) => (
            <TodoRow key={t.id} item={t} onToggle={onToggleTodo} />
          ))}
        </View>
      )}
    </View>
  );
};

const HabitRow: React.FC<{ item: HabitItem; delay?: number; onToggle?: (id: string) => void }> = ({
  item,
  delay = 0,
  onToggle,
}) => {
  const blocks = Math.max(1, item.target || 1);
  const filled = Math.max(0, Math.min(blocks, item.doneCount || 0));
  // simple fade-in for filled blocks
  const anims = useMemo(
    () => Array.from({ length: blocks }, () => new Animated.Value(0)),
    [blocks],
  );

  React.useEffect(() => {
    const seq = anims.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 240,
        delay: delay + i * 40,
        useNativeDriver: true,
      }),
    );
    Animated.stagger(40, seq).start();
  }, [anims, delay]);

  return (
    <TouchableOpacity
      onPress={() => onToggle && onToggle(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`Toggle habit ${item.title}`}
      style={styles.row}
    >
      <Text style={styles.habitTitle} numberOfLines={1}>
        {item.title.toUpperCase()}
      </Text>
      <View style={styles.blocksWrap}>
        {Array.from({ length: blocks }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <Animated.View
              key={i}
              style={[
                styles.block,
                { opacity: anims[i] },
                isFilled
                  ? { backgroundColor: COLORS.Pear }
                  : { borderColor: '#00000014', borderWidth: 1 },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.habitMeta}>{`${filled}/${blocks} this week`}</Text>
    </TouchableOpacity>
  );
};

const TodoRow: React.FC<{ item: TodoItem; onToggle?: (id: string) => void }> = ({
  item,
  onToggle,
}) => {
  const scale = React.useMemo(() => new Animated.Value(1), []);
  const bounce = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = () => {
    bounce();
    onToggle && onToggle(item.id);
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        accessibilityLabel={`Toggle to-do ${item.title}`}
        style={styles.checkboxHit}
      >
        <Animated.View
          style={[
            styles.checkbox,
            item.done
              ? { backgroundColor: COLORS.Moss, borderColor: COLORS.Moss }
              : { backgroundColor: 'transparent', borderColor: COLORS.Sage },
            { transform: [{ scale }] },
          ]}
        />
      </TouchableOpacity>
      <Text style={[styles.todoText, item.done && styles.todoTextDone]} numberOfLines={1}>
        {item.title}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.md,
    // shadow approximation (RN)
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerText: {
    color: COLORS.Deep,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  habitTitle: {
    flex: 1,
    color: COLORS.Text,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
  },
  blocksWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  block: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  habitMeta: {
    color: '#6A7A70',
    fontSize: 12,
    minWidth: 84,
    textAlign: 'right',
  },
  checkboxHit: {
    padding: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
  },
  todoText: {
    flex: 1,
    color: COLORS.Text,
    fontSize: 14,
  },
  todoTextDone: {
    color: '#6D7B72',
    textDecorationLine: 'line-through',
  },
});

export default DayPanel;
