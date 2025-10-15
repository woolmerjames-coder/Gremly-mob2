import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HubScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hub</Text>
      <Text style={styles.description}>All | Habits | To-Dos | Journal | Lists + Sorting Tray</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EA',
    padding: 16,
    paddingBottom: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#0F4C5C',
  },
  description: {
    fontSize: 16,
    color: '#1A1A1A',
  },
});
