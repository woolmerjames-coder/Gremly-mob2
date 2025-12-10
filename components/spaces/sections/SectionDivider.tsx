import React from 'react';
import { View, StyleSheet } from 'react-native';

export function SectionDivider() {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  line: {
    width: '35%',
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
});

export default SectionDivider;
