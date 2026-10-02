/**
 * The one ask, over the app. One sheet, one yes: the brief, the sweep,
 * reminders and the odd note from Gremly switch on together; Settings, under
 * Notifications, is where people change any of it.
 *
 * Drawn as an overlay rather than a Modal, so it can never clash with a sheet
 * that is already open: it sits under any open modal and shows when that closes.
 * Shown at the end of a new person's first day (after the Sweep unlocks), once
 * to people already using Gremly, and after a reminder is set while
 * notifications are off.
 */
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { BRAND } from '../../design/brand';
import { useNotificationUi } from '../../lib/notifications/store';
import { answerNotNow } from '../../lib/notifications/ask';
import AskPanel from './AskPanel';

export default function NotificationAskSheet() {
  const ask = useNotificationUi((s) => s.ask);
  const hideAsk = useNotificationUi((s) => s.hideAsk);
  const askDone = useNotificationUi((s) => s.askDone);
  const [rise] = useState(() => new Animated.Value(0));

  const showing = !!ask;
  useEffect(() => {
    if (!showing) return;
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, friction: 9, tension: 70, useNativeDriver: true }).start();
  }, [showing, rise]);

  if (!ask) return null;
  const done = ask.step === 'done';
  const dismiss = () => {
    hideAsk();
    if (!done) void answerNotNow();
  };

  return (
    <View style={StyleSheet.absoluteFill} testID="notification-ask-sheet">
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: rise }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) },
            ],
          },
        ]}
      >
        <View style={styles.handle} />
        <AskPanel
          variant={ask.variant}
          step={ask.step}
          onOn={askDone}
          onClose={hideAsk}
          onDone={hideAsk}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(18,28,22,0.38)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND.colors.linenCream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: '#D8D3CA', marginBottom: 16 },
});
