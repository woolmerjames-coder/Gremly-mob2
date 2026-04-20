import {
  calculateTrainingReadiness,
  GRADUATION_THRESHOLD,
  getReadinessLabel,
  getTrainingDaysRemaining,
} from '../trainingReadiness';
import type { UserTrainingData } from '../trainingReadiness';

function makeData(overrides: Partial<UserTrainingData> = {}): UserTrainingData {
  return {
    totalDrops: 0,
    daysWithDrops: 0,
    totalSweeps: 0,
    entityTypeCount: 0,
    journalCount: 0,
    entityChatCount: 0,
    briefCount: 0,
    todosCount: 0,
    calendarConnected: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateTrainingReadiness - score calculation
// ---------------------------------------------------------------------------

describe('calculateTrainingReadiness', () => {
  describe('score calculation', () => {
    it('returns 0 for empty data', () => {
      expect(calculateTrainingReadiness(makeData())).toBe(0);
    });

    it('maxes each factor correctly', () => {
      expect(
        calculateTrainingReadiness(
          makeData({
            totalDrops: 15,
            daysWithDrops: 5,
            totalSweeps: 3,
            entityTypeCount: 3,
            journalCount: 2,
            briefCount: 1,
          }),
        ),
      ).toBe(100);
    });

    it('scales drop volume linearly', () => {
      expect(calculateTrainingReadiness(makeData({ totalDrops: 4 }))).toBe(5);
    });

    it('scales day spread linearly', () => {
      expect(calculateTrainingReadiness(makeData({ daysWithDrops: 1 }))).toBe(6);
    });

    it('scales sweep count linearly', () => {
      expect(calculateTrainingReadiness(makeData({ totalSweeps: 1 }))).toBe(8);
    });

    it('caps each factor at max', () => {
      expect(calculateTrainingReadiness(makeData({ totalDrops: 20 }))).toBe(20);
    });

    it('depth signal scales linearly, not binary', () => {
      expect(calculateTrainingReadiness(makeData({ journalCount: 1 }))).toBe(5);
      expect(calculateTrainingReadiness(makeData({ entityChatCount: 1 }))).toBe(5);
      expect(calculateTrainingReadiness(makeData({ briefCount: 1 }))).toBe(5);
      expect(calculateTrainingReadiness(makeData({ journalCount: 5 }))).toBe(15);
    });

    it('depth signal sums across sources', () => {
      const oneSource = calculateTrainingReadiness(
        makeData({ journalCount: 0, entityChatCount: 0, briefCount: 1 }),
      );
      const allSources = calculateTrainingReadiness(
        makeData({ journalCount: 1, entityChatCount: 1, briefCount: 1 }),
      );
      expect(oneSource).toBe(5);
      expect(allSources).toBe(15);
    });

    it('never exceeds 100', () => {
      expect(
        calculateTrainingReadiness(
          makeData({
            totalDrops: 100,
            daysWithDrops: 30,
            totalSweeps: 50,
            entityTypeCount: 4,
            journalCount: 10,
          }),
        ),
      ).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // Graduation paths
  // ---------------------------------------------------------------------------

  describe('graduation paths', () => {
    it('day 1 scenario: moderate drops, one day, some diversity = ~28', () => {
      const score = calculateTrainingReadiness(
        makeData({ totalDrops: 5, daysWithDrops: 1, entityTypeCount: 3, journalCount: 1 }),
      );
      expect(score).toBe(28);
      expect(score).toBeLessThan(GRADUATION_THRESHOLD);
    });

    it('graduation path: strong multi-day engagement = 85', () => {
      const score = calculateTrainingReadiness(
        makeData({
          totalDrops: 12,
          daysWithDrops: 4,
          totalSweeps: 3,
          entityTypeCount: 3,
          journalCount: 1,
          briefCount: 1,
        }),
      );
      expect(score).toBe(85);
      expect(score).toBeGreaterThanOrEqual(GRADUATION_THRESHOLD);
    });

    it('all drops in one day, no sweeps = does not graduate', () => {
      const score = calculateTrainingReadiness(makeData({ totalDrops: 10, daysWithDrops: 1 }));
      expect(score).toBe(19);
      expect(score).toBeLessThan(GRADUATION_THRESHOLD);
    });

    it('light engagement across days, not enough = does not graduate', () => {
      const score = calculateTrainingReadiness(
        makeData({ totalDrops: 5, daysWithDrops: 3, totalSweeps: 1, entityTypeCount: 1 }),
      );
      expect(score).toBe(36);
      expect(score).toBeLessThan(GRADUATION_THRESHOLD);
    });
  });
});

// ---------------------------------------------------------------------------
// getReadinessLabel
// ---------------------------------------------------------------------------

describe('getReadinessLabel', () => {
  it.each([
    [0, 'Just getting started'],
    [20, 'Just getting started'],
    [21, 'Getting to know you'],
    [40, 'Getting to know you'],
    [41, 'Learning your patterns'],
    [60, 'Learning your patterns'],
    [61, 'Almost trained'],
    [80, 'Almost trained'],
    [81, 'Nearly there'],
    [99, 'Nearly there'],
    [100, 'Ready!'],
  ])('score %i -> "%s"', (score, expected) => {
    expect(getReadinessLabel(score)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getTrainingDaysRemaining
// ---------------------------------------------------------------------------

describe('getTrainingDaysRemaining', () => {
  it('returns null when trialStartedAt is null', () => {
    expect(getTrainingDaysRemaining(null)).toBeNull();
  });

  it('returns 6 on day 1', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(getTrainingDaysRemaining(oneHourAgo)).toBe(6);
  });

  it('returns 0 when past day 7', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect(getTrainingDaysRemaining(eightDaysAgo)).toBe(0);
  });

  it('never returns negative', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(getTrainingDaysRemaining(thirtyDaysAgo)).toBe(0);
  });
});
