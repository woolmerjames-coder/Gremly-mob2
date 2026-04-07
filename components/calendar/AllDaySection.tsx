import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AllDaySection() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>AllDaySection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { fontSize: 14, color: '#666' },
});
