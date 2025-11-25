/**
 * NOW Active Item Card Component
 * Displays an active todo or habit in the NOW list
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';

export function NowActiveItemCard() {
  // Placeholder data - will be replaced with real data in Phase 3
  return (
    <TouchableOpacity style={styles.container}>
      <Box style={styles.content}>
        <Box style={styles.checkboxContainer}>
          <Box style={styles.checkbox} />
        </Box>
        <Box style={styles.textContainer}>
          <Text style={styles.itemText}>Placeholder active item</Text>
          <Text style={styles.status}>2 days left this week</Text>
        </Box>
      </Box>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9E9E9E',
  },
  textContainer: {
    flex: 1,
  },
  itemText: {
    fontSize: 15,
    color: '#212121',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    color: '#757575',
    fontStyle: 'italic',
  },
});
