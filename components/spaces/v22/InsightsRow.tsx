import React from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACE, RADII } from './_tokens';
import { StickyNote, Users, CalendarClock } from '../../icons';

export type InsightsRowProps = {
  onOpenNotepad: () => void;
  onOpenPeople: () => void;
  onOpenTimeline: () => void;
};

export const InsightsRow: React.FC<InsightsRowProps> = ({
  onOpenNotepad,
  onOpenPeople,
  onOpenTimeline,
}) => {
  const s1 = React.useMemo(() => new Animated.Value(1), []);
  const s2 = React.useMemo(() => new Animated.Value(1), []);
  const s3 = React.useMemo(() => new Animated.Value(1), []);

  const pulse = (v: Animated.Value) => {
    Animated.sequence([
      Animated.timing(v, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onOpenNotepad}
        accessibilityRole="button"
        accessibilityLabel="Open notepad"
        testID="open-notepad"
        style={styles.btn}
        onPressIn={() => pulse(s1)}
      >
        <Animated.View style={{ transform: [{ scale: s1 }] }}>
          <StickyNote color={COLORS.Moss} size={24} />
        </Animated.View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenPeople}
        accessibilityRole="button"
        accessibilityLabel="Open people"
        style={styles.btn}
        onPressIn={() => pulse(s2)}
      >
        <Animated.View style={{ transform: [{ scale: s2 }] }}>
          <Users color={COLORS.Sage} size={24} />
        </Animated.View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenTimeline}
        accessibilityRole="button"
        accessibilityLabel="Open timeline"
        style={styles.btn}
        onPressIn={() => pulse(s3)}
      >
        <Animated.View style={{ transform: [{ scale: s3 }] }}>
          <CalendarClock color={COLORS.Pear} size={24} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.sm,
    borderRadius: RADII.btn,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});

export default InsightsRow;
