/**
 * Feature Flags
 *
 * Centralized configuration for feature toggles.
 * Consider using environment variables for dynamic control.
 */

export const FLAGS = {
  /**
   * Use Design System UI components
   * When true: Uses DS-migrated components (no Tailwind)
   * When false: Falls back to legacy Tailwind components
   *
   * @deprecated Legacy support will be removed in next version
   */
  USE_DS_UI: true,

  /**
   * Enable development features
   */
  ENABLE_DEV_TOOLS: __DEV__,

  /**
   * Repository backend selection
   * 'memory' | 'supabase'
   */
  REPO_BACKEND: (process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory') as 'memory' | 'supabase',

  /**
   * Enable performance monitoring
   */
  ENABLE_PERFORMANCE_MONITORING: false,

  /**
   * Enable crash reporting
   */
  ENABLE_CRASH_REPORTING: !__DEV__,
} as const;

// Type-safe flag getter with runtime validation
export function getFlag<K extends keyof typeof FLAGS>(key: K): (typeof FLAGS)[K] {
  return FLAGS[key];
}

// Helper to check if we're using DS UI
export const isDSUI = () => FLAGS.USE_DS_UI;

// Helper to check if we're in development
export const isDev = () => FLAGS.ENABLE_DEV_TOOLS;
