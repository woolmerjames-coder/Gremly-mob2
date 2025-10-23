/**
 * Phase 10.9: Streak Service Tests
 * Tests streak calculation, milestone detection, and date logic
 */

import {
  getCurrentStreak,
  detectMilestoneCrossed,
  isMilestone,
  getNextMilestone,
} from '../../app/features/streaks/streakService';
import { format, subDays } from 'date-fns';

describe('streakService', () => {
  const formatDate = (date: Date): string => format(date, 'yyyy-MM-dd');
  const today = new Date();
  const todayStr = formatDate(today);

  describe('getCurrentStreak', () => {
    it('returns 0 for empty activity array', () => {
      const result = getCurrentStreak([]);
      expect(result.currentStreak).toBe(0);
      expect(result.lastActivityDate).toBeUndefined();
      expect(result.isToday).toBe(false);
    });

    it('returns 1 for activity today only', () => {
      const result = getCurrentStreak([todayStr]);
      expect(result.currentStreak).toBe(1);
      expect(result.lastActivityDate).toBe(todayStr);
      expect(result.isToday).toBe(true);
    });

    it('calculates 7-day streak ending today', () => {
      const dates = Array.from({ length: 7 }, (_, i) => formatDate(subDays(today, i)));
      const result = getCurrentStreak(dates);
      expect(result.currentStreak).toBe(7);
      expect(result.lastActivityDate).toBe(todayStr);
      expect(result.isToday).toBe(true);
    });

    it('calculates 5-day streak ending yesterday', () => {
      const dates = Array.from({ length: 5 }, (_, i) => formatDate(subDays(today, i + 1)));
      const result = getCurrentStreak(dates);
      expect(result.currentStreak).toBe(5);
      expect(result.lastActivityDate).toBe(formatDate(subDays(today, 1)));
      expect(result.isToday).toBe(false);
    });

    it('returns 0 if last activity was 2 days ago', () => {
      const twoDaysAgo = formatDate(subDays(today, 2));
      const result = getCurrentStreak([twoDaysAgo]);
      expect(result.currentStreak).toBe(0);
      expect(result.lastActivityDate).toBe(twoDaysAgo);
      expect(result.isToday).toBe(false);
    });

    it('handles gaps in activity correctly', () => {
      const dates = [
        formatDate(today),
        formatDate(subDays(today, 1)),
        formatDate(subDays(today, 2)),
        // Gap here (day 3 missing)
        formatDate(subDays(today, 4)),
        formatDate(subDays(today, 5)),
      ];
      const result = getCurrentStreak(dates);
      // Should only count the contiguous streak from today backwards (3 days)
      expect(result.currentStreak).toBe(3);
    });

    it('handles duplicate dates', () => {
      const dates = [todayStr, todayStr, todayStr];
      const result = getCurrentStreak(dates);
      expect(result.currentStreak).toBe(1);
    });

    it('handles unsorted dates', () => {
      const dates = [
        formatDate(subDays(today, 2)),
        formatDate(today),
        formatDate(subDays(today, 1)),
      ];
      const result = getCurrentStreak(dates);
      expect(result.currentStreak).toBe(3);
    });
  });

  describe('detectMilestoneCrossed', () => {
    it('returns undefined if no milestone crossed', () => {
      expect(detectMilestoneCrossed(1, 1)).toBeUndefined();
      expect(detectMilestoneCrossed(4, 5)).toBeUndefined();
      expect(detectMilestoneCrossed(8, 9)).toBeUndefined();
    });

    it('detects 3-day milestone', () => {
      expect(detectMilestoneCrossed(2, 3)).toBe(3);
    });

    it('detects 7-day milestone', () => {
      expect(detectMilestoneCrossed(6, 7)).toBe(7);
    });

    it('detects 14-day milestone', () => {
      expect(detectMilestoneCrossed(13, 14)).toBe(14);
    });

    it('detects 30-day milestone', () => {
      expect(detectMilestoneCrossed(29, 30)).toBe(30);
    });

    it('detects 90-day milestone', () => {
      expect(detectMilestoneCrossed(89, 90)).toBe(90);
    });

    it('returns first milestone crossed when jumping multiple', () => {
      // Jump from 5 to 10 (crosses 7)
      expect(detectMilestoneCrossed(5, 10)).toBe(7);
    });

    it('handles streak reset (prev > curr)', () => {
      expect(detectMilestoneCrossed(10, 1)).toBeUndefined();
    });
  });

  describe('isMilestone', () => {
    it('returns true for milestone counts', () => {
      expect(isMilestone(2)).toBe(true);
      expect(isMilestone(3)).toBe(true);
      expect(isMilestone(7)).toBe(true);
      expect(isMilestone(14)).toBe(true);
      expect(isMilestone(21)).toBe(true);
      expect(isMilestone(30)).toBe(true);
      expect(isMilestone(60)).toBe(true);
      expect(isMilestone(90)).toBe(true);
      expect(isMilestone(180)).toBe(true);
      expect(isMilestone(365)).toBe(true);
    });

    it('returns false for non-milestone counts', () => {
      expect(isMilestone(1)).toBe(false);
      expect(isMilestone(4)).toBe(false);
      expect(isMilestone(10)).toBe(false);
      expect(isMilestone(50)).toBe(false);
      expect(isMilestone(100)).toBe(false);
    });
  });

  describe('getNextMilestone', () => {
    it('returns correct next milestone', () => {
      expect(getNextMilestone(0)).toBe(2);
      expect(getNextMilestone(1)).toBe(2);
      expect(getNextMilestone(2)).toBe(3);
      expect(getNextMilestone(3)).toBe(7);
      expect(getNextMilestone(7)).toBe(14);
      expect(getNextMilestone(14)).toBe(21);
      expect(getNextMilestone(21)).toBe(30);
      expect(getNextMilestone(30)).toBe(60);
      expect(getNextMilestone(60)).toBe(90);
      expect(getNextMilestone(90)).toBe(180);
      expect(getNextMilestone(180)).toBe(365);
    });

    it('returns undefined when past all milestones', () => {
      expect(getNextMilestone(365)).toBeUndefined();
      expect(getNextMilestone(500)).toBeUndefined();
    });

    it('returns next milestone when between milestones', () => {
      expect(getNextMilestone(5)).toBe(7);
      expect(getNextMilestone(10)).toBe(14);
      expect(getNextMilestone(25)).toBe(30);
    });
  });
});
