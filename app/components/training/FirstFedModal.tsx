import React, { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BRAND } from '../../../design/brand';
import MascotLottie from '../../components/MascotLottie';

interface FirstFedModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function FirstFedModal({ visible, onDismiss }: FirstFedModalProps) {
  const [bounceAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      bounceAnim.setValue(0);
      Animated.spring(bounceAnim, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const mascotScale = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Animated.View
            style={{
              transform: [{ scale: mascotScale }],
              alignItems: 'center',
            }}
          >
            <View style={styles.mascotContainer}>
              <MascotLottie />
            </View>
          </Animated.View>

          <Text style={styles.headline}>Your Gremly is full!</Text>

          <Text style={styles.body}>
            You did it. Every time something pops into your head, drop it here. Your Gremly catches
            it all. Do this every day and watch it grow.
          </Text>

          <Text style={styles.secondary}>Tap your Gremly anytime to check progress.</Text>

          <Pressable style={styles.cta} onPress={onDismiss}>
            <Text style={styles.ctaText}>What's next?</Text>
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
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 20,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
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
  secondary: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
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
