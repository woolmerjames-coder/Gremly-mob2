import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Compass } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

interface EmptySpaceStateProps {
  spaceName: string;
}

export function EmptySpaceState({ spaceName }: EmptySpaceStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Compass size={28} color={BRAND.colors.mossGreen} />
      </View>

      <Text style={styles.title}>{spaceName} is ready</Text>

      <Text style={styles.body}>
        Use the buttons below to add your first item or brainstorm with Gremly.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingBottom: 120,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default EmptySpaceState;
