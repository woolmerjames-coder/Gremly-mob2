import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, useColorScheme } from 'react-native';
import { format } from 'date-fns';
import { COLORS, RADII, SPACE } from './_tokens';

export type HabitItem = { id: string; title: string; doneCount: number; target: number };
export type TodoItem = { id: string; title: string; done: boolean };

export type DayPanelProps = {
  dateISO: string;
  habits: HabitItem[];
  todos: TodoItem[];
  onAddItem?: () => void;
  onToggleHabit?: (id: string) => void;
  onToggleTodo?: (id: string) => void;
};

export const DayPanel: React.FC<DayPanelProps> = ({
  dateISO,
  habits,
  todos,
  onAddItem,
  onToggleHabit,
  onToggleTodo,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const dateLabel = useMemo(() => {
    const d = new Date(dateISO);
    return format(d, 'EEEE, MMM d');
  }, [dateISO]);

  // Expand/collapse animation on mount/update
  const open = React.useMemo(() => new Animated.Value(0), []);
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    Animated.timing(open, { toValue: 1, duration: 300, useNativeDriver: false }).start();
  }, [open, dateISO, habits.length, todos.length]);

  const heightStyle = measuredHeight
    ? {
        height: open.interpolate({ inputRange: [0, 1], outputRange: [0, measuredHeight] }),
        opacity: open.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
      }
    : {};

  return (
    <Animated.View
      style={[
        styles.card,
        isDark
          ? { backgroundColor: 'rgba(255,255,255,0.06)', shadowOpacity: 0 }
          : { backgroundColor: COLORS.Linen },
        heightStyle,
      ]}
    >
      <View
        onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
        style={{ paddingBottom: 2 }}
      >
        <Text
          style={[styles.headerText, isDark ? { color: COLORS.Linen } : { color: COLORS.Deep }]}
        >
          {dateLabel}
        </Text>

        {habits.length > 0 && (
          <View style={{ marginTop: SPACE.sm }}>
            {habits.map((h, idx) => (
              <HabitRow key={h.id} item={h} delay={idx * 60} onToggle={onToggleHabit} />
            ))}
          </View>
        )}

        {todos.length > 0 && (
          <View style={{ marginTop: SPACE.md }}>
            {todos.map((t) => (
              <TodoRow key={t.id} item={t} onToggle={onToggleTodo} />
            ))}
          </View>
        )}

        {habits.length === 0 && todos.length === 0 && (
          <Text style={[styles.empty, isDark ? { color: '#C8D5CE' } : { color: '#6D7B72' }]}>
            Nothing urgent — breathe and reflect.
          </Text>
        )}

        {onAddItem && (
          <TouchableOpacity
            onPress={onAddItem}
            accessibilityRole="button"
            accessibilityLabel="Add item"
            style={styles.addBtn}
          >
            <Text style={styles.addText}>+ Add item</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const HabitRow: React.FC<{ item: HabitItem; delay?: number; onToggle?: (id: string) => void }> = ({
  item,
  delay = 0,
  onToggle,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
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
                  : isDark
                    ? { borderColor: 'rgba(255,255,255,0.18)', borderWidth: 1 }
                    : { borderColor: '#00000014', borderWidth: 1 },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.habitMeta, isDark ? { color: '#C8D5CE' } : null]}>
        {filled > 0 ? `${filled}/${blocks} this week` : `This week: let's begin`}
      </Text>
    </TouchableOpacity>
  );
};

const TodoRow: React.FC<{ item: TodoItem; onToggle?: (id: string) => void }> = ({
  item,
  onToggle,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
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
      <Text
        style={[
          styles.todoText,
          isDark ? { color: '#EDEDE8' } : null,
          item.done && styles.todoTextDone,
        ]}
        numberOfLines={1}
      >
        {item.title}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
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
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    marginTop: 6,
    fontSize: 13.5,
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
  addBtn: {
    alignSelf: 'flex-start',
    marginTop: SPACE.md,
    backgroundColor: COLORS.Sage,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addText: {
    color: COLORS.Moss,
    fontWeight: '700',
  },
});

export default DayPanel;
