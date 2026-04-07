import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LABEL_WIDTH = 50;

interface TimelineHourLabelProps {
  hour: number; // 0–23
}

export default function TimelineHourLabel({ hour }: TimelineHourLabelProps) {
  const label = `${String(hour).padStart(2, '0')}:00`;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: LABEL_WIDTH,
    paddingTop: 2,
    paddingLeft: 8,
  },
  text: {
    fontSize: 11,
    color: '#9E9E9E',
  },
});
