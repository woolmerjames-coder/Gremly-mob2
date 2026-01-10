/**
 * AgeUpCelebrationModal Component
 *
 * Celebrates when Gremly ages up after completing a daily ritual.
 * Shows a supportive message based on the milestone reached.
 *
 * Ritual: Drop 3 thoughts + Sweep 3 cards = Gremly ages by 1 day
 */

import React from 'react';
import { View, StyleSheet, Modal, Image, TouchableOpacity, Pressable } from 'react-native';
import { Text } from '../../ui';
import { Sparkles } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

// Mascot image for celebration
import GREMLY_FISTBUMP from '../../assets/mascot/fistbumpgremly.png';

interface AgeUpCelebrationModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Gremly's new age after aging up */
  newAge: number;
  /** Callback when user dismisses the modal */
  onDismiss: () => void;
}

/**
 * Get a supportive message based on the age milestone
 */
function getMessage(age: number): string {
  if (age === 1) {
    return "Your first day together! Here's to many more.";
  } else if (age === 7) {
    return "A whole week! You're building something real.";
  } else if (age === 30) {
    return "A month of growth. Gremly's proud of you.";
  } else if (age === 100) {
    return '100 days! You and Gremly are unstoppable.';
  } else if (age === 365) {
    return 'A whole year together. What a journey!';
  } else if (age % 30 === 0) {
    return `${age / 30} months of steady growth. Keep going!`;
  } else if (age % 7 === 0) {
    return `${age / 7} weeks strong. You're doing great!`;
  } else {
    return 'Another day, another step forward.';
  }
}

export default function AgeUpCelebrationModal({
  visible,
  newAge,
  onDismiss,
}: AgeUpCelebrationModalProps) {
  const message = getMessage(newAge);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          {/* Title */}
          <Text style={styles.title}>Gremly grew up!</Text>

          {/* Mascot */}
          <View style={styles.mascotContainer}>
            <Image
              source={GREMLY_FISTBUMP}
              style={styles.mascot}
              resizeMode="contain"
              accessibilityLabel="Gremly celebrating"
            />
          </View>

          {/* Age display */}
          <View style={styles.ageRow}>
            <View style={styles.ageDivider} />
            <View style={styles.ageContent}>
              <Sparkles size={20} color={BRAND.colors.goldenPear} />
              <Text style={styles.ageText}>Day {newAge}</Text>
            </View>
            <View style={styles.ageDivider} />
          </View>

          {/* Message */}
          <Text style={styles.message}>{message}</Text>

          {/* Dismiss button */}
          <TouchableOpacity style={styles.button} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Nice!</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.xl,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 24,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  mascotContainer: {
    marginBottom: 16,
  },
  mascot: {
    width: 120,
    height: 120,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  ageDivider: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  ageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  ageText: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  message: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: BRAND.radius.md,
    width: '100%',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
