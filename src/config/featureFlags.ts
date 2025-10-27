/**
 * Feature Flags Configuration
 *
 * This module centralizes feature flags for the app. Flags can be toggled via:
 * - `app.json` (Expo public config): Add `EXPO_PUBLIC_<FLAG_NAME>` under `expo.extra`.
 * - Environment variables: Define `EXPO_PUBLIC_<FLAG_NAME>` in your `.env` file.
 *
 * Example:
 * ```json
 * {
 *   "expo": {
 *     "extra": {
 *       "EXPO_PUBLIC_MIND_DROP_V2": "true"
 *     }
 *   }
 * }
 * ```
 *
 * The `MIND_DROP_V2` flag gates the new "Mind Drop v2" UI. Set it to `true` to enable v2 features.
 */

/**
 * Parses a string value as a boolean.
 * - "true" or "1" (case-insensitive) => true
 * - Any other value => false
 */
const parseBoolean = (value: string | undefined): boolean => {
  return value?.toLowerCase() === 'true' || value === '1';
};

/**
 * Feature flag for "Mind Drop v2".
 * - Enabled if `EXPO_PUBLIC_MIND_DROP_V2` is "true" or "1".
 * - Defaults to `true` if the flag is undefined.
 */
export const MIND_DROP_V2: boolean = parseBoolean(process.env.EXPO_PUBLIC_MIND_DROP_V2) ?? true;

/**
 * Centralized feature flags object.
 */
export const flags = {
  MIND_DROP_V2,
};

/**
 * Helper function to conditionally execute code based on a feature flag.
 * @param flag - The feature flag to check.
 * @param on - Function to execute if the flag is enabled.
 * @param off - Function to execute if the flag is disabled.
 * @returns The result of the `on` or `off` function.
 */
export const whenEnabled = <T>(flag: boolean, on: () => T, off: () => T): T => {
  return flag ? on() : off();
};
