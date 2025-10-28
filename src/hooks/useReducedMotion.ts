import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    try {
      const maybe = AccessibilityInfo?.isReduceMotionEnabled?.();
      // Support environments where this returns undefined or non-promise
      if (maybe && typeof (maybe as any).then === 'function') {
        (maybe as Promise<boolean>).then((v) => {
          if (mounted) setReduced(!!v);
        });
      } else if (typeof maybe === 'boolean') {
        // Defer state update to avoid setState directly within effect body
        setTimeout(() => {
          if (mounted) setReduced(!!maybe);
        }, 0);
      }
    } catch {
      // ignore
    }
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => {
      setReduced(!!v);
    });
    return () => {
      mounted = false;
      // RN v0.71+: subscription has a remove() method
      // Use optional chaining to be safe across minor RN versions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, []);

  return reduced;
}
