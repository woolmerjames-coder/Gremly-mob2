/**
 * NOW Future Divider Component
 * Separates NOW items from future items
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';

export function NowFutureDivider() {
  return (
    <Box style={styles.container}>
      <Box style={styles.line} />
      <Text style={styles.text}>Future</Text>
      <Box style={styles.line} />
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  text: {
    fontSize: 12,
    color: '#9E9E9E',
    fontWeight: '600',
    marginHorizontal: 12,
    letterSpacing: 0.5,
  },
});
