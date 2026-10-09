/**
 * The message at the bottom of a Worlds screen, with Undo when there is a
 * way back. Only the screen in front shows it.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  currentSnack,
  firstToAnnounce,
  hideSnack,
  onSnack,
  showFailed,
  type Snack,
} from '../../lib/worlds/snack';
import { F, W } from '../../lib/worlds/look';

export function UndoSnack({ bottom }: { bottom: number }) {
  const focused = useIsFocused();
  const [snack, setSnack] = useState<Snack | null>(currentSnack());
  const [fade] = useState(() => new Animated.Value(currentSnack() ? 1 : 0));

  useEffect(() => onSnack(setSnack), []);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: snack ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    if (snack && focused && firstToAnnounce(snack.id))
      AccessibilityInfo.announceForAccessibility(snack.text);
  }, [snack, focused, fade]);

  if (!focused || !snack) return null;

  async function undo() {
    const way = snack?.undo;
    hideSnack();
    if (!way) return;
    try {
      await way();
    } catch (err) {
      showFailed('Undo', err);
    }
  }

  return (
    <Animated.View
      style={[
        styles.snack,
        {
          bottom,
          opacity: fade,
          transform: [
            { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
      accessibilityLiveRegion="polite"
      testID="worlds-snack"
    >
      <Text style={styles.text}>{snack.text}</Text>
      {snack.undo ? (
        <Pressable
          onPress={undo}
          style={({ pressed }) => [styles.undo, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          testID="worlds-snack-undo"
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  snack: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: W.snack,
    borderRadius: 14,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
    shadowColor: '#0A140F',
    shadowOpacity: 0.28,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  text: { flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 19, color: W.snackInk },
  undo: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(244,241,234,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: { fontFamily: F.ui, fontSize: 13.5, color: W.snackInk },
});
