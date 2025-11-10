import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useOverlayV2Draft(key: string, value: string) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      // AsyncStorage implementations in some test environments may
      // not return a Promise. Guard against that by checking for
      // a .catch function before calling it.
      try {
        const maybePromise = AsyncStorage.setItem(key, value);
        if (maybePromise && typeof (maybePromise as any).catch === 'function') {
          (maybePromise as any).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
    }, 400);
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, [key, value]);
}

export async function readOverlayV2Draft(key: string) {
  try {
    return (await AsyncStorage.getItem(key)) || '';
  } catch {
    return '';
  }
}

export async function clearOverlayV2Draft(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    void e;
  }
}
