import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Bell, Calendar, Clock, PenLine } from 'lucide-react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { ActionPill } from './ActionPill';
import { ContextHeader } from './ContextHeader';
import { SpaceButton } from './SpaceButton';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

type EventActionZoneProps = {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  selectedReminder: 'daybefore' | 'weekbefore' | 'custom';
  onSelectReminder: (reminder: 'daybefore' | 'weekbefore' | 'custom') => void;
  confirmedCustomReminderDate: string | null;
  onRequestReminderDatePicker: () => void;
  onRequestEditEventDate: () => void;
  eventDateOverride?: string;
  daysUntilEventOverride?: number;
  selectedSpaceId: string | null;
  selectedSpaceName: string | null;
  onRequestSpacePicker: () => void;
  onClearSpace: () => void;
};

export function EventActionZone({
  candidate: _candidate,
  meta,
  selectedReminder,
  onSelectReminder,
  confirmedCustomReminderDate,
  onRequestReminderDatePicker,
  onRequestEditEventDate,
  eventDateOverride,
  daysUntilEventOverride,
  selectedSpaceId,
  selectedSpaceName,
  onRequestSpacePicker,
  onClearSpace,
}: EventActionZoneProps) {
  const daysUntil = daysUntilEventOverride ?? meta.daysUntilEvent;
  const eventDateLabel = eventDateOverride ?? meta.eventDateFormatted;

  return (
    <View style={styles.container}>
      {/* Event date bar */}
      <View style={styles.eventBar}>
        <Calendar size={16} strokeWidth={2} color="#9A7B2E" />
        <View style={styles.eventInfo}>
          {eventDateLabel ? <Text style={styles.eventDate}>{eventDateLabel}</Text> : null}
          {daysUntil != null && (
            <Text
              style={[
                styles.eventCountdown,
                daysUntil === 0 && styles.eventCountdownToday,
                daysUntil < 0 && styles.eventCountdownPast,
              ]}
            >
              {daysUntil > 0
                ? `${daysUntil} days away`
                : daysUntil === 0
                  ? 'Today!'
                  : `${Math.abs(daysUntil)} days ago`}
            </Text>
          )}
        </View>
        <Pressable onPress={onRequestEditEventDate} hitSlop={8}>
          <PenLine size={13} strokeWidth={2} color="rgba(34,34,34,0.4)" />
        </Pressable>
      </View>

      <ContextHeader
        status="new"
        label="REMIND ME"
        icon={<Bell size={12} strokeWidth={2.5} color={BRAND.colors.mossGreen} />}
      />

      <View style={styles.pillGroup}>
        <ActionPill
          icon={<Bell size={16} strokeWidth={2} />}
          label="Day before"
          active={selectedReminder === 'daybefore'}
          onPress={() => onSelectReminder('daybefore')}
        />
        <ActionPill
          icon={<Clock size={16} strokeWidth={2} />}
          label="Week before"
          active={selectedReminder === 'weekbefore'}
          onPress={() => onSelectReminder('weekbefore')}
        />
        <ActionPill
          icon={<Calendar size={16} strokeWidth={2} />}
          label={confirmedCustomReminderDate || 'Custom reminder'}
          active={selectedReminder === 'custom'}
          onPress={() => {
            onSelectReminder('custom');
            onRequestReminderDatePicker();
          }}
        />
      </View>

      <SpaceButton
        active={selectedSpaceId !== null}
        spaceName={selectedSpaceName}
        onPress={selectedSpaceId !== null ? onClearSpace : onRequestSpacePicker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 22,
  },
  eventBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(224,196,122,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(224,196,122,0.25)',
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9A7B2E',
  },
  eventCountdown: {
    fontSize: 11,
    color: 'rgba(34,34,34,0.55)',
  },
  eventCountdownToday: {
    color: '#9A7B2E',
    fontWeight: '600',
  },
  eventCountdownPast: {
    color: '#C94040',
  },
  pillGroup: {
    gap: 6,
  },
});
