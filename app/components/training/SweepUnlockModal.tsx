import React, { useEffect, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BRAND } from '../../../design/brand';

import SWEEP_IMAGE from '../../../assets/mascot/sweepcomplete.png';

interface SweepUnlockModalProps {
  visible: boolean;
  onDismiss: () => void;
  onTryNow: () => void;
  /** "I'll do it tonight": the one ask for notifications follows (CatchAllNotepad) */
  onLater: () => void;
}

export default function SweepUnlockModal({
  visible,
  onDismiss,
  onTryNow,
  onLater,
}: SweepUnlockModalProps) {
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
          <Animated.View style={[styles.imageContainer, { transform: [{ scale: mascotScale }] }]}>
            <Image source={SWEEP_IMAGE} style={styles.sweepImage} resizeMode="contain" />
          </Animated.View>

          <Text style={styles.headline}>You unlocked the Sweep</Text>

          <Text style={styles.body}>
            Sweep helps you process what you dropped. Takes 2 minutes.{' '}
            <Text style={{ fontWeight: '600' }}>Best done before bed.</Text>
          </Text>

          <Pressable style={styles.cta} onPress={onTryNow}>
            <Text style={styles.ctaText}>Try it now</Text>
          </Pressable>

          <Pressable onPress={onLater}>
            <Text style={styles.secondaryText}>I'll do it tonight</Text>
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
  imageContainer: {
    height: 125,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepImage: {
    height: 125,
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
  secondaryText: {
    color: BRAND.colors.inkMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
});
