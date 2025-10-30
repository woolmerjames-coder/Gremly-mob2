import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useAuth } from '../../../providers/AuthProvider';

function formatLongDate(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function TodayHeader() {
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

  return (
    <View style={styles.wrap} testID="today-header">
      <Text style={styles.greeting}>Hi {firstName}</Text>
      <Text style={styles.date}>{formatLongDate()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  greeting: {
    ...BRAND.typography.subhead,
    fontSize: 24,
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
  },
  date: {
    ...BRAND.typography.body,
    fontSize: 16,
    color: BRAND.colors.sageMist,
  },
});
