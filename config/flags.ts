/**
 * Feature Flags
 *
 * Central configuration for feature toggles across the app.
 *
 * Note: As of Phase H, USE_DS_UI is deprecated. DS is now the only UI implementation.
 * The flag is kept for backward compatibility with dev tools only.
 */

export const FLAGS = {
  /**
   * @deprecated Phase H: Legacy UI removed. DS is now the only implementation.
   * This flag is kept for backward compatibility with DsToggleProvider (dev tool).
   * Always returns true. Will be removed in a future phase.
   */
  USE_DS_UI: true as const,
} as const;

export type FeatureFlags = typeof FLAGS;
