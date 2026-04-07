import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CalendarHeader() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>CalendarHeader</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 12 },
  text: { fontSize: 14, color: '#666' },
});
