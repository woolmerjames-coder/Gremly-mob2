import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import CircleCheckButton from './CircleCheckButton';

type Lane = 'habit' | 'todo';

type Props = {
  id: string;
  lane: Lane;
  title: string;
  dueTime?: string | null;
  habitProgress?: { done: number; target: number } | null;
  onComplete: (id: string) => Promise<void> | void;
  testID?: string;
  onPress?: (id: string) => void;
};

export default function TodayRow({
  id,
  lane,
  title,
  dueTime,
  habitProgress,
  onComplete,
  testID,
  onPress,
}: Props) {
  const isHabit = lane === 'habit';
  const bg = isHabit ? BRAND.colors.sageMist : BRAND.colors.linenCream;
  const border = isHabit ? 'transparent' : 'rgba(46,85,64,0.2)';

  return (
    <Pressable
      onPress={onPress ? () => onPress(id) : undefined}
      accessibilityHint={onPress ? 'Opens item details' : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.92 : 1 },
      ]}
      testID={testID ?? `row-${lane}-${id}`}
      accessibilityLabel={`${title}. ${isHabit ? 'Habit' : 'Task'}`}
    >
      <Box row style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={styles.title} numberOfLines={1}>
            {title}
          </Text>

          {isHabit && habitProgress ? (
            <Text variant="subtle" style={styles.subtle} numberOfLines={1}>
              Today: {Math.min(habitProgress.done, habitProgress.target)} /{' '}
              {Math.max(1, habitProgress.target)}
            </Text>
          ) : null}

          {!isHabit && dueTime ? (
            <Text variant="subtle" style={styles.subtle} numberOfLines={1}>
              Due: {dueTime}
            </Text>
          ) : null}
        </View>

        <CircleCheckButton
          ariaLabel={isHabit ? 'Add a habit check-in' : 'Mark task complete'}
          onPress={() => onComplete(id)}
        />
      </Box>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...BRAND.elevation.one,
  },
  title: { fontWeight: '600', color: BRAND.colors.charcoalInk, fontSize: 14 },
  subtle: { color: BRAND.colors.inkMuted, fontSize: 12 },
});
