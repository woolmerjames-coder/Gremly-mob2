/**
 * RelationToast: what happened after a yes to "is this one you already have?",
 * with Undo and a close button.
 *
 * The popup shows a short tick and gets out of the way; this small toast at
 * the top then says what changed ("Moved “Vet” to Thu 1 Oct, 4:00pm", "Drop
 * archived"), with an icon for what happened, for a few seconds. Tapping the
 * words opens the item; Undo sits in its own small button beside them. One
 * host lives in the OverlayProvider, so it shows over Mind Drop and Sweep.
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
import {
  Archive,
  CalendarClock,
  CircleCheck,
  CopyCheck,
  FilePlus2,
  Flame,
  Pencil,
  Repeat,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { eventBus, type EventMap } from '../../lib/events/EventBus';

type Payload = EventMap['minddrop:relation_done'];

/** Long enough to read and reach Undo, short enough not to linger. */
export const TOAST_MS = 5000;
const AFTER_UNDO_MS = 1400;

const ICONS = {
  moved: CalendarClock,
  renamed: Pencil,
  repeat: Repeat,
  added: FilePlus2,
  done: CircleCheck,
  logged: Flame,
  kept: CopyCheck,
  removed: Archive,
} as const;

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

  const Icon = state === 'undone' ? RotateCcw : ICONS[payload.icon] || CircleCheck;
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
          <View style={styles.iconWrap}>
            <Icon size={16} color={lightTokens.colors.mossGreen} strokeWidth={2.25} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {detail ? (
              <Text style={styles.detail} numberOfLines={1}>
                {detail}
              </Text>
            ) : null}
          </View>
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
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        ) : state === 'undoing' ? (
          <ActivityIndicator size="small" color={lightTokens.colors.mossGreen} />
        ) : null}
        <Pressable
          testID="relation-toast-close"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={hide}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <X size={16} color={lightTokens.colors.subtle} />
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
    gap: 8,
    backgroundColor: lightTokens.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.12)',
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightTokens.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: lightTokens.colors.deepForest,
  },
  detail: { fontSize: 12, color: lightTokens.colors.subtle, marginTop: 1 },
  openArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  openPressed: { opacity: 0.6 },
  // Undo in its own small button, so it reads apart from the tappable words
  undo: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(191, 216, 192, 0.45)',
  },
  undoText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: lightTokens.colors.mossGreen,
  },
  close: { padding: 6 },
  pressed: { opacity: 0.6 },
});

export default RelationToast;
