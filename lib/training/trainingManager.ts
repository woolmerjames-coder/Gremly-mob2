// ============================================================
// Training Manager — Core logic for the 7-Day Training Challenge
// ============================================================
//
// Pure functions. No side effects. No store dependency.
// All state mutations happen in the store layer.
//
// Source: Soul Document v8, Training Challenge Spec

import { TRAINING_THRESHOLDS, TRAINING_LEVEL_UNLOCKS } from '../constants/soulDocument';
import type {
  TrainingItemId,
  TrainingItemConfig,
  TrainingLevel,
  TrainingProgress,
  TrainingCheckResult,
  ProgressStage,
} from './trainingTypes';

// ────────────────────────────────────────────────────────────
// Training Item Definitions
// ────────────────────────────────────────────────────────────

export const TRAINING_ITEMS: TrainingItemConfig[] = [
  // Level 1 — "The Basics"
  {
    id: 'drops',
    label: 'Feed your Gremly',
    description:
      "When something's on your mind, drop it here. A task, a thought, a reminder. Gremly figures out what to do with it. The more you drop, the better it understands you.",
    threshold: TRAINING_THRESHOLDS.DROPS,
    level: 1,
    required: true,
    contextual: false,
    iconName: 'ArrowDownToLine',
    ctaLabel: "Let's go",
    navigateTo: 'MindDrop',
  },
  {
    id: 'sweeps',
    label: 'Teach Gremly to tidy',
    description:
      "At the end of the day, Sweep helps you process what you dropped. Swipe to keep, let go, or schedule. It's how Gremly learns what matters to you.",
    threshold: TRAINING_THRESHOLDS.SWEEPS,
    level: 1,
    required: true,
    contextual: false,
    iconName: 'Moon',
    ctaLabel: 'Try a sweep',
    navigateTo: 'Sweep',
  },

  // Level 2 — "Going Deeper"
  {
    id: 'briefs',
    label: 'Plan with Gremly',
    description:
      "Morning Brief sets your day. Review what's on your plate, pick your priorities, and let Gremly organize the rest.",
    threshold: TRAINING_THRESHOLDS.BRIEFS,
    level: 2,
    required: true,
    contextual: false,
    iconName: 'Coffee',
    ctaLabel: 'Plan your day',
    navigateTo: 'MorningBrief',
  },
  {
    id: 'habits',
    label: 'Build routines',
    description:
      'Habits you want to build or break. Gremly tracks them alongside everything else, no separate habit app needed.',
    threshold: TRAINING_THRESHOLDS.HABITS,
    level: 2,
    required: true,
    contextual: false,
    iconName: 'Repeat',
    ctaLabel: 'Create a habit',
    navigateTo: 'MindDrop',
  },

  // Level 3 — "The Full Picture"
  {
    id: 'entity_chat',
    label: 'Talk to Gremly',
    description:
      "Tap any item you've dropped and chat with Gremly about it. It knows the context. Think of it as talking through your thoughts with someone who was already listening.",
    threshold: TRAINING_THRESHOLDS.ENTITY_CHAT,
    level: 3,
    required: true,
    contextual: false,
    iconName: 'MessageCircle',
    ctaLabel: 'Start a chat',
    navigateTo: 'Hub',
  },
  {
    id: 'space',
    label: 'See the bigger picture',
    description:
      'Spaces are areas of your life. Work, health, a project, anything. Gremly organizes your drops into them and helps you see the big picture.',
    threshold: TRAINING_THRESHOLDS.SPACE,
    level: 3,
    required: true,
    contextual: false,
    iconName: 'FolderOpen',
    ctaLabel: 'Create a space',
    navigateTo: 'Spaces',
  },
  {
    id: 'calendar',
    label: 'Connect your calendar',
    description:
      "Give Gremly your schedule and it'll know when you're busy, when you're free, and what's coming up. Makes everything smarter.",
    threshold: TRAINING_THRESHOLDS.CALENDAR,
    level: 3,
    required: false, // Optional — not required for graduation
    contextual: false,
    iconName: 'CalendarCheck',
    ctaLabel: 'Connect',
    navigateTo: 'CalendarSettings',
  },

  // Contextual items (tracked but not on the main checklist)
  {
    id: 'journals',
    label: 'Journal entries',
    description: 'Write about what you dropped. It helps Gremly understand the deeper stuff.',
    threshold: TRAINING_THRESHOLDS.JOURNALS,
    level: 1, // Tracked from day one, prompted during sweep
    required: true,
    contextual: true,
    iconName: 'BookOpen',
    ctaLabel: 'Write in sweep',
    navigateTo: 'Sweep',
  },
  {
    id: 'lock_ins',
    label: 'Lock-in items',
    description: 'Lock in your top priorities during Morning Brief. Gremly checks in on them.',
    threshold: TRAINING_THRESHOLDS.LOCK_INS,
    level: 2, // Tracked from level 2, prompted during brief
    required: true,
    contextual: true,
    iconName: 'Lock',
    ctaLabel: 'Plan your day',
    navigateTo: 'MorningBrief',
  },
];

// ────────────────────────────────────────────────────────────
// Level Definitions
// ────────────────────────────────────────────────────────────

export const TRAINING_LEVELS: TrainingLevel[] = [
  {
    level: 1,
    title: 'The Basics',
    items: ['drops', 'sweeps'],
  },
  {
    level: 2,
    title: 'Going Deeper',
    items: ['briefs', 'habits'],
  },
  {
    level: 3,
    title: 'The Full Picture',
    items: ['entity_chat', 'space', 'calendar'],
  },
];

// ────────────────────────────────────────────────────────────
// Core Logic Functions
// ────────────────────────────────────────────────────────────

/**
 * Returns the highest training level that should be visible.
 * Level 2 unlocks after first sweep.
 * Level 3 unlocks after first brief OR 8+ total drops.
 */
export function getVisibleLevel(progress: TrainingProgress): 1 | 2 | 3 {
  if (progress.briefs >= TRAINING_LEVEL_UNLOCKS.LEVEL_3_AFTER_BRIEFS ||
      progress.drops >= TRAINING_LEVEL_UNLOCKS.LEVEL_3_AFTER_DROPS) {
    return 3;
  }
  if (progress.sweeps >= TRAINING_LEVEL_UNLOCKS.LEVEL_2_AFTER_SWEEPS) {
    return 2;
  }
  return 1;
}

/**
 * Returns the current count for a training item from the progress object.
 */
export function getItemCount(itemId: TrainingItemId, progress: TrainingProgress): number {
  switch (itemId) {
    case 'drops': return progress.drops;
    case 'sweeps': return progress.sweeps;
    case 'briefs': return progress.briefs;
    case 'habits': return progress.habits;
    case 'journals': return progress.journals;
    case 'lock_ins': return progress.lockIns;
    case 'entity_chat': return progress.entityChats;
    case 'space': return progress.spaces;
    case 'calendar': return progress.calendarConnected ? 1 : 0;
    default: return 0;
  }
}

/**
 * Returns a 0-1 fraction representing progress toward an item's threshold.
 * Clamped to 1.0 max.
 */
export function getItemFraction(itemId: TrainingItemId, progress: TrainingProgress): number {
  const config = getItemConfig(itemId);
  if (!config) return 0;
  const count = getItemCount(itemId, progress);
  return Math.min(count / config.threshold, 1);
}

/**
 * Returns a friendly progress stage for UI display.
 * Avoids showing raw numbers to prevent overwhelm.
 */
export function getProgressStage(itemId: TrainingItemId, progress: TrainingProgress): ProgressStage {
  const fraction = getItemFraction(itemId, progress);
  if (fraction >= 1) return 'complete';
  if (fraction >= 0.75) return 'almost_there';
  if (fraction >= 0.35) return 'getting_there';
  if (fraction > 0) return 'just_started';
  return 'not_started';
}

/**
 * Returns a friendly label for the current progress stage.
 */
export function getProgressLabel(stage: ProgressStage): string {
  switch (stage) {
    case 'complete': return 'Complete';
    case 'almost_there': return 'Almost there';
    case 'getting_there': return 'Getting there';
    case 'just_started': return 'Just started';
    case 'not_started': return '';
  }
}

/**
 * Returns the config for a training item by ID.
 */
export function getItemConfig(itemId: TrainingItemId): TrainingItemConfig | undefined {
  return TRAINING_ITEMS.find((item) => item.id === itemId);
}

/**
 * Returns all non-contextual items for a given level.
 */
export function getItemsForLevel(level: 1 | 2 | 3): TrainingItemConfig[] {
  return TRAINING_ITEMS.filter((item) => item.level === level && !item.contextual);
}

/**
 * Returns all contextual items (journals, lock-ins).
 */
export function getContextualItems(): TrainingItemConfig[] {
  return TRAINING_ITEMS.filter((item) => item.contextual);
}

/**
 * Returns all required item IDs (excludes calendar).
 */
export function getRequiredItemIds(): TrainingItemId[] {
  return TRAINING_ITEMS.filter((item) => item.required).map((item) => item.id);
}

/**
 * Returns the total number of required items (for "X of Y complete" display).
 */
export function getRequiredItemCount(): number {
  return getRequiredItemIds().length;
}

/**
 * Returns how many required items have been completed.
 */
export function getCompletedCount(completedItems: TrainingItemId[]): number {
  const required = getRequiredItemIds();
  return required.filter((id) => completedItems.includes(id)).length;
}

/**
 * Whether a specific item should be visible given the current level.
 * Contextual items are always "visible" for tracking but shown separately.
 */
export function isItemVisible(itemId: TrainingItemId, currentLevel: 1 | 2 | 3): boolean {
  const config = getItemConfig(itemId);
  if (!config) return false;
  if (config.contextual) return true; // Always tracked
  return config.level <= currentLevel;
}

/**
 * Check all training thresholds against current progress.
 * Returns newly completed items, level unlocks, and graduation status.
 *
 * Pure function — caller is responsible for applying state changes.
 */
export function checkTrainingProgress(
  progress: TrainingProgress,
  currentLevel: 1 | 2 | 3,
  alreadyCompleted: TrainingItemId[],
): TrainingCheckResult {
  const newlyCompleted: TrainingItemId[] = [];

  // Check each item against its threshold
  const checks: Array<[TrainingItemId, boolean]> = [
    ['drops', progress.drops >= TRAINING_THRESHOLDS.DROPS],
    ['sweeps', progress.sweeps >= TRAINING_THRESHOLDS.SWEEPS],
    ['briefs', progress.briefs >= TRAINING_THRESHOLDS.BRIEFS],
    ['habits', progress.habits >= TRAINING_THRESHOLDS.HABITS],
    ['journals', progress.journals >= TRAINING_THRESHOLDS.JOURNALS],
    ['lock_ins', progress.lockIns >= TRAINING_THRESHOLDS.LOCK_INS],
    ['entity_chat', progress.entityChats >= TRAINING_THRESHOLDS.ENTITY_CHAT],
    ['space', progress.spaces >= TRAINING_THRESHOLDS.SPACE],
  ];

  for (const [id, met] of checks) {
    if (met && !alreadyCompleted.includes(id)) {
      newlyCompleted.push(id);
    }
  }

  // Check level unlock
  const newVisibleLevel = getVisibleLevel(progress);
  const newLevel = newVisibleLevel > currentLevel ? (newVisibleLevel as 2 | 3) : null;

  // Check graduation: all required items must be complete
  const allRequired = getRequiredItemIds();
  const allCompleted = [...alreadyCompleted, ...newlyCompleted];
  const shouldGraduate = allRequired.every((id) => allCompleted.includes(id));

  return { newlyCompleted, newLevel, shouldGraduate };
}

/**
 * Returns the unlock hint text for a locked level.
 */
export function getLevelUnlockHint(level: 2 | 3): string {
  if (level === 2) {
    return 'Complete your first Evening Sweep to unlock.';
  }
  return 'Complete a Morning Brief or drop 8 thoughts to unlock.';
}

/**
 * Returns whether an item was completed before its level was visible.
 * Used for the "Nice, you found this early!" treatment.
 */
export function wasCompletedEarly(
  itemId: TrainingItemId,
  completedItems: TrainingItemId[],
  levelWhenCompleted: number,
): boolean {
  const config = getItemConfig(itemId);
  if (!config || config.contextual) return false;
  return completedItems.includes(itemId) && config.level > levelWhenCompleted;
}
