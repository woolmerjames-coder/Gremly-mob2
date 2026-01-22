import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock, Sunrise, Sun, Sunset, Clock } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

const SECTION_CONFIG: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  locked: { label: 'LOCKED IN', color: '#6B8F71', Icon: Lock },
  morning: { label: 'MORNING', color: '#D4A574', Icon: Sunrise },
  afternoon: { label: 'AFTERNOON', color: '#C9956C', Icon: Sun },
  evening: { label: 'EVENING', color: '#A89BC9', Icon: Sunset },
  anytime: { label: 'ANY TIME', color: '#999999', Icon: Clock },
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
  const { label, color, Icon } = SECTION_CONFIG[block];

  return (
    <View style={styles.section}>
      {/* Section divider (unless first) */}
      {!isFirst && <View style={styles.sectionDivider} />}

      {/* Header row with accent bar and icon */}
      <View style={styles.headerRow}>
        <View style={[styles.accent, { backgroundColor: color }]} />
        <Icon size={16} color={color} style={styles.icon} />
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
    backgroundColor: '#D5D2CC',
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
  icon: {
    marginRight: 6,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
