// ============================================================
// Soul Document v8 - TypeScript types for Gremly systems
// ============================================================

import { TIER_DEFINITIONS } from '../constants/soulDocument';

// ------------------------------------------------------------
// Tier Types
// ------------------------------------------------------------

/** All possible Gremly tier names, derived from TIER_DEFINITIONS. Source: Soul Document v8 */
export type TierName = (typeof TIER_DEFINITIONS)[number]['name'];

/** A single Gremly life-stage tier. Source: Soul Document v8 */
export interface Tier {
  name: TierName;
  minAge: number;
  maxAge: number;
  personality: string;
}

// ------------------------------------------------------------
// Feeding Gauge Types
// ------------------------------------------------------------

/** All possible sources of gauge contributions. Source: Soul Document v8 */
export type FeedingContributionSource =
  | 'drop'
  | 'sweep'
  | 'journal'
  | 'brief'
  | 'lock_in'
  | 'space_assign'
  | 'space_chat'
  | 'space_create';

/** A single gauge contribution event. Source: Soul Document v8 */
export interface FeedingContribution {
  source: FeedingContributionSource;
  /** The gauge amount, e.g. 0.16 for a drop */
  value: number;
  /** ISO datetime */
  timestamp: string;
}

/** Complete gauge state for a single day. Source: Soul Document v8 */
export interface FeedingGaugeState {
  /** 0 to 1+, current accumulated gauge value */
  value: number;
  /** Whether value >= FED_THRESHOLD */
  isFed: boolean;
  /** All contributions for the day */
  contributions: FeedingContribution[];
  /** ISO datetime of most recent contribution, or null */
  lastUpdatedAt: string | null;
}

// ------------------------------------------------------------
// AI Mode Types
// ------------------------------------------------------------

/** Gremly AI personality mode. Source: Soul Document v8 */
export type AIMode = 'encouragement' | 'insightful' | 'observant';

// ------------------------------------------------------------
// Wandering Types
// ------------------------------------------------------------

/** Tracks unfed streak for the wandering mechanic. Source: Soul Document v8 */
export interface WanderingState {
  /** Consecutive days without feeding, resets on any fed day */
  unfedStreakDays: number;
  /** ISO datetime of most recent fed day, or null */
  lastFedAt: string | null;
}

// ------------------------------------------------------------
// Sock Types
// ------------------------------------------------------------

/** Sock economy tracking. Source: Soul Document v8 */
export interface SockState {
  /** Current sock balance */
  count: number;
  /** Lifetime earned */
  earnedTotal: number;
  /** Lifetime spent */
  spentTotal: number;
}

// ------------------------------------------------------------
// Aggregate Progress State
// ------------------------------------------------------------

/**
 * The aggregate type the Zustand store holds for all feeding/aging state.
 * Combines gauge, aging, wandering, socks, training, and AI mode.
 * Source: Soul Document v8
 */
export interface GremlyProgressState {
  feedingGauge: FeedingGaugeState;
  /** 0, 1, or 2 - progress toward next age-up, resets to 0 after age-up */
  fedDaysCount: number;
  currentTier: Tier;
  wandering: WanderingState;
  sock: SockState;
  aiMode: AIMode;
}
