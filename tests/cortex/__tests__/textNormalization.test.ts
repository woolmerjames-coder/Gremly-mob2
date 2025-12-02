import { buildTodoFields } from '../../../lib/cortex/textNormalization';

describe('buildTodoFields', () => {
  describe('explicitTime field', () => {
    test('date-only phrases return explicitTime: false and no dueTime', () => {
      // "today" without time
      const today = buildTodoFields('finish today');
      expect(today.explicitTime).toBe(false);
      expect(today.dueTime).toBeUndefined();
      expect(today.dueDay).toBeDefined();

      // "tomorrow" without time
      const tomorrow = buildTodoFields('buy flowers tomorrow');
      expect(tomorrow.explicitTime).toBe(false);
      expect(tomorrow.dueTime).toBeUndefined();
      expect(tomorrow.dueDay).toBeDefined();
    });

    test('explicit time phrases return explicitTime: true and dueTime', () => {
      // "today at 3pm"
      const todayAt3 = buildTodoFields('finish today at 3pm');
      expect(todayAt3.explicitTime).toBe(true);
      expect(todayAt3.dueTime).toBe('15:00');
      expect(todayAt3.dueDay).toBeDefined();

      // "tomorrow at 9am"
      const tomorrowAt9 = buildTodoFields('buy flowers tomorrow at 9am');
      expect(tomorrowAt9.explicitTime).toBe(true);
      expect(tomorrowAt9.dueTime).toBe('09:00');
      expect(tomorrowAt9.dueDay).toBeDefined();

      // "3pm" standalone
      const just3pm = buildTodoFields('call at 3pm');
      expect(just3pm.explicitTime).toBe(true);
      expect(just3pm.dueTime).toBe('15:00');
    });

    test('no date phrase returns explicitTime: false and no due fields', () => {
      const noDue = buildTodoFields('thinking out loud');
      expect(noDue.explicitTime).toBe(false);
      expect(noDue.dueTime).toBeUndefined();
      expect(noDue.dueDay).toBeUndefined();
      expect(noDue.due).toBeUndefined();
    });
  });

  describe('title extraction', () => {
    test('removes due phrases from title', () => {
      const result = buildTodoFields('finish report today');
      expect(result.title).toBe('Finish report');
      expect(result.removedDue).toBe(true);
    });

    test('keeps title when no due phrase', () => {
      const result = buildTodoFields('thinking out loud');
      expect(result.title).toBe('thinking out loud');
      expect(result.removedDue).toBe(false);
    });
  });
});
