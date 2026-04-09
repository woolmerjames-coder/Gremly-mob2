import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EmptyDayState() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nothing scheduled</Text>
      <Text style={styles.subtitle}>Tap + to add something to your day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  title: {
    fontSize: 17,
    fontWeight: '500',
    color: '#9E9E9E',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#BFBFBF',
  },
});
