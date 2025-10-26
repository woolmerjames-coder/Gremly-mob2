import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACE } from './_tokens';

export default function IconRow({ children }: { children?: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
});
