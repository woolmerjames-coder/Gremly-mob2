/**
 * Feature Flags for Phase 10.6 — Mascot & Emotion Layer
 *
 * Centralized feature toggles with environment variable gating
 */

// Feature flags from environment variables
export const FLAG_CHAT = process.env.EXPO_PUBLIC_FEATURE_CHAT === 'on';
export const FLAG_MASCOT = process.env.EXPO_PUBLIC_FEATURE_MASCOT === 'on';
export const FLAG_REDUCED = process.env.EXPO_PUBLIC_REDUCED_MOTION === 'on';

// Helper functions for readable conditional logic
export const isChatEnabled = () => FLAG_CHAT;
export const isMascotEnabled = () => FLAG_MASCOT;
export const isReducedMotion = () => FLAG_REDUCED;

// Combined flags for complex conditions
export const shouldShowMascot = () => FLAG_CHAT && FLAG_MASCOT;
export const shouldAnimateMascot = () => FLAG_MASCOT && !FLAG_REDUCED;
export const shouldUseHaptics = () => !FLAG_REDUCED;

// Debug logging for development
if (__DEV__) {
  console.log('[FeatureFlags] Chat:', FLAG_CHAT);
  console.log('[FeatureFlags] Mascot:', FLAG_MASCOT);
  console.log('[FeatureFlags] Reduced Motion:', FLAG_REDUCED);
}
