import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
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
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onOpenNotepad}
        accessibilityRole="button"
        accessibilityLabel="Open notepad"
        style={styles.btn}
      >
        <StickyNote color={COLORS.Moss} size={24} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenPeople}
        accessibilityRole="button"
        accessibilityLabel="Open people"
        style={styles.btn}
      >
        <Users color={COLORS.Moss} size={24} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenTimeline}
        accessibilityRole="button"
        accessibilityLabel="Open timeline"
        style={styles.btn}
      >
        <CalendarClock color={COLORS.Moss} size={24} />
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
