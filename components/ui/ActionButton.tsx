import React, { useCallback } from 'react';
import { Pressable, type PressableProps, type GestureResponderEvent } from 'react-native';
import { useMascotMode } from '../../contexts/MascotModeContext';

/**
 * Drop-in replacement for Pressable that signals intentional user
 * interaction to the mascot lifecycle system.
 * Use for any button that represents user intent (actions, submits,
 * confirms). Do NOT use for passive UI (scroll, focus, dismiss).
 */
export function ActionButton({ onPress, ...props }: PressableProps) {
  const { resetInactivity } = useMascotMode();

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      resetInactivity();
      onPress?.(e);
    },
    [onPress, resetInactivity],
  );

  return <Pressable {...props} onPress={handlePress} />;
}
