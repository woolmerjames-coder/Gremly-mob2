/**
 * Mood System - Single Source of Truth
 *
 * All mood-related constants, types, and utilities.
 * Import this everywhere moods are used.
 */

// =============================================================================
// MOOD VALUES (DB-compatible strings)
// =============================================================================

export const ENERGY_MOODS = ['great', 'good', 'okay', 'low', 'tired'] as const;

export const EMOTION_MOODS = [
  'anxious',
  'overwhelmed',
  'frustrated',
  'scattered',
  'grateful',
  'hopeful',
  'focused',
  'calm',
] as const;

export const ALL_MOODS = [...ENERGY_MOODS, ...EMOTION_MOODS] as const;

// =============================================================================
// TYPES
// =============================================================================

export type EnergyMood = (typeof ENERGY_MOODS)[number];
export type EmotionMood = (typeof EMOTION_MOODS)[number];
export type Mood = (typeof ALL_MOODS)[number];

// =============================================================================
// UI DISPLAY CONFIG
// =============================================================================

export interface MoodConfig {
  value: Mood;
  label: string;
  emoji: string;
  category: 'energy' | 'emotion';
}

export const MOOD_CONFIG: Record<Mood, MoodConfig> = {
  // Energy moods
  great: { value: 'great', label: 'Great', emoji: '🤩', category: 'energy' },
  good: { value: 'good', label: 'Good', emoji: '😊', category: 'energy' },
  okay: { value: 'okay', label: 'Okay', emoji: '😐', category: 'energy' },
  low: { value: 'low', label: 'Low', emoji: '😔', category: 'energy' },
  tired: { value: 'tired', label: 'Tired', emoji: '😴', category: 'energy' },

  // Emotion moods
  anxious: { value: 'anxious', label: 'Anxious', emoji: '😰', category: 'emotion' },
  overwhelmed: { value: 'overwhelmed', label: 'Overwhelmed', emoji: '🤯', category: 'emotion' },
  frustrated: { value: 'frustrated', label: 'Frustrated', emoji: '😤', category: 'emotion' },
  scattered: { value: 'scattered', label: 'Scattered', emoji: '🌀', category: 'emotion' },
  grateful: { value: 'grateful', label: 'Grateful', emoji: '🙏', category: 'emotion' },
  hopeful: { value: 'hopeful', label: 'Hopeful', emoji: '✨', category: 'emotion' },
  focused: { value: 'focused', label: 'Focused', emoji: '🎯', category: 'emotion' },
  calm: { value: 'calm', label: 'Calm', emoji: '😌', category: 'emotion' },
};

// =============================================================================
// UI HELPERS
// =============================================================================

/** Get display label for a mood */
export function getMoodLabel(mood: Mood): string {
  return MOOD_CONFIG[mood]?.label ?? mood;
}

/** Get emoji for a mood */
export function getMoodEmoji(mood: Mood): string {
  return MOOD_CONFIG[mood]?.emoji ?? '';
}

/** Check if a string is a valid mood */
export function isValidMood(value: string): value is Mood {
  return ALL_MOODS.includes(value as Mood);
}

/** Filter to only valid moods (for AI extraction) */
export function filterValidMoods(values: string[]): Mood[] {
  return values.filter(isValidMood);
}

/** Get moods grouped by category for UI */
export function getMoodsByCategory(): { energy: MoodConfig[]; emotion: MoodConfig[] } {
  return {
    energy: ENERGY_MOODS.map((m) => MOOD_CONFIG[m]),
    emotion: EMOTION_MOODS.map((m) => MOOD_CONFIG[m]),
  };
}

// =============================================================================
// LEGACY MIGRATION (for existing DB data)
// =============================================================================

const LEGACY_MOOD_MAP: Record<string, Mood> = {
  ecstatic: 'great',
  happy: 'good',
  neutral: 'okay',
  sad: 'low',
  // 'low' and 'tired' map to themselves
  low: 'low',
  tired: 'tired',
  // rough was vague, map to frustrated
  rough: 'frustrated',
};

/** Convert legacy mood value to new system */
export function migrateLegacyMood(legacy: string): Mood | null {
  if (isValidMood(legacy)) return legacy;
  return LEGACY_MOOD_MAP[legacy] ?? null;
}
