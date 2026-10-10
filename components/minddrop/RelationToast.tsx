/**
 * RelationToast: what happened after a yes to "is this one you already have?",
 * with Undo and a close button.
 *
 * Once the card's strip has closed (or Sweep's popup has gone), this toast at
 * the top says what changed in one line ("Moved “Vet” to Thu 1 Oct, 4:00pm ·
 * Drop archived") for a few seconds. Tapping the words opens the item; Undo
 * sits in its own button beside them. Styled as the prototype's toast (Mind
 * Drop rethink stage 6): forest, linen words, radius 16. One host lives in the
 * OverlayProvider, so it shows over Mind Drop and Sweep.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Undo2, X } from 'lucide-react-native';
import { eventBus, type EventMap } from '../../lib/events/EventBus';

type Payload = EventMap['minddrop:relation_done'];

/** Long enough to read and reach Undo, short enough not to linger. */
export const TOAST_MS = 5000;
const AFTER_UNDO_MS = 1400;

const C = { forest: '#1A3328', linen: '#F9F6F1', undo: 'rgba(249,246,241,0.14)' };

type Target = NonNullable<Payload['target']>;

export function RelationToast({
  payload,
  onHide,
  onOpen,
}: {
  payload: Payload;
  onHide: () => void;
  /** tapping the words opens the item that changed */
  onOpen?: (target: Target) => void;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'shown' | 'undoing' | 'undone' | 'failed'>('shown');
  const translateY = useSharedValue(-24);
  const opacity = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  });

  const hide = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (timer.current) clearTimeout(timer.current);
    const finish = () => onHideRef.current();
    translateY.value = withTiming(-24, { duration: 180, easing: Easing.in(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 180 }, (done) => {
      if (done) runOnJS(finish)();
    });
    // shared values are stable; listing them makes the React Compiler treat them as frozen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hideAfter = useCallback(
    (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, ms);
    },
    [hide],
  );

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 220 });
    hideAfter(TOAST_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideAfter]);

  const undo = useCallback(async () => {
    if (state !== 'shown') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (timer.current) clearTimeout(timer.current);
    setState('undoing');
    try {
      await payload.undo();
      setState('undone');
    } catch {
      setState('failed');
    }
    hideAfter(AFTER_UNDO_MS);
  }, [state, payload, hideAfter]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const canOpen = state === 'shown' && !!payload.target && !!onOpen;
  const open = useCallback(() => {
    if (!payload.target || !onOpen) return;
    const target = payload.target;
    hide();
    onOpen(target);
  }, [payload.target, onOpen, hide]);

  const title =
    state === 'undone'
      ? 'Put back the way it was'
      : state === 'failed'
        ? 'Could not undo that'
        : payload.title;
  const detail = state === 'shown' || state === 'undoing' ? payload.detail : null;

  return (
    <View pointerEvents="box-none" style={[styles.container, { top: insets.top + 8 }]}>
      <Animated.View style={[styles.toast, style]} testID="relation-toast">
        {/* The icon and words: tap to open the item that changed */}
        <Pressable
          testID="relation-toast-open"
          accessibilityRole={canOpen ? 'button' : undefined}
          accessibilityLabel={canOpen ? `${title}. Open it` : undefined}
          disabled={!canOpen}
          onPress={open}
          style={({ pressed }) => [styles.openArea, pressed && canOpen && styles.openPressed]}
        >
          <Text style={styles.words} numberOfLines={3}>
            {title}
            {detail ? <Text testID="relation-toast-detail">{` · ${detail}`}</Text> : null}
          </Text>
        </Pressable>
        {state === 'shown' ? (
          <Pressable
            testID="relation-toast-undo"
            accessibilityRole="button"
            accessibilityLabel="Undo"
            onPress={undo}
            hitSlop={6}
            style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
          >
            <Undo2 size={15} strokeWidth={2.2} color={C.linen} />
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        ) : state === 'undoing' ? (
          <ActivityIndicator size="small" color={C.linen} />
        ) : null}
        <Pressable
          testID="relation-toast-close"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={hide}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <X size={16} color={C.linen} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Shows the latest toast; a new one replaces the one on screen. */
export function RelationToastHost({ onOpen }: { onOpen?: (target: Target) => void }) {
  const [current, setCurrent] = useState<{ key: number; payload: Payload } | null>(null);
  const counter = useRef(0);

  useEffect(
    () =>
      eventBus.on('minddrop:relation_done', (payload) => {
        counter.current += 1;
        setCurrent({ key: counter.current, payload });
      }),
    [],
  );

  if (!current) return null;
  return (
    <RelationToast
      key={current.key}
      payload={current.payload}
      onOpen={onOpen}
      onHide={() => setCurrent((c) => (c && c.key === current.key ? null : c))}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.forest,
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    shadowColor: '#0A140F',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  words: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: C.linen,
  },
  openArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  openPressed: { opacity: 0.7 },
  // Undo in its own button, so it reads apart from the tappable words
  undo: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.undo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  undoText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13.5,
    color: C.linen,
  },
  close: { padding: 6, opacity: 0.7 },
  pressed: { opacity: 0.6 },
});

export default RelationToast;
