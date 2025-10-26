import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

type GoalSectionProps = {
  title?: string;
  children: React.ReactNode;
};

type GoalsZoneProps = {
  children: React.ReactNode;
};

// Wrapper that provides Sage tint background for both IconRow and Goals
export function GoalsZone({ children }: GoalsZoneProps) {
  return <View style={styles.zone}>{children}</View>;
}

export default function GoalSection({ title, children }: GoalSectionProps) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    backgroundColor: COLORS.SectionGoalsTint,
    borderTopLeftRadius: RADII.section,
    borderTopRightRadius: RADII.section,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: SPACE.md,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: `${COLORS.Moss}CC`, // Moss @80%
    letterSpacing: 0.3,
    marginBottom: 6,
    paddingHorizontal: 20,
    fontFamily: 'Inter-Medium',
  },
  content: {
    backgroundColor: 'transparent', // Zone provides the background now
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
});
