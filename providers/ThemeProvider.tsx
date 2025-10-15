import React, { PropsWithChildren } from 'react';
import { View, StyleSheet } from 'react-native';

export function ThemeProvider({ children }: PropsWithChildren) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EA',
  },
});
