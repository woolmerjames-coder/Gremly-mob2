/**
 * TodayCelebrationOverlay - Phase 9: Energy & Momentum
 * Celebration modal for Today v2 screen completions
 */

import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Text } from '../../ui';
import { Button } from '../../design-system/Button';
import { useTokens } from '../../design/makeStyles';

export interface TodayCelebrationOverlayProps {
  visible: boolean;
  onUndo?: () => void;
  onRequestClose: () => void;
  reducedMotion?: boolean;
}

export default function TodayCelebrationOverlay({
  visible,
  onUndo,
  onRequestClose,
  reducedMotion = false,
}: TodayCelebrationOverlayProps) {
  const t = useTokens();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onRequestClose}
      testID="celebrate-overlay"
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onRequestClose}>
        <View
          style={[styles.content, { backgroundColor: t.colors.surface }]}
          onStartShouldSetResponder={() => true}
        >
          {/* TODO Phase 12: Add confetti/Lottie animation */}
          <Text style={styles.emoji}>🎉</Text>

          <Text variant="title" style={styles.message}>
            Nice! Momentum unlocked.
          </Text>

          <View style={styles.actions}>
            {onUndo && (
              <Button label="Undo" variant="ghost" onPress={onUndo} testID="celebrate-undo" />
            )}
            <Button
              label="Continue"
              variant="primary"
              onPress={onRequestClose}
              testID="celebrate-continue"
            />
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  emoji: {
    fontSize: 64,
  },
  message: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
