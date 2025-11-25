/**
 * NOW Vault Bar Component (Collapsed)
 * Displays Mind Vault summary with quick access pills
 */

import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';

export function NowVaultBar() {
  // Placeholder data - will be replaced with real data in Phase 3
  const pills = ['Groceries', 'Gift ideas', 'Mexico list', '+2 more'];

  return (
    <Box style={styles.container}>
      <Box style={styles.header}>
        <Text style={styles.title}>📚 Mind Vault</Text>
      </Box>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContainer}
      >
        {pills.map((pill, index) => (
          <TouchableOpacity key={index} style={styles.pill}>
            <Text style={styles.pillText}>{pill}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  pillsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
  },
  pillText: {
    fontSize: 13,
    color: '#424242',
    fontWeight: '500',
  },
});
