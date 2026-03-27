import React, { useEffect, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { getDateService } from '../../../lib/date';

import SWEEP_IMAGE from '../../../assets/mascot/sweepcomplete.png';

interface SweepUnlockModalProps {
  visible: boolean;
  onDismiss: () => void;
  onTryNow: () => void;
  onSetReminder: (time: Date) => void;
  timePickerOnly?: boolean;
}

function getDefaultEveningTime(): Date {
  const d = getDateService().now();
  d.setHours(20, 0, 0, 0);
  return d;
}

export default function SweepUnlockModal({
  visible,
  onDismiss,
  onTryNow,
  onSetReminder,
  timePickerOnly = false,
}: SweepUnlockModalProps) {
  const [showTimePicker, setShowTimePicker] = useState(!timePickerOnly ? false : true);
  const [selectedTime, setSelectedTime] = useState(getDefaultEveningTime);
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
          {timePickerOnly ? (
            <>
              <Text style={styles.timePrompt}>When should I remind you to sweep?</Text>

              <View style={styles.timePickerCenter}>
                <DateTimePicker
                  mode="time"
                  display="compact"
                  value={selectedTime}
                  onChange={(_event, date) => {
                    if (date) setSelectedTime(date);
                  }}
                />
              </View>

              <Pressable
                style={styles.cta}
                onPress={() => {
                  onSetReminder(selectedTime);
                  onDismiss();
                }}
              >
                <Text style={styles.ctaText}>Set reminder</Text>
              </Pressable>

              <Pressable onPress={() => onDismiss()} style={{ marginTop: 12, paddingVertical: 8 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: BRAND.colors.inkMuted,
                    textAlign: 'center',
                  }}
                >
                  Skip for now
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Animated.View
                style={[styles.imageContainer, { transform: [{ scale: mascotScale }] }]}
              >
                <Image source={SWEEP_IMAGE} style={styles.sweepImage} resizeMode="contain" />
              </Animated.View>

              <Text style={styles.headline}>You unlocked the Sweep</Text>

              <Text style={styles.body}>
                Sweep helps you process what you dropped. Takes 2 minutes.{' '}
                <Text style={{ fontWeight: '600' }}>Best done before bed.</Text>
              </Text>

              {!showTimePicker ? (
                <>
                  <Pressable style={styles.cta} onPress={onTryNow}>
                    <Text style={styles.ctaText}>Try it now</Text>
                  </Pressable>

                  <Pressable onPress={() => setShowTimePicker(true)}>
                    <Text style={styles.secondaryText}>I'll do it tonight</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowTimePicker(false)}
                    style={{ position: 'absolute', top: 16, left: 16, zIndex: 1 }}
                  >
                    <ArrowLeft size={20} color={BRAND.colors.mossGreen} />
                  </Pressable>

                  <Text style={styles.timePrompt}>When should I remind you?</Text>

                  <View style={styles.timePickerCenter}>
                    <DateTimePicker
                      mode="time"
                      display="compact"
                      value={selectedTime}
                      onChange={(_event, date) => {
                        if (date) setSelectedTime(date);
                      }}
                    />
                  </View>

                  <Pressable
                    style={styles.cta}
                    onPress={() => {
                      onSetReminder(selectedTime);
                      onDismiss();
                    }}
                  >
                    <Text style={styles.ctaText}>Set reminder</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onDismiss()}
                    style={{ marginTop: 12, paddingVertical: 8 }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: BRAND.colors.inkMuted,
                        textAlign: 'center',
                      }}
                    >
                      Skip for now
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}
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
  timePickerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 12,
    marginBottom: 12,
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
  timePrompt: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  },
});
