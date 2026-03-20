import {
  GAUGE_WEIGHTS,
  FED_THRESHOLD,
  FED_DAYS_PER_AGE_UP,
  TIER_DEFINITIONS,
  getTierForAge,
  getDropValue,
  calculateSweepContribution,
  WANDERING_WINDOW_DAYS,
  WANDERING_AGE_LOSS,
  TRAINING_THRESHOLDS,
  TRAINING_LEVEL_UNLOCKS,
} from '../soulDocument';

/** Sum getDropValue(i) for i = 1..count */
function sumDrops(count: number): number {
  let total = 0;
  for (let i = 1; i <= count; i++) {
    total += getDropValue(i);
  }
  return total;
}

// ============================================================
// getDropValue
// ============================================================

describe('getDropValue', () => {
  it('drops 1 through 5 each return 0.16 (DROP_BASE)', () => {
    expect(getDropValue(1)).toBe(0.16);
    expect(getDropValue(3)).toBe(0.16);
    expect(getDropValue(5)).toBe(0.16);
  });

  it('drops 6 through 10 each return 0.08 (DROP_REDUCED)', () => {
    expect(getDropValue(6)).toBe(0.08);
    expect(getDropValue(8)).toBe(0.08);
    expect(getDropValue(10)).toBe(0.08);
  });

  it('drops 11+ return 0.04 (DROP_MINIMAL)', () => {
    expect(getDropValue(11)).toBe(0.04);
    expect(getDropValue(20)).toBe(0.04);
    expect(getDropValue(100)).toBe(0.04);
  });

  it('cumulative value for 5 drops = 0.80', () => {
    expect(sumDrops(5)).toBeCloseTo(0.8, 2);
  });

  it('cumulative value for 10 drops = 1.20', () => {
    expect(sumDrops(10)).toBeCloseTo(1.2, 2);
  });

  it('cumulative value for 15 drops = 1.40', () => {
    expect(sumDrops(15)).toBeCloseTo(1.4, 2);
  });
});

// ============================================================
// calculateSweepContribution
// ============================================================

describe('calculateSweepContribution', () => {
  it('0 cards returns 0', () => {
    expect(calculateSweepContribution(0, false)).toBe(0);
    expect(calculateSweepContribution(0, true)).toBe(0);
  });

  it('1 card returns SWEEP_FLOOR (0.26)', () => {
    expect(calculateSweepContribution(1, false)).toBe(0.26);
  });

  it('7 cards returns SWEEP_FULL (0.45)', () => {
    expect(calculateSweepContribution(7, false)).toBe(0.45);
  });

  it('cards above cap return same as cap', () => {
    expect(calculateSweepContribution(10, false)).toBe(0.45);
    expect(calculateSweepContribution(20, false)).toBe(0.45);
  });

  it('interpolation between 1 and 7 cards (4 cards)', () => {
    // 0.26 + (3/6) * (0.45 - 0.26) = 0.355
    expect(calculateSweepContribution(4, false)).toBeCloseTo(0.355, 3);
  });

  it('journal bonus adds 0.20', () => {
    expect(calculateSweepContribution(1, true)).toBeCloseTo(0.46, 2);
    expect(calculateSweepContribution(7, true)).toBeCloseTo(0.65, 2);
    expect(calculateSweepContribution(4, true)).toBeCloseTo(0.555, 3);
  });

  it('negative cards returns 0', () => {
    expect(calculateSweepContribution(-1, false)).toBe(0);
  });
});

// ============================================================
// Canonical feeding paths (Soul Document v8)
// ============================================================

describe('Canonical feeding paths', () => {
  it('Typical day: 5 drops + 1 sweep (5 cards) >= fed', () => {
    const drops = sumDrops(5);
    const sweep = calculateSweepContribution(5, false);
    const total = drops + sweep;
    expect(total).toBeGreaterThanOrEqual(FED_THRESHOLD);
  });

  it('Chaotic dump day: 9 drops alone = 1.12 >= fed', () => {
    const total = sumDrops(9);
    expect(total).toBeCloseTo(1.12, 2);
    expect(total).toBeGreaterThanOrEqual(FED_THRESHOLD);
  });

  it('Reflective day: 3 drops + 1 sweep (5 cards) with journal >= fed', () => {
    const drops = sumDrops(3);
    const sweep = calculateSweepContribution(5, true);
    const total = drops + sweep;
    expect(total).toBeGreaterThanOrEqual(FED_THRESHOLD);
  });

  it('Planning day: 4 drops + Brief + 3 lock-ins = 1.04 >= fed', () => {
    const drops = sumDrops(4);
    const brief = GAUGE_WEIGHTS.BRIEF;
    const lockIn = Math.min(3, GAUGE_WEIGHTS.LOCK_IN_CAP) * GAUGE_WEIGHTS.LOCK_IN_ITEM;
    const total = drops + brief + lockIn;
    expect(total).toBeCloseTo(1.04, 2);
    expect(total).toBeGreaterThanOrEqual(FED_THRESHOLD);
  });
});

// ============================================================
// Edge cases - should NOT reach fed
// ============================================================

describe('Edge cases - should not reach fed', () => {
  it('3 spam drops = 48% (not fed)', () => {
    expect(sumDrops(3)).toBeCloseTo(0.48, 2);
    expect(sumDrops(3)).toBeLessThan(FED_THRESHOLD);
  });

  it('5 drops alone = 80% (not fed)', () => {
    expect(sumDrops(5)).toBeCloseTo(0.8, 2);
    expect(sumDrops(5)).toBeLessThan(FED_THRESHOLD);
  });

  it('Brief only = 25% (not fed)', () => {
    expect(GAUGE_WEIGHTS.BRIEF).toBe(0.25);
    expect(GAUGE_WEIGHTS.BRIEF).toBeLessThan(FED_THRESHOLD);
  });

  it('1 sweep only (7 cards, no journal) = 45% (not fed)', () => {
    const sweep = calculateSweepContribution(7, false);
    expect(sweep).toBe(0.45);
    expect(sweep).toBeLessThan(FED_THRESHOLD);
  });

  it('1 sweep with journal only = 65% (not fed)', () => {
    const sweep = calculateSweepContribution(7, true);
    expect(sweep).toBeCloseTo(0.65, 2);
    expect(sweep).toBeLessThan(FED_THRESHOLD);
  });

  it('Max space contributions only = 22% (not fed)', () => {
    const total =
      GAUGE_WEIGHTS.SPACE_ASSIGN * GAUGE_WEIGHTS.SPACE_ASSIGN_CAP +
      GAUGE_WEIGHTS.SPACE_CHAT * GAUGE_WEIGHTS.SPACE_CHAT_CAP +
      GAUGE_WEIGHTS.SPACE_CREATE;
    expect(total).toBeCloseTo(0.22, 2);
    expect(total).toBeLessThan(FED_THRESHOLD);
  });
});

// ============================================================
// getTierForAge
// ============================================================

describe('getTierForAge', () => {
  it.each([
    [0, 'Hatchling'],
    [2, 'Hatchling'],
    [3, 'Nestling'],
    [5, 'Nestling'],
    [6, 'Sprout'],
    [10, 'Explorer'],
    [15, 'Explorer'],
    [16, 'Scout'],
    [25, 'Scout'],
    [26, 'Pathfinder'],
    [41, 'Guide'],
    [61, 'Sage'],
    [121, 'Elder'],
    [251, 'Ancient'],
    [501, 'Wizard'],
    [10000, 'Wizard'],
  ])('age %i returns %s', (age, expectedTier) => {
    expect(getTierForAge(age).name).toBe(expectedTier);
  });
});

// ============================================================
// Tier boundary completeness
// ============================================================

describe('Tier boundary completeness', () => {
  it('every age from 0 to 600 maps to a tier (no gaps)', () => {
    for (let i = 0; i <= 600; i++) {
      const tier = getTierForAge(i);
      expect(tier).toBeDefined();
      expect(tier.name).toBeTruthy();
    }
  });

  it('tier transitions happen at correct boundaries', () => {
    expect(getTierForAge(2).name).not.toBe(getTierForAge(3).name);
    expect(getTierForAge(5).name).not.toBe(getTierForAge(6).name);
    expect(getTierForAge(9).name).not.toBe(getTierForAge(10).name);
    expect(getTierForAge(15).name).not.toBe(getTierForAge(16).name);
    expect(getTierForAge(25).name).not.toBe(getTierForAge(26).name);
    expect(getTierForAge(40).name).not.toBe(getTierForAge(41).name);
    expect(getTierForAge(60).name).not.toBe(getTierForAge(61).name);
    expect(getTierForAge(120).name).not.toBe(getTierForAge(121).name);
    expect(getTierForAge(250).name).not.toBe(getTierForAge(251).name);
    expect(getTierForAge(500).name).not.toBe(getTierForAge(501).name);
  });
});

// ============================================================
// Constants sanity
// ============================================================

describe('Constants sanity', () => {
  it('FED_THRESHOLD is 1.0', () => {
    expect(FED_THRESHOLD).toBe(1.0);
  });

  it('FED_DAYS_PER_AGE_UP is 3', () => {
    expect(FED_DAYS_PER_AGE_UP).toBe(3);
  });

  it('TIER_DEFINITIONS has 11 tiers', () => {
    expect(TIER_DEFINITIONS).toHaveLength(11);
  });

  it('WANDERING_WINDOW_DAYS is 3', () => {
    expect(WANDERING_WINDOW_DAYS).toBe(3);
  });

  it('WANDERING_AGE_LOSS is 1', () => {
    expect(WANDERING_AGE_LOSS).toBe(1);
  });

  it('all GAUGE_WEIGHTS values are positive numbers', () => {
    for (const [key, value] of Object.entries(GAUGE_WEIGHTS)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    }
  });

  it('LOCK_IN_CAP * LOCK_IN_ITEM = 0.15 (max lock-in contribution)', () => {
    expect(GAUGE_WEIGHTS.LOCK_IN_CAP * GAUGE_WEIGHTS.LOCK_IN_ITEM).toBeCloseTo(0.15, 2);
  });

  it('TRAINING_THRESHOLDS.DROPS is 15', () => {
    expect(TRAINING_THRESHOLDS.DROPS).toBe(15);
  });

  it('TRAINING_LEVEL_UNLOCKS.LEVEL_2_AFTER_SWEEPS is 1', () => {
    expect(TRAINING_LEVEL_UNLOCKS.LEVEL_2_AFTER_SWEEPS).toBe(1);
  });
});
