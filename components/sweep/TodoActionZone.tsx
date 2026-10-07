import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowRight, Calendar, Bell, ChevronDown, Sun, Hourglass } from 'lucide-react-native';
import { Text } from '../../ui';
import { ActionPill } from './ActionPill';
import { ContextHeader } from './ContextHeader';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

/** What a todo card can be kept for: a day, or put off for Later. */
export type TodoAction = 'today' | 'tomorrow' | 'later' | 'pickdate';

type TodoActionZoneProps = {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  selectedAction: TodoAction;
  onSelectAction: (action: TodoAction) => void;
  sweepIntent?: 'today' | 'tomorrow';
  /**
   * The pills' words, each day with how full it already is ("Tue · 6h").
   * later is null when Later is not offered: the todo has been put off twice,
   * or no day is open for it to come back on.
   */
  labels: { today: string; tomorrow: string; later: string | null; pick: string };
  /**
   * A todo that has come back twice: the card asks keep or let go first, and
   * shows its days only once Keep has been chosen.
   */
  asking?: boolean;
  reminderEnabled: boolean;
  selectedReminder: 'daybefore' | 'morning' | 'custom' | null;
  onToggleReminder: () => void;
  onSelectReminder: (reminder: 'daybefore' | 'morning' | 'custom' | null) => void;
  confirmedCustomDate: string | null;
  /** The day picked for a custom reminder, as its pill reads; null until one is picked */
  confirmedReminderDate?: string | null;
  onRequestDatePicker: () => void;
  onRequestReminderDatePicker: () => void;
};

/** Gremly's words on a todo that has come back twice. */
export const KEEP_OR_LET_GO = "You've put this off twice now. Keep it, or let it go?";

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
  candidate: _candidate,
  meta,
  selectedAction,
  onSelectAction,
  reminderEnabled,
  selectedReminder,
  onToggleReminder,
  onSelectReminder,
  confirmedCustomDate,
  confirmedReminderDate = null,
  onRequestDatePicker,
  onRequestReminderDatePicker,
  sweepIntent = 'tomorrow',
  labels,
  asking = false,
}: TodoActionZoneProps) {
  const status = getStatus(meta);

  const bellColor = reminderEnabled ? '#2E5540' : 'rgba(34,34,34,0.45)';
  const chevronColor = bellColor;

  // Come back twice: keep or let go is asked before any day is offered
  if (asking) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <ContextHeader status={status} style={{ marginBottom: 0 }} />
        </View>
        <Text style={styles.askText} testID="todo-keep-or-let-go">
          {KEEP_OR_LET_GO}
        </Text>
      </View>
    );
  }

  const today = (
    <ActionPill
      icon={<Sun size={16} strokeWidth={2} />}
      label={labels.today}
      active={selectedAction === 'today'}
      onPress={() => onSelectAction('today')}
    />
  );
  const tomorrow = (
    <ActionPill
      icon={<ArrowRight size={16} strokeWidth={2.5} />}
      label={labels.tomorrow}
      active={selectedAction === 'tomorrow'}
      onPress={() => onSelectAction('tomorrow')}
    />
  );
  // Later: put off through the week's Later, to come back on the day named.
  // Side by side with Pick a date the two go without their icons, to fit.
  const later = (icon: boolean) =>
    labels.later ? (
      <ActionPill
        icon={icon ? <Hourglass size={16} strokeWidth={2} /> : undefined}
        label={labels.later}
        active={selectedAction === 'later'}
        onPress={() => onSelectAction('later')}
      />
    ) : null;
  const pick = (icon: boolean) => (
    <ActionPill
      icon={icon ? <Calendar size={16} strokeWidth={2} /> : undefined}
      label={confirmedCustomDate ?? labels.pick}
      active={selectedAction === 'pickdate'}
      onPress={() => {
        onSelectAction('pickdate');
        onRequestDatePicker();
      }}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ContextHeader status={status} style={{ marginBottom: 0 }} />
      </View>

      {/* The days it can be kept for, each with how full it already is, and Later */}
      <View style={styles.pillGroup}>
        {sweepIntent === 'today' ? (
          <>
            {today}
            {tomorrow}
            {labels.later ? (
              <View style={styles.splitRow}>
                <View style={{ flex: 1 }}>{later(false)}</View>
                <View style={{ flex: 1 }}>{pick(false)}</View>
              </View>
            ) : (
              pick(true)
            )}
          </>
        ) : (
          <>
            {tomorrow}
            {later(true)}
            {pick(true)}
          </>
        )}
      </View>

      {/* Reminder expandable. Not with Later: a todo put off has no day for a reminder to go by */}
      {selectedAction !== 'later' && (
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
                { color: reminderEnabled ? '#2E5540' : 'rgba(34,34,34,0.45)' },
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
                  key === 'custom' && confirmedReminderDate ? confirmedReminderDate : label;

                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.subPill,
                      isActive ? styles.subPillActive : styles.subPillInactive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  askText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    lineHeight: 21,
    color: '#2C4A38',
    marginBottom: 6,
  },
  pillGroup: {
    gap: 6,
  },
  splitRow: {
    flexDirection: 'row' as const,
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
    backgroundColor: 'rgba(191,216,192,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(191,216,192,0.35)',
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
    backgroundColor: 'rgba(191,216,192,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(191,216,192,0.2)',
  },
  subPillActive: {
    backgroundColor: 'rgba(191,216,192,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.3)',
  },
  subPillText: {
    fontSize: 11.5,
  },
  subPillTextInactive: {
    fontWeight: '500',
    color: 'rgba(34,34,34,0.45)',
  },
  subPillTextActive: {
    fontWeight: '700',
    color: '#2E5540',
  },
});
