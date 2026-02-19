/**
 * DaySummaryToggle
 *
 * Two side-by-side summary cards acting as a tab toggle
 * between the calendar view and the task/prioritize view.
 * Both cards are always visible — active card gets a filled background.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '../../../../ui';
import { Calendar } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface DaySummaryToggleProps {
  eventCount: number;
  freeMinutes: number;
  selectedMinutes: number;
  totalAvailableMinutes: number;
  remainingMinutes: number;
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

function getQualitativeMessage(ratio: number): string {
  if (ratio > 1.0) return "That's a lot — trim some?";
  if (ratio >= 0.85) return 'Tight but doable';
  if (ratio >= 0.5) return 'Looking good';
  return 'Plenty of room';
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function DaySummaryToggle({
  eventCount,
  freeMinutes,
  selectedMinutes,
  totalAvailableMinutes,
  activeTab,
  onTabChange,
}: DaySummaryToggleProps) {
  const ratio = totalAvailableMinutes > 0 ? selectedMinutes / totalAvailableMinutes : 0;
  const isOver = ratio > 1.0;
  const message = getQualitativeMessage(ratio);

  const calendarActive = activeTab === 'calendar';
  const tasksActive = activeTab === 'tasks';

  return (
    <View style={styles.row}>
      {/* LEFT CARD — Calendar */}
      <Pressable
        style={({ pressed }) => [
          styles.card,
          calendarActive ? styles.cardActive : styles.cardInactive,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onTabChange('calendar')}
      >
        <View style={styles.cardContent}>
          <Calendar size={14} color={BRAND.colors.inkMuted} />
          <Text style={styles.calendarText}>
            {eventCount} event{eventCount !== 1 ? 's' : ''} · {fmt(freeMinutes)} free
          </Text>
        </View>
      </Pressable>

      {/* RIGHT CARD — Tasks qualitative */}
      <Pressable
        style={({ pressed }) => [
          styles.card,
          tasksActive ? styles.cardActive : styles.cardInactive,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onTabChange('tasks')}
      >
        <Text style={[styles.taskMessage, isOver && styles.taskMessageOver]}>{message}</Text>
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
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  cardActive: {
    backgroundColor: '#E8F0EB',
    borderColor: '#D6E5D9',
  },
  cardInactive: {
    backgroundColor: '#FEFDFB',
    borderColor: '#E8E6E1',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  taskMessage: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  taskMessageOver: {
    color: '#C45B4A',
  },
});
