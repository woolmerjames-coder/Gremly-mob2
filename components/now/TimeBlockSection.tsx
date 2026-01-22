import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS = {
  divider: '#E8E6E1',
  sectionDivider: '#D5D2CC',
};

const SECTION_COLORS: Record<string, string> = {
  locked: '#6B8F71', // Sage green
  morning: '#D4A574', // Muted warm tan
  afternoon: '#C9956C', // Muted terracotta
  evening: '#A89BC9', // Muted lavender
  anytime: '#999999', // Gray
};

const SECTION_LABELS: Record<string, string> = {
  locked: 'LOCKED IN',
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  evening: 'EVENING',
  anytime: 'ANY TIME',
};

interface TimeBlockSectionProps {
  block: 'locked' | 'morning' | 'afternoon' | 'evening' | 'anytime';
  isFirst?: boolean;
  calendarHint?: React.ReactNode;
  children: React.ReactNode;
}

export function TimeBlockSection({
  block,
  isFirst,
  calendarHint,
  children,
}: TimeBlockSectionProps) {
  const color = SECTION_COLORS[block];
  const label = SECTION_LABELS[block];

  return (
    <View style={styles.section}>
      {/* Section divider (unless first) */}
      {!isFirst && <View style={styles.sectionDivider} />}

      {/* Header row with accent bar */}
      <View style={styles.headerRow}>
        <View style={[styles.accent, { backgroundColor: color }]} />
        <Text style={[styles.headerText, { color }]}>{label}</Text>
      </View>

      {/* Calendar hint (if any) */}
      {calendarHint}

      {/* Items */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    // No special container styling needed
  },
  sectionDivider: {
    height: 1.5,
    backgroundColor: COLORS.sectionDivider,
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  accent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 10,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
