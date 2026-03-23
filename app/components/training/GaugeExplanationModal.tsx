import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../design/brand';
import MascotLottie from '../../components/MascotLottie';

interface GaugeExplanationModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function GaugeExplanationModal({ visible, onDismiss }: GaugeExplanationModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.mascotContainer}>
            <MascotLottie />
          </View>

          <Text style={styles.headline}>You just fed your Gremly</Text>

          <Text style={styles.body}>
            Every thought you drop fills it up. The goal? Fill it up every day.
          </Text>

          <Pressable style={styles.cta} onPress={onDismiss}>
            <Text style={styles.ctaText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.lg,
    padding: 24,
    width: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  mascotContainer: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginTop: 16,
  },
  body: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  cta: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
    marginTop: 24,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
