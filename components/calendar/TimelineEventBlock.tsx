import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TimelineEventBlock() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>TimelineEventBlock</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { fontSize: 14, color: '#666' },
});
