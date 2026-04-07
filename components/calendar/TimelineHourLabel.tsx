import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TimelineHourLabel() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>TimelineHourLabel</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  text: { fontSize: 12, color: '#999' },
});
