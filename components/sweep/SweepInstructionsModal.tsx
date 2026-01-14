/**
 * SweepInstructionsModal Component
 *
 * Modal that explains how Sweep works when user taps on Gremly.
 */

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal } from 'react-native';
import { X } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SweepInstructionsModalProps {
  visible: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const SweepInstructionsModal: React.FC<SweepInstructionsModalProps> = ({
  visible,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>How Sweep works</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={20} color={BRAND.colors.inkMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <Text style={styles.bodyText}>I'll show you items one at a time.</Text>
            <Text style={styles.bodyText}>On each card:</Text>

            {/* Swipe Left */}
            <View style={styles.swipeSection}>
              <Text style={styles.swipeLabel}>← Swipe LEFT</Text>
              <Text style={styles.swipeDesc}>Done with it / let it go</Text>
            </View>

            {/* Swipe Right */}
            <View style={styles.swipeSection}>
              <Text style={styles.swipeLabel}>→ Swipe RIGHT</Text>
              <Text style={styles.swipeDesc}>Keep it, with the option you picked</Text>
            </View>

            <Text style={styles.bodyText}>
              Tap the options on the right side of the card to change what happens when you swipe
              right.
            </Text>
          </View>

          {/* Button */}
          <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    maxWidth: 340,
    shadowColor: 'black',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  title: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },

  closeButton: {
    padding: 4,
  },

  body: {
    marginBottom: 24,
  },

  bodyText: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    lineHeight: 22,
    marginBottom: 12,
  },

  swipeSection: {
    marginVertical: 8,
  },

  swipeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    marginBottom: 2,
  },

  swipeDesc: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },

  button: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },

  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SweepInstructionsModal;
