// ============================================================
// Soul Document v8 - Single source of truth for Gremly systems
// ============================================================

// ------------------------------------------------------------
// Gauge Weights
// ------------------------------------------------------------

/**
 * Locked gauge contribution weights for all feeding actions.
 * Source: Soul Document v8
 */
export const GAUGE_WEIGHTS = {
  /** Drops 1-5: 16% each */
  DROP_BASE: 0.16,
  /** Drops 6-10: 8% each */
  DROP_REDUCED: 0.08,
  /** Drops 11+: 4% each */
  DROP_MINIMAL: 0.04,
  /** 1 card swept minimum: 26% */
  SWEEP_FLOOR: 0.26,
  /** 7+ cards swept: 45% */
  SWEEP_FULL: 0.45,
  /** Cards above this count don't increase sweep value */
  SWEEP_CAP_CARDS: 7,
  /** Journaling during sweep: +20% */
  JOURNAL_BONUS: 0.2,
  /** Completing Morning Brief: 25% */
  BRIEF: 0.25,
  /** Per item locked in: 5% */
  LOCK_IN_ITEM: 0.05,
  /** Max 3 locked-in items count toward gauge */
  LOCK_IN_CAP: 3,
  /** Manually assigning entity to space: 3% */
  SPACE_ASSIGN: 0.03,
  /** Max 3 space assignments per day */
  SPACE_ASSIGN_CAP: 3,
  /** Space/entity chat conversation: 4% */
  SPACE_CHAT: 0.04,
  /** Max 2 space chats per day */
  SPACE_CHAT_CAP: 2,
  /** Creating a space: 5% (one-time daily) */
  SPACE_CREATE: 0.05,
} as const;

// ------------------------------------------------------------
// Core Thresholds
// ------------------------------------------------------------

/** 100% gauge = fed for the day. Source: Soul Document v8 */
export const FED_THRESHOLD = 1.0;

/** 3 fed days (non-consecutive) = 1 age up. Source: Soul Document v8 */
export const FED_DAYS_PER_AGE_UP = 3;

// ------------------------------------------------------------
// Tier Definitions
// ------------------------------------------------------------

/**
 * The 11 Gremly life-stage tiers, from Hatchling to Wizard.
 * Each tier maps an age range to a personality description.
 * Source: Soul Document v8
 */
export const TIER_DEFINITIONS = [
  {
    name: 'Hatchling',
    minAge: 0,
    maxAge: 2,
    personality: 'Barely verbal. Pure reaction. Wide-eyed.',
  },
  { name: 'Nestling', minAge: 3, maxAge: 5, personality: 'Finding words. Simple excitement.' },
  { name: 'Sprout', minAge: 6, maxAge: 9, personality: 'Curious. Starting to show personality.' },
  {
    name: 'Explorer',
    minAge: 10,
    maxAge: 15,
    personality: 'Adventurous. Wants to try everything.',
  },
  {
    name: 'Scout',
    minAge: 16,
    maxAge: 25,
    personality: 'Capable. Grounded but playful. Confident.',
  },
  {
    name: 'Pathfinder',
    minAge: 26,
    maxAge: 40,
    personality: "Purposeful. Knows where it's going. Steady.",
  },
  { name: 'Guide', minAge: 41, maxAge: 60, personality: 'Warm leadership. Settled presence.' },
  { name: 'Sage', minAge: 61, maxAge: 120, personality: 'Warm, steady, occasionally profound.' },
  { name: 'Elder', minAge: 121, maxAge: 250, personality: 'Wise and calm. Knowing.' },
  {
    name: 'Ancient',
    minAge: 251,
    maxAge: 500,
    personality: 'Deeply rare. Quiet power. Almost mythical.',
  },
  {
    name: 'Wizard',
    minAge: 501,
    maxAge: Infinity,
    personality: 'Transcendent. Lives in the Sock Palace.',
  },
] as const;

// ------------------------------------------------------------
// Tier Utility
// ------------------------------------------------------------

/**
 * Returns the tier definition for a given Gremly age.
 * Wizard (501+) is the catch-all with Infinity maxAge.
 * Source: Soul Document v8
 */
export function getTierForAge(age: number) {
  return TIER_DEFINITIONS.find((tier) => age >= tier.minAge && age <= tier.maxAge)!;
}

// ------------------------------------------------------------
// Drop Value Utility
// ------------------------------------------------------------

/**
 * Returns the gauge contribution for a single drop, using diminishing returns.
 * @param dropNumber - 1-indexed drop number for today
 * Source: Soul Document v8
 */
export function getDropValue(dropNumber: number): number {
  if (dropNumber <= 5) return GAUGE_WEIGHTS.DROP_BASE;
  if (dropNumber <= 10) return GAUGE_WEIGHTS.DROP_REDUCED;
  return GAUGE_WEIGHTS.DROP_MINIMAL;
}

// ------------------------------------------------------------
// Sweep Contribution Utility
// ------------------------------------------------------------

/**
 * Returns the total gauge contribution for a single sweep session.
 * Linearly interpolates between SWEEP_FLOOR (1 card) and SWEEP_FULL (7+ cards),
 * with an optional journal bonus.
 * Source: Soul Document v8
 */
export function calculateSweepContribution(cardsSwept: number, didJournal: boolean): number {
  if (cardsSwept <= 0) return 0;

  let base: number;
  if (cardsSwept === 1) {
    base = GAUGE_WEIGHTS.SWEEP_FLOOR;
  } else if (cardsSwept >= GAUGE_WEIGHTS.SWEEP_CAP_CARDS) {
    base = GAUGE_WEIGHTS.SWEEP_FULL;
  } else {
    // Linear interpolation: 2 cards through 6 cards
    const t = (cardsSwept - 1) / (GAUGE_WEIGHTS.SWEEP_CAP_CARDS - 1);
    base = GAUGE_WEIGHTS.SWEEP_FLOOR + t * (GAUGE_WEIGHTS.SWEEP_FULL - GAUGE_WEIGHTS.SWEEP_FLOOR);
  }

  if (didJournal) {
    base += GAUGE_WEIGHTS.JOURNAL_BONUS;
  }

  return base;
}

// ------------------------------------------------------------
// Wandering Constants
// ------------------------------------------------------------

/** 3 consecutive unfed days triggers wandering. Source: Soul Document v8 */
export const WANDERING_WINDOW_DAYS = 3;

/** Gremly loses 1 age when wandering triggers. Source: Soul Document v8 */
export const WANDERING_AGE_LOSS = 1;

// ------------------------------------------------------------
// Training Thresholds
// ------------------------------------------------------------

/**
 * Cumulative action counts required to graduate from training.
 * CALENDAR is optional, not required for graduation.
 * Source: Soul Document v8
 */
export const TRAINING_THRESHOLDS = {
  DROPS: 15,
  SWEEPS: 5,
  BRIEFS: 2,
  LOCK_INS: 2,
  JOURNALS: 3,
  ENTITY_CHAT: 1,
  SPACE: 1,
  HABITS: 2,
  /** Optional, not required for graduation */
  CALENDAR: 1,
} as const;

// ------------------------------------------------------------
// Training Level Unlocks
// ------------------------------------------------------------

/**
 * Conditions that unlock training levels 2 and 3.
 * Level 3 unlocks when either the brief OR drop condition is met.
 * Source: Soul Document v8
 */
export const TRAINING_LEVEL_UNLOCKS = {
  /** Level 2 unlocks after first completed sweep */
  LEVEL_2_AFTER_SWEEPS: 1,
  /** Level 3 unlocks after first brief */
  LEVEL_3_AFTER_BRIEFS: 1,
  /** OR Level 3 unlocks after 8+ drops */
  LEVEL_3_AFTER_DROPS: 8,
} as const;

// ------------------------------------------------------------
// AI Mode Thresholds (tuning parameters, not locked)
// ------------------------------------------------------------

/**
 * Thresholds for triggering observant AI mode based on sustained low activity.
 * These are tuning parameters and may be adjusted.
 * Source: Soul Document v8
 */
export const AI_MODE_THRESHOLDS = {
  /** 4+ weeks of low activity triggers observant mode */
  OBSERVANT_MIN_WEEKS: 4,
  /** "Low activity" = fewer than 3 drops per week */
  OBSERVANT_MAX_DROPS_PER_WEEK: 3,
  /** AND fewer than 2 sweeps per week */
  OBSERVANT_MAX_SWEEPS_PER_WEEK: 2,
} as const;

// ------------------------------------------------------------
// Sock Constants
// ------------------------------------------------------------

/** 1 free sock granted at trial start. Source: Soul Document v8 */
export const SOCK_INITIAL_GRANT = 1;

/** 1 sock granted at training graduation. Source: Soul Document v8 */
export const SOCK_GRADUATION_GRANT = 1;
