/**
 * Feature Flags for Mind Drop Classification Pipeline
 *
 * These flags control the rollout of the new Mind Drop v4 classification system.
 * The new system uses:
 * - Zustand store for state management
 * - Unified useMindDropSubmit hook for all entry points
 * - Heuristic-first classification with AI fallback
 * - Two-phase enrichment (classify → enhance)
 */

/**
 * Detect development environment
 * Uses React Native's __DEV__ global when available
 */
declare const __DEV__: boolean;
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

export const FEATURE_FLAGS = {
  /**
   * Master switch for new Mind Drop pipeline (v4)
   *
   * When true:
   * - All entry points use useMindDropSubmit hook
   * - Classification uses heuristic-first approach
   * - State managed via Zustand store
   *
   * When false:
   * - Existing classification logic is used (Cortex engine)
   * - No changes to current behavior
   *
   * Rollout plan:
   * 1. false (default) - existing behavior
   * 2. true for internal testing
   * 3. true for beta users
   * 4. true for all users
   */
  MIND_DROP_V4_ENABLED: true,

  /**
   * Enable Phase 2 AI enrichment
   *
   * Phase 2 runs after initial classification to:
   * - Generate smart compact titles
   * - Extract meaningful tags
   * - Enhance entity metadata
   *
   * Only applies when MIND_DROP_V4_ENABLED is true.
   * Can be disabled independently for debugging classification-only flow.
   */
  PHASE2_ENRICHMENT_ENABLED: true,

  /**
   * Use Zustand store as source of truth for Mind Drop views
   *
   * When true:
   * - UI components read from Zustand store
   * - EventBus syncs DB changes to store
   * - Optimistic updates via pending items
   *
   * When false:
   * - UI components read directly from repo/DB
   * - Store is updated but not used for rendering
   *
   * Only applies when MIND_DROP_V4_ENABLED is true.
   * Useful for comparing store vs DB consistency.
   */
  USE_ZUSTAND_STORE: false,

  /**
   * Log heuristic vs API classification comparisons
   *
   * When enabled, logs both heuristic and API classification results
   * side by side for the same input. Useful for:
   * - Tuning heuristic weights
   * - Identifying classification disagreements
   * - Measuring heuristic accuracy
   *
   * Automatically enabled in development, disabled in production.
   */
  HEURISTIC_LOGGING_ENABLED: isDev,
} as const;

/**
 * Type for feature flag keys
 */
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Type-safe feature flag getter
 *
 * @param key - The feature flag key to retrieve
 * @returns The current value of the feature flag
 *
 * @example
 * ```ts
 * if (getFlag('MIND_DROP_V4_ENABLED')) {
 *   // Use new pipeline
 * }
 * ```
 */
export function getFlag<K extends FeatureFlagKey>(key: K): (typeof FEATURE_FLAGS)[K] {
  return FEATURE_FLAGS[key];
}

/**
 * Check if the new Mind Drop pipeline is fully enabled
 *
 * Convenience function that checks both the master switch
 * and Zustand store flag for full v4 experience.
 */
export function isMindDropV4FullyEnabled(): boolean {
  return FEATURE_FLAGS.MIND_DROP_V4_ENABLED && FEATURE_FLAGS.USE_ZUSTAND_STORE;
}
