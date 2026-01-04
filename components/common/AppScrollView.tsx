/**
 * AppScrollView - Drop-in replacement for React Native's ScrollView
 *
 * Automatically dismisses the keyboard when the user starts scrolling.
 * All standard ScrollView props are supported and passed through.
 *
 * Usage:
 * ```tsx
 * import { AppScrollView } from '@/components/common/AppScrollView';
 *
 * // Replace:
 * <ScrollView>...</ScrollView>
 *
 * // With:
 * <AppScrollView>...</AppScrollView>
 * ```
 *
 * Defaults:
 * - keyboardShouldPersistTaps: "handled" (allows tapping buttons while keyboard is open)
 * - keyboardDismissMode: "on-drag" (dismisses keyboard when scrolling)
 * - onScrollBeginDrag: calls Keyboard.dismiss() before any custom handler
 *
 * All defaults can be overridden by passing the prop explicitly.
 */

import React, { forwardRef, useCallback } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

export interface AppScrollViewProps extends ScrollViewProps {
  /**
   * If true, skips the automatic keyboard dismiss on scroll.
   * Useful for inputs that need to stay focused while scrolling.
   */
  skipKeyboardDismiss?: boolean;
}

export const AppScrollView = forwardRef<ScrollView, AppScrollViewProps>(
  (
    {
      onScrollBeginDrag,
      keyboardShouldPersistTaps = 'handled',
      keyboardDismissMode = 'on-drag',
      skipKeyboardDismiss = false,
      ...props
    },
    ref,
  ) => {
    const handleScrollBeginDrag = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!skipKeyboardDismiss) {
          Keyboard.dismiss();
        }
        onScrollBeginDrag?.(event);
      },
      [onScrollBeginDrag, skipKeyboardDismiss],
    );

    return (
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        onScrollBeginDrag={handleScrollBeginDrag}
        {...props}
      />
    );
  },
);

AppScrollView.displayName = 'AppScrollView';

export default AppScrollView;
