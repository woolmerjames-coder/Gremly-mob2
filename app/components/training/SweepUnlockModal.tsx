import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BRAND } from '../../../design/brand';

import SWEEP_IMAGE from '../../../assets/mascot/sweepcomplete.png';

interface SweepUnlockModalProps {
  visible: boolean;
  onDismiss: () => void;
  onTryNow: () => void;
  onSetReminder: (time: Date) => void;
}

function getDefaultEveningTime(): Date {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  return d;
}

export default function SweepUnlockModal({
  visible,
  onDismiss,
  onTryNow,
  onSetReminder,
}: SweepUnlockModalProps) {
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(getDefaultEveningTime);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.imageContainer}>
            <Image source={SWEEP_IMAGE} style={styles.sweepImage} resizeMode="contain" />
          </View>

          <Text style={styles.headline}>You unlocked Evening Sweep</Text>

          <Text style={styles.body}>
            Sweep helps you process what you dropped. Swipe to keep, let go, or schedule. Takes 2
            minutes. Best done before bed.
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
              <Text style={styles.timePrompt}>When should I remind you?</Text>

              <DateTimePicker
                mode="time"
                display="compact"
                value={selectedTime}
                onChange={(_event, date) => {
                  if (date) setSelectedTime(date);
                }}
              />

              <Pressable
                style={styles.cta}
                onPress={() => {
                  onSetReminder(selectedTime);
                  onDismiss();
                }}
              >
                <Text style={styles.ctaText}>Set reminder</Text>
              </Pressable>
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
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepImage: {
    height: 100,
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
