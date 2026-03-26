import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'lucide-react-native';

type Status = 'new' | 'unscheduled' | 'overdue' | 'due_today';

type ContextHeaderProps = {
  status: Status;
  label?: string;
  icon?: React.ReactNode;
};

const STATUS_CONFIG: Record<Status, { label: string; badge: string; color: string }> = {
  new: { label: 'SCHEDULE FOR', badge: 'new drop', color: '#2E5540' },
  unscheduled: { label: 'SCHEDULE FOR', badge: 'unscheduled', color: '#2E5540' },
  due_today: { label: 'RESCHEDULE FOR', badge: 'was due today', color: '#C47A20' },
  overdue: { label: 'RESCHEDULE FOR', badge: 'overdue', color: '#C94040' },
};

export function ContextHeader({ status, label: labelOverride, icon }: ContextHeaderProps) {
  const config = STATUS_CONFIG[status];
  const color = config.color;
  const displayLabel = labelOverride ?? config.label;
  const showBadge = !labelOverride;

  return (
    <View style={styles.container}>
      {icon ?? <Calendar size={12} strokeWidth={2.5} color={color} />}
      <Text style={[styles.label, { color }]}>{displayLabel}</Text>
      {showBadge ? (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{config.badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'Inter-Medium',
  },
  badgeContainer: {
    backgroundColor: 'rgba(34,34,34,0.03)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: 'rgba(34,34,34,0.55)',
    letterSpacing: 0.2,
  },
});
