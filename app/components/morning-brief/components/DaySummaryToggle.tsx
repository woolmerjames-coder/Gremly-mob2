/**
 * DaySummaryToggle
 *
 * Two side-by-side cards matching the Today-page card style.
 * Each card has two rows: icon + title + chevron, then a subtitle.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '../../../../ui';
import { Calendar, CircleCheckBig, ChevronRight } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface DaySummaryToggleProps {
  eventCount: number;
  freeMinutes: number;
  todoCount: number;
  habitCount: number;
  activeTab: 'calendar' | 'tasks';
  onTabChange: (tab: 'calendar' | 'tasks') => void;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function DaySummaryToggle({
  eventCount,
  freeMinutes,
  todoCount,
  habitCount,
  activeTab,
  onTabChange,
}: DaySummaryToggleProps) {
  const calendarActive = activeTab === 'calendar';
  const tasksActive = activeTab === 'tasks';

  return (
    <View style={styles.row}>
      {/* LEFT CARD — Calendar */}
      <Pressable
        style={[styles.card, calendarActive ? styles.cardActive : styles.cardInactive]}
        onPress={() => onTabChange('calendar')}
      >
        <View style={styles.topRow}>
          <Calendar
            size={16}
            color={calendarActive ? BRAND.colors.mossGreen : BRAND.colors.inkMuted}
          />
          <Text
            style={[
              styles.title,
              { color: calendarActive ? BRAND.colors.charcoalInk : BRAND.colors.inkMuted },
            ]}
          >
            Calendar
          </Text>
          <ChevronRight size={14} color={BRAND.colors.inkMuted} />
        </View>
        <Text style={styles.subtitle}>
          {eventCount} event{eventCount !== 1 ? 's' : ''} · {fmt(freeMinutes)} free
        </Text>
      </Pressable>

      {/* RIGHT CARD — Tasks */}
      <Pressable
        style={[styles.card, tasksActive ? styles.cardActive : styles.cardInactive]}
        onPress={() => onTabChange('tasks')}
      >
        <View style={styles.topRow}>
          <CircleCheckBig
            size={16}
            color={tasksActive ? BRAND.colors.mossGreen : BRAND.colors.inkMuted}
          />
          <Text
            style={[
              styles.title,
              { color: tasksActive ? BRAND.colors.charcoalInk : BRAND.colors.inkMuted },
            ]}
          >
            Tasks
          </Text>
          <ChevronRight size={14} color={BRAND.colors.inkMuted} />
        </View>
        <Text style={styles.subtitle}>
          {todoCount} todo{todoCount !== 1 ? 's' : ''}, {habitCount} habit
          {habitCount !== 1 ? 's' : ''}
        </Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6E5D9',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardInactive: {
    backgroundColor: '#F5F2ED',
    borderColor: '#E8E6E1',
    opacity: 0.6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  subtitle: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
  },
});
