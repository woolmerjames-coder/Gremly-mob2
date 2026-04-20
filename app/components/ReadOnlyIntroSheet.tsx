import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../design/brand';
import MascotLottie from './MascotLottie';

const c = BRAND.colors;

interface ReadOnlyIntroSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSubscribe: () => void;
}

export default function ReadOnlyIntroSheet({
  visible,
  onDismiss,
  onSubscribe,
}: ReadOnlyIntroSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={styles.bottomCard}>
        <View style={styles.dragHandle} />

        <View style={styles.mascotContainer}>
          <MascotLottie />
        </View>

        <Text style={styles.headerTitle}>Your Gremly is fed on what you've shared</Text>

        <Text style={styles.body}>
          Your free access has ended. Everything you've built is safe — your thoughts, your
          patterns, your summaries.
          {'\n\n'}
          To keep feeding me new things, you'll need to subscribe.
        </Text>

        <Pressable style={styles.primaryButton} onPress={onSubscribe}>
          <Text style={styles.primaryButtonText}>Keep going together</Text>
        </Pressable>

        <Pressable onPress={onDismiss}>
          <Text style={styles.dismissText}>Maybe later</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4D6CE',
    alignSelf: 'center',
    marginBottom: 12,
  },
  mascotContainer: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: c.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 22,
    color: c.inkMuted,
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: c.mossGreen,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  dismissText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: c.inkMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
