import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EmptyDayState() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>No events today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  text: { fontSize: 16, color: '#999' },
});
