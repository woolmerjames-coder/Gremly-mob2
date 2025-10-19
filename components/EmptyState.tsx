import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type EmptyStateProps = {
  title: string; // e.g., "No To-Dos yet"
  subtitle?: string; // e.g., "Start small. Add one thing for today."
  icon?: React.ReactNode; // Optional mascot or emoji
  style?: ViewStyle;
  testID?: string;
};

export default function EmptyState({ title, subtitle, icon, style, testID }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]} testID={testID ?? 'empty-state'}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  icon: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#334155', textAlign: 'center', opacity: 0.9 },
});
