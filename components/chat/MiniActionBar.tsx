/**
 * MiniActionBar - Phase 10.5 Space Chats v1 + Harmonic Glass Design
 * Icon-only action buttons with glass effect and hover states
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Brain, Check, FileText, Flame, Pen } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';

interface MiniActionBarProps {
  onBrainPress?: () => void;
  onCheckPress?: () => void;
  onFilePress?: () => void;
  onFlamePress?: () => void;
  onPenPress?: () => void;
  testID?: string;
}

export function MiniActionBar({
  onBrainPress,
  onCheckPress,
  onFilePress,
  onFlamePress,
  onPenPress,
  testID,
}: MiniActionBarProps) {
  const actions = [
    { icon: Brain, onPress: onBrainPress, testID: 'brain' },
    { icon: Check, onPress: onCheckPress, testID: 'check' },
    { icon: FileText, onPress: onFilePress, testID: 'file' },
    { icon: Flame, onPress: onFlamePress, testID: 'flame' },
    { icon: Pen, onPress: onPenPress, testID: 'pen' },
  ];

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.backdrop} />
      <View style={styles.actionRow}>
        {actions.map(({ icon: Icon, onPress, testID: actionTestID }, index) => (
          <TouchableOpacity
            key={index}
            style={styles.actionButton}
            onPress={onPress}
            disabled={!onPress}
            testID={testID ? `${testID}-${actionTestID}` : undefined}
          >
            <Icon
              size={20}
              color={onPress ? lightTokens.colors.periwinkleSmoke : 'rgba(34, 34, 34, 0.3)'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(249, 246, 241, 0.6)', // Semi-translucent Linen Cream
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(249, 246, 241, 0.1)', // Subtle overlay
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)', // Subtle glass button
  },
});
