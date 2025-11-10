import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useOverlayV2Draft(key: string, value: string) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      AsyncStorage.setItem(key, value).catch(() => {});
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
