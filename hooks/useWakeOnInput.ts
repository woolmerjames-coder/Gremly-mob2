import { useCallback } from 'react';
import { useMascotMode } from '../contexts/MascotModeContext';

/**
 * Returns a callback that wakes the mascot on invocation.
 * Wrap your existing onChangeText with this.
 *
 * Usage:
 *   const wakeOnInput = useWakeOnInput();
 *   <TextInput onChangeText={(text) => { wakeOnInput(); setText(text); }} />
 */
export function useWakeOnInput() {
  const { resetInactivity } = useMascotMode();
  return useCallback(() => {
    resetInactivity();
  }, [resetInactivity]);
}
