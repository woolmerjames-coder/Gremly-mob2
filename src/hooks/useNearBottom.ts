import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const BOTTOM_THRESHOLD_PX = 200;

/**
 * Tracks whether a scrollable list is near its bottom.
 *
 * Returns an `onScroll` handler to pass into FlatList / ScrollView and
 * a boolean `isNearBottom`. State updates only when crossing the
 * threshold, so scroll-perf is not affected.
 *
 * Pair with FlatList prop `scrollEventThrottle={32}` for smooth updates.
 */
export function useNearBottom(initialValue = true) {
  const [isNearBottom, setIsNearBottom] = useState(initialValue);
  const lastValueRef = useRef(initialValue);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const near = distanceFromBottom < BOTTOM_THRESHOLD_PX;
    if (near !== lastValueRef.current) {
      lastValueRef.current = near;
      setIsNearBottom(near);
    }
  }, []);

  return { isNearBottom, onScroll };
}
