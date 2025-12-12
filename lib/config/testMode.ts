/**
 * Test Mode Configuration
 *
 * Controls TEST_MODE flag that enables structured test logging.
 * Can be set via environment variable or runtime override in dev.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ASYNC_STORAGE_KEY = '@gremly/test_mode_override';

// Detect development environment
declare const __DEV__: boolean;
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

// Read env var once at module load
const envTestMode = process.env.EXPO_PUBLIC_TEST_MODE === 'true';

// Runtime override state (only used in dev)
let runtimeOverride: boolean | null = null;
let initialized = false;

/**
 * Initialize test mode from AsyncStorage (call once at app start)
 * Only loads override in dev mode.
 */
export async function initTestMode(): Promise<void> {
  if (!isDev || initialized) return;

  try {
    const stored = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
    if (stored !== null) {
      runtimeOverride = stored === 'true';
    }
    initialized = true;
  } catch {
    // Ignore storage errors
    initialized = true;
  }
}

/**
 * Check if test mode is currently enabled
 * Priority: runtime override (dev only) > env var
 */
export function isTestMode(): boolean {
  if (isDev && runtimeOverride !== null) {
    return runtimeOverride;
  }
  return envTestMode;
}

/**
 * Set test mode override (dev only)
 * Pass null to clear override and use env var
 */
export async function setTestModeOverride(enabled: boolean | null): Promise<void> {
  if (!isDev) {
    console.warn('[TestMode] Runtime override only available in dev');
    return;
  }

  runtimeOverride = enabled;

  try {
    if (enabled === null) {
      await AsyncStorage.removeItem(ASYNC_STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(ASYNC_STORAGE_KEY, String(enabled));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Toggle test mode (dev only)
 * Returns the new state
 */
export async function toggleTestMode(): Promise<boolean> {
  const current = isTestMode();
  const next = !current;
  await setTestModeOverride(next);
  return next;
}

/**
 * Get current test mode state info (for debug UI)
 */
export function getTestModeInfo(): {
  enabled: boolean;
  source: 'override' | 'env' | 'default';
  isDev: boolean;
} {
  let source: 'override' | 'env' | 'default';

  if (isDev && runtimeOverride !== null) {
    source = 'override';
  } else if (envTestMode) {
    source = 'env';
  } else {
    source = 'default';
  }

  return {
    enabled: isTestMode(),
    source,
    isDev,
  };
}

// Export constants for convenience
export const TEST_MODE_ENV = envTestMode;
export const IS_DEV = isDev;
