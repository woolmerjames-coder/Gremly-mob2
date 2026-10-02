/**
 * The one ask's content: Gremly, one sentence that names every kind of
 * notification, one yes. Used by the sheet over the app and inside the
 * reminder sheet, so the words and the yes are the same everywhere.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../design/brand';
import { ASK_COPY, type AskVariant } from '../../lib/notifications/constants';
import { answerNotNow, answerYes } from '../../lib/notifications/ask';
import WAVING from '../../assets/mascot/gremlywaving.png';
import COFFEE from '../../assets/mascot/coffee_gremly.png';

const c = BRAND.colors;

interface AskPanelProps {
  variant: AskVariant;
  step: 'ask' | 'done';
  /** after a yes that switched notifications on */
  onOn: () => void;
  /** Not now, a refused iOS prompt, or the trip to iPhone Settings */
  onClose: () => void;
  /** Done on the "all set" step */
  onDone: () => void;
}

export default function AskPanel({ variant, step, onOn, onClose, onDone }: AskPanelProps) {
  const [busy, setBusy] = useState(false);
  const copy = ASK_COPY[variant];

  const onYes = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await answerYes(variant);
      if (result === 'on') onOn();
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <View style={styles.wrap}>
        <Image source={COFFEE} style={styles.mascot} resizeMode="contain" />
        <Text style={styles.title}>You’re all set</Text>
        <Text style={styles.body}>
          Your brief comes in the morning and your sweep in the evening. Change any of it in
          Settings, under Notifications.
        </Text>
        <Pressable style={styles.primary} onPress={onDone} accessibilityRole="button">
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="notification-ask">
      <Image source={WAVING} style={styles.mascot} resizeMode="contain" />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {variant !== 'denied' ? (
        <Text style={styles.small}>Change any of it in Settings.</Text>
      ) : null}
      <Pressable
        style={[styles.primary, busy && styles.busy]}
        onPress={onYes}
        accessibilityRole="button"
        testID="notification-ask-yes"
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryText}>{copy.yes}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          onClose();
          void answerNotNow();
        }}
        accessibilityRole="button"
        testID="notification-ask-not-now"
      >
        <Text style={styles.secondary}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  mascot: { width: 96, height: 96, marginBottom: 8 },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 22,
    lineHeight: 28,
    color: c.deepForest,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 15.5,
    lineHeight: 23,
    color: '#4B6A50',
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 6,
  },
  small: { fontFamily: 'Inter-Regular', fontSize: 13, color: c.inkMuted, marginBottom: 6 },
  primary: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 15,
    backgroundColor: c.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 6,
  },
  busy: { opacity: 0.8 },
  primaryText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 16, color: '#FFFFFF' },
  secondary: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#4B6A50',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
});
