import { useEffect, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * How far something pinned to the bottom of the screen has to rise to sit on
 * top of the keyboard: the keyboard's height while it is up, nothing when it
 * is down. It moves with the keyboard on iOS.
 */
export function useKeyboardLift(): Animated.Value {
  const [lift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const move = (to: number, e?: KeyboardEvent) => {
      Animated.timing(lift, {
        toValue: to,
        duration: e?.duration && e.duration > 0 ? e.duration : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      move(e.endCoordinates.height, e),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) =>
      move(0, e),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift]);
  return lift;
}
