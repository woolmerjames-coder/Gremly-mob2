/**
 * Accessibility utilities
 * Phase 9: Reduced motion support
 */

/**
 * Check if reduced motion is enabled
 * In tests, respects JEST_REDUCED_MOTION env var
 * In production, this should check OS settings (AccessibilityInfo.isReduceMotionEnabled)
 */
export const isReducedMotion = (): boolean => {
  // In test environment, respect the JEST_REDUCED_MOTION flag
  if (process.env.JEST_REDUCED_MOTION === '1') {
    return true;
  }

  // In production, we could check AccessibilityInfo.isReduceMotionEnabled()
  // For now, default to false (animations enabled)
  // TODO: Integrate with AccessibilityInfo in Phase 10
  return false;
};
