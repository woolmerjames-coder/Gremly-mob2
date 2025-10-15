import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SheetManager } from 'react-native-actions-sheet';

export default function TodayScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.description}>Habits Today → Due Today → Might be today?</Text>
      <Pressable
        style={styles.button}
        onPress={async () => {
          console.log('Opening demo sheet…');
          await SheetManager.show('demo-sheet');
        }}
      >
        <Text style={styles.buttonText}>Open Demo Sheet</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EA',
    padding: 16,
    paddingBottom: 80, // Space for tab bar
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#0F4C5C',
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
    color: '#1A1A1A',
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#86E5C2',
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
  },
});
