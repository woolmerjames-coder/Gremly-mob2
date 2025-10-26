import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export type GoalCardProps = {
  title: string;
  done: number;
  target: number;
};

export default function GoalCard({ title, done, target }: GoalCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.progress}>
        {done}/{target}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(21,51,38,0.12)',
  },
  title: { fontWeight: '700', color: COLORS.Deep, marginBottom: 6 },
  progress: { color: COLORS.Moss },
});
