/**
 * UnifiedAddOverlay - v3.3 Space-locked add overlay
 * Wraps UnifiedCreateOverlay with space context locked and enforced
 */
import React, { useCallback } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, Platform, ToastAndroid } from 'react-native';
import { BlurView } from 'expo-blur';
import { Text } from '../../../../ui/Text';
import { UnifiedCreateOverlay } from '../../../overlay/UnifiedCreateOverlay';
import { COLORS, RADII, SPACE } from '../_tokens';
import { X } from '../../../icons';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  space: { id: string; name: string };
};

export default function UnifiedAddOverlay({ isOpen, onClose, space }: Props) {
  const handleSaved = useCallback(
    (result: { type: string; id: string }) => {
      onClose();
      // Show success toast
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Added to ${space.name}`, ToastAndroid.SHORT);
      } else {
        // iOS: silent success, aggregate subscription will update
        console.log('[UnifiedAddOverlay] Added', result.type, 'to', space.name);
      }
    },
    [onClose, space.name],
  );

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="UnifiedAddOverlay"
    >
      <View style={styles.backdrop}>
        <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} />

        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={styles.container}>
          {/* Header with locked space pill */}
          <View style={styles.header}>
            <View style={styles.spacePill} testID="UnifiedAddSpacePill">
              <View style={styles.dot} />
              <Text style={styles.spacePillText}>Space: {space.name}</Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X color={COLORS.Moss} size={20} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Wrapped UnifiedCreateOverlay */}
          <View style={styles.contentWrap}>
            <UnifiedCreateOverlay
              visible={isOpen}
              mode="create"
              initialSpaceId={space.id}
              onClose={onClose}
              onSaved={handleSaved}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: `${COLORS.Deep}14`,
    justifyContent: 'flex-end',
  },
  container: {
    height: '78%',
    backgroundColor: COLORS.Linen,
    borderTopLeftRadius: RADII.overlay,
    borderTopRightRadius: RADII.overlay,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.Sage}30`,
    backgroundColor: COLORS.Linen,
  },
  spacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.Sage,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.Moss,
  },
  spacePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.Moss,
  },
  closeBtn: {
    padding: 8,
    borderRadius: RADII.btn,
    backgroundColor: `${COLORS.Sage}40`,
  },
  contentWrap: {
    flex: 1,
  },
});
