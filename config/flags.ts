/**
 * Feature Flags
 *
 * Central configuration for feature toggles across the app.
 * Keep USE_DS_UI OFF by default; flip locally for DS testing.
 */

export const FLAGS = {
  /**
   * USE_DS_UI - Toggle between Design System (DS) and legacy Tailwind screens
   *
   * When true: Uses migrated DS screens (Today, Hub, Spaces, overlays)
   * When false: Uses legacy Tailwind screens (DEPRECATED - requires NativeWind)
   *
   * Default: true (DS screens - Phase F)
   * Phase F: NativeWind removed; legacy screens no longer functional
   * Override: Can be toggled at runtime in __DEV__ mode via App.tsx
   */
  USE_DS_UI: true,
} as const;

export type FeatureFlags = typeof FLAGS;
