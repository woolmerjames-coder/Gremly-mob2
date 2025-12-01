import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useAuth } from '../../../providers/AuthProvider';
import TodayProgressHeader, { type TodayProgressItem } from './TodayProgressHeader';

function formatLongDate(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export type TodayHeaderProps = {
  /** Number of completed items today */
  completedCount?: number;
  /** Total number of items for today */
  totalCount?: number;
  /** Individual items for the dot row */
  items?: TodayProgressItem[];
  /** IDs that were just completed this session (for glow effect) */
  justCompletedIds?: Set<string>;
  /** Called when user taps on the progress header */
  onProgressPress?: () => void;
};

export default function TodayHeader({
  completedCount = 0,
  totalCount = 0,
  items = [],
  justCompletedIds,
  onProgressPress,
}: TodayHeaderProps) {
  const { user } = useAuth();
  const firstName = useMemo(() => {
    type AuthDisplayUser = {
      user_metadata?: { full_name?: string | null };
      name?: string | null;
      email?: string | null;
    };
    const metaUser = (user ?? null) as AuthDisplayUser | null;
    const name = metaUser?.user_metadata?.full_name ?? metaUser?.name ?? metaUser?.email ?? 'there';
    return String(name).split(' ')[0];
  }, [user]);

  const showProgress = totalCount > 0;

  return (
    <View style={styles.wrap} testID="today-header">
      <Text style={styles.greeting}>Hi {firstName}</Text>
      <Text style={styles.date}>{formatLongDate()}</Text>
      {showProgress && (
        <TodayProgressHeader
          completedCount={completedCount}
          totalCount={totalCount}
          items={items}
          justCompletedIds={justCompletedIds}
          onProgressPress={onProgressPress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  greeting: {
    ...BRAND.typography.subhead,
    fontSize: 24,
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
  },
  date: {
    ...BRAND.typography.body,
    fontSize: 18,
    color: BRAND.colors.mossGreen,
  },
});
