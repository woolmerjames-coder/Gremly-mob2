/**
 * AppFlatList - Drop-in replacement for React Native's FlatList
 *
 * Automatically dismisses the keyboard when the user starts scrolling.
 * All standard FlatList props are supported and passed through.
 *
 * Usage:
 * ```tsx
 * import { AppFlatList } from '@/components/common/AppFlatList';
 *
 * // Replace:
 * <FlatList data={items} renderItem={...} />
 *
 * // With:
 * <AppFlatList data={items} renderItem={...} />
 * ```
 *
 * Defaults:
 * - keyboardShouldPersistTaps: "handled" (allows tapping buttons while keyboard is open)
 * - keyboardDismissMode: "on-drag" (dismisses keyboard when scrolling)
 * - onScrollBeginDrag: calls Keyboard.dismiss() before any custom handler
 *
 * All defaults can be overridden by passing the prop explicitly.
 */

import React, { forwardRef, useCallback, Ref } from 'react';
import {
  FlatList,
  FlatListProps,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

export interface AppFlatListProps<T> extends FlatListProps<T> {
  /**
   * If true, skips the automatic keyboard dismiss on scroll.
   * Useful for inputs that need to stay focused while scrolling.
   */
  skipKeyboardDismiss?: boolean;
}

function AppFlatListInner<T>(
  {
    onScrollBeginDrag,
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = 'on-drag',
    skipKeyboardDismiss = false,
    ...props
  }: AppFlatListProps<T>,
  ref: Ref<FlatList<T>>,
) {
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
    <FlatList<T>
      ref={ref}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      onScrollBeginDrag={handleScrollBeginDrag}
      {...props}
    />
  );
}

// Cast to preserve generic type parameter through forwardRef
export const AppFlatList = forwardRef(AppFlatListInner) as <T>(
  props: AppFlatListProps<T> & { ref?: Ref<FlatList<T>> },
) => React.ReactElement;

// Add displayName for debugging
(AppFlatList as React.FC).displayName = 'AppFlatList';

export default AppFlatList;
