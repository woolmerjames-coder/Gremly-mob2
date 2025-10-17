/**
 * Haptic Feedback Utilities - Phase 7
 *
 * Wrapper around expo-haptics for consistent tactile feedback.
 * Provides semantic presets for different interaction types.
 */

import * as Haptics from 'expo-haptics';

// ============================================================================
// TYPES
// ============================================================================

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';

// ============================================================================
// HAPTIC FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Trigger light haptic feedback
 * Use for: subtle interactions, hover states, minor selections
 */
export async function triggerLight(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Light feedback failed:', error);
    }
  }
}

/**
 * Trigger medium haptic feedback
 * Use for: button presses, switches, moderate interactions
 */
export async function triggerMedium(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Medium feedback failed:', error);
    }
  }
}

/**
 * Trigger heavy haptic feedback
 * Use for: major actions, deletions, important confirmations
 */
export async function triggerHeavy(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Heavy feedback failed:', error);
    }
  }
}

/**
 * Trigger success haptic feedback
 * Use for: successful submissions, completions, achievements
 */
export async function triggerSuccess(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Success feedback failed:', error);
    }
  }
}

/**
 * Trigger warning haptic feedback
 * Use for: warnings, cautions, reversible errors
 */
export async function triggerWarning(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Warning feedback failed:', error);
    }
  }
}

/**
 * Trigger error haptic feedback
 * Use for: errors, failures, invalid inputs
 */
export async function triggerError(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Error feedback failed:', error);
    }
  }
}

/**
 * Trigger selection haptic feedback
 * Use for: picker scrolling, list selections, tab changes
 */
export async function triggerSelection(): Promise<void> {
  try {
    await Haptics.selectionAsync();
  } catch (error) {
    if (__DEV__) {
      console.warn('[Haptics] Selection feedback failed:', error);
    }
  }
}

// ============================================================================
// SEMANTIC TRIGGER
// ============================================================================

/**
 * Trigger haptic feedback by type
 * @param type - Type of haptic feedback to trigger
 */
export async function triggerHaptic(type: HapticType): Promise<void> {
  switch (type) {
    case 'light':
      return triggerLight();
    case 'medium':
      return triggerMedium();
    case 'heavy':
      return triggerHeavy();
    case 'success':
      return triggerSuccess();
    case 'warning':
      return triggerWarning();
    case 'error':
      return triggerError();
    case 'selection':
      return triggerSelection();
  }
}

// ============================================================================
// COMPONENT-SPECIFIC HELPERS
// ============================================================================

/**
 * Haptic feedback for button press
 * Uses light impact for standard buttons
 */
export const buttonPress = triggerLight;

/**
 * Haptic feedback for primary button press
 * Uses medium impact for emphasized actions
 */
export const primaryButtonPress = triggerMedium;

/**
 * Haptic feedback for destructive action
 * Uses heavy impact for deletions/dangerous actions
 */
export const destructivePress = triggerHeavy;

/**
 * Haptic feedback for chip/toggle selection
 * Uses selection haptic for multi-select interfaces
 */
export const chipSelect = triggerSelection;

/**
 * Haptic feedback for form submission success
 * Uses success notification
 */
export const submitSuccess = triggerSuccess;

/**
 * Haptic feedback for form validation error
 * Uses error notification
 */
export const validationError = triggerError;

// ============================================================================
// EXPORT ALL
// ============================================================================

export const haptics = {
  trigger: triggerHaptic,
  light: triggerLight,
  medium: triggerMedium,
  heavy: triggerHeavy,
  success: triggerSuccess,
  warning: triggerWarning,
  error: triggerError,
  selection: triggerSelection,
  // Component helpers
  buttonPress,
  primaryButtonPress,
  destructivePress,
  chipSelect,
  submitSuccess,
  validationError,
};
