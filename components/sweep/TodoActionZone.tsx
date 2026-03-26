import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  ArrowRight,
  CalendarDays,
  Calendar,
  Bell,
  ChevronDown,
} from 'lucide-react-native';
import { Text } from '../../ui';
import { ActionPill } from './ActionPill';
import { ContextHeader } from './ContextHeader';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

type TodoActionZoneProps = {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  selectedAction: 'tomorrow' | 'nextweek' | 'pickdate';
  onSelectAction: (action: 'tomorrow' | 'nextweek' | 'pickdate') => void;
  reminderEnabled: boolean;
  selectedReminder: 'daybefore' | 'morning' | 'custom' | null;
  onToggleReminder: () => void;
  onSelectReminder: (reminder: 'daybefore' | 'morning' | 'custom' | null) => void;
  confirmedCustomDate: string | null;
  onRequestDatePicker: () => void;
  onRequestReminderDatePicker: () => void;
};

type ReminderKey = 'daybefore' | 'morning' | 'custom';

function getStatus(meta: SweepCardMeta): 'new' | 'unscheduled' | 'overdue' | 'due_today' {
  if (meta.isNew) return 'new';
  if (meta.todoStatus === 'overdue') return 'overdue';
  if (meta.todoStatus === 'due_today') return 'due_today';
  if (meta.todoStatus === 'unscheduled') return 'unscheduled';
  return 'new';
}

const REMINDER_PILLS: { key: ReminderKey; label: string }[] = [
  { key: 'daybefore', label: 'Day before' },
  { key: 'morning', label: 'Morning of' },
  { key: 'custom', label: 'Custom' },
];

export function TodoActionZone({
  candidate,
  meta,
  selectedAction,
  onSelectAction,
  reminderEnabled,
  selectedReminder,
  onToggleReminder,
  onSelectReminder,
  confirmedCustomDate,
  onRequestDatePicker,
  onRequestReminderDatePicker,
}: TodoActionZoneProps) {
  const status = getStatus(meta);

  const bellColor = reminderEnabled ? '#9CA6E0' : 'rgba(34,34,34,0.45)';
  const chevronColor = bellColor;

  return (
    <View style={styles.container}>
      {/* Context header */}
      <ContextHeader status={status} />

      {/* Schedule pills */}
      <View style={styles.pillGroup}>
        <ActionPill
          icon={<ArrowRight size={16} strokeWidth={2.5} />}
          label="Tomorrow"
          active={selectedAction === 'tomorrow'}
          onPress={() => onSelectAction('tomorrow')}
        />
        <ActionPill
          icon={<CalendarDays size={16} strokeWidth={2} />}
          label="Next Week"
          active={selectedAction === 'nextweek'}
          onPress={() => onSelectAction('nextweek')}
        />
        <ActionPill
          icon={<Calendar size={16} strokeWidth={2} />}
          label={confirmedCustomDate ?? 'Pick a date'}
          active={selectedAction === 'pickdate'}
          onPress={() => {
            onSelectAction('pickdate');
            onRequestDatePicker();
          }}
        />
      </View>

      {/* Reminder expandable */}
      <View style={styles.reminderSection}>
        {/* Toggle row */}
        <Pressable style={styles.toggleRow} onPress={onToggleReminder}>
          <View
            style={[
              styles.bellContainer,
              reminderEnabled ? styles.bellContainerActive : styles.bellContainerInactive,
            ]}
          >
            <Bell size={14} strokeWidth={2} color={bellColor} />
          </View>

          <Text
            style={[
              styles.toggleLabel,
              { color: reminderEnabled ? '#5B6494' : 'rgba(34,34,34,0.45)' },
            ]}
          >
            {reminderEnabled ? 'Set reminder' : 'Add a reminder'}
          </Text>

          <ChevronDown
            size={13}
            strokeWidth={2}
            color={chevronColor}
            style={reminderEnabled ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </Pressable>

        {/* Sub-pills */}
        {reminderEnabled && (
          <Animated.View entering={FadeInUp.duration(150)} style={styles.subPillRow}>
            {REMINDER_PILLS.map(({ key, label }) => {
              const isActive = selectedReminder === key;
              const displayLabel =
                key === 'custom' && confirmedCustomDate ? confirmedCustomDate : label;

              return (
                <Pressable
                  key={key}
                  style={[styles.subPill, isActive ? styles.subPillActive : styles.subPillInactive]}
                  onPress={() => {
                    if (isActive) {
                      onSelectReminder(null);
                    } else if (key === 'custom') {
                      onRequestReminderDatePicker();
                      onSelectReminder('custom');
                    } else {
                      onSelectReminder(key);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.subPillText,
                      isActive ? styles.subPillTextActive : styles.subPillTextInactive,
                    ]}
                  >
                    {displayLabel}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 22,
  },
  pillGroup: {
    gap: 6,
  },
  reminderSection: {
    marginTop: 10,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  bellContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellContainerActive: {
    backgroundColor: 'rgba(156,166,224,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,166,224,0.4)',
  },
  bellContainerInactive: {
    backgroundColor: 'rgba(34,34,34,0.03)',
    borderWidth: 1.5,
    borderColor: 'rgba(191,216,192,0.12)',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },

  // Sub-pills
  subPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    paddingLeft: 40,
  },
  subPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  subPillInactive: {
    backgroundColor: 'rgba(156,166,224,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,166,224,0.15)',
  },
  subPillActive: {
    backgroundColor: 'rgba(156,166,224,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,166,224,0.4)',
  },
  subPillText: {
    fontSize: 11.5,
  },
  subPillTextInactive: {
    fontWeight: '500',
    color: 'rgba(156,166,224,0.6)',
  },
  subPillTextActive: {
    fontWeight: '700',
    color: '#5B6494',
  },
});
