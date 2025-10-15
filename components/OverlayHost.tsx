import React from 'react';
import ActionSheet, { SheetManager, registerSheet } from 'react-native-actions-sheet';
import { View, Text, Pressable, StyleSheet } from 'react-native';

registerSheet('demo-sheet', ({ sheetId }) => {
  return (
    <ActionSheet id={sheetId}>
      <View style={styles.container}>
        <Text style={styles.title}>Hello from a Global Sheet</Text>
        <Text style={styles.description}>This will host Manual Add and Reviews later.</Text>
        <Pressable style={styles.button} onPress={() => SheetManager.hide('demo-sheet')}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    </ActionSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#FFF7EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#0F4C5C',
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
    color: '#1A1A1A',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#0F4C5C',
  },
  buttonText: {
    color: '#FFF',
    textAlign: 'center',
    fontWeight: '600',
  },
});

export const OverlayHost = () => null;
