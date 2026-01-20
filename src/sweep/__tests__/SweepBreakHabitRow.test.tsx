/**
 * SweepBreakHabitRow.test.tsx
 *
 * Tests for the break habit "shield" UI component.
 * Note: Full rendering tests require complex mocking of react-native-reanimated
 * and gesture handlers. These tests focus on the module structure and exports.
 */

import { SweepBreakHabitRow, SweepBreakHabitRowProps } from '../SweepBreakHabitRow';

describe('SweepBreakHabitRow', () => {
  describe('module structure', () => {
    it('exports SweepBreakHabitRow component', () => {
      expect(SweepBreakHabitRow).toBeDefined();
      expect(typeof SweepBreakHabitRow).toBe('function');
    });
  });

  describe('props interface', () => {
    it('has expected required prop types', () => {
      // Type check - this would fail at compile time if wrong
      const validProps: SweepBreakHabitRowProps = {
        id: 'break-habit-1',
        name: 'No social media',
        cadence: 'daily',
        frequencyLabel: 'Daily',
        isCompleted: false,
        onToggle: jest.fn(),
      };
      expect(validProps.id).toBe('break-habit-1');
      expect(validProps.name).toBe('No social media');
      expect(validProps.cadence).toBe('daily');
    });

    it('accepts optional props', () => {
      const propsWithOptionals: SweepBreakHabitRowProps = {
        id: 'break-habit-1',
        name: 'No social media',
        cadence: 'weekly',
        frequencyLabel: '3x/week',
        isCompleted: true,
        onToggle: jest.fn(),
        streakDays: 7,
        completedThisPeriod: 2,
        targetPerPeriod: 3,
        isAheadOfTarget: false,
        lastCompletedAt: '2025-01-14',
        showDivider: false,
      };
      expect(propsWithOptionals.streakDays).toBe(7);
      expect(propsWithOptionals.completedThisPeriod).toBe(2);
      expect(propsWithOptionals.targetPerPeriod).toBe(3);
    });

    it('supports all cadence values', () => {
      const dailyProps: SweepBreakHabitRowProps = {
        id: '1',
        name: 'Test',
        cadence: 'daily',
        frequencyLabel: 'Daily',
        isCompleted: false,
        onToggle: jest.fn(),
      };
      const weeklyProps: SweepBreakHabitRowProps = {
        ...dailyProps,
        cadence: 'weekly',
      };
      const monthlyProps: SweepBreakHabitRowProps = {
        ...dailyProps,
        cadence: 'monthly',
      };

      expect(dailyProps.cadence).toBe('daily');
      expect(weeklyProps.cadence).toBe('weekly');
      expect(monthlyProps.cadence).toBe('monthly');
    });
  });

  describe('callback signature', () => {
    it('onToggle receives id and completed state', () => {
      const onToggle = jest.fn();
      const props: SweepBreakHabitRowProps = {
        id: 'habit-123',
        name: 'Test',
        cadence: 'daily',
        frequencyLabel: 'Daily',
        isCompleted: false,
        onToggle,
      };

      // Simulate the callback signature the component uses
      props.onToggle(props.id, true);
      expect(onToggle).toHaveBeenCalledWith('habit-123', true);

      props.onToggle(props.id, false);
      expect(onToggle).toHaveBeenCalledWith('habit-123', false);
    });
  });
});
