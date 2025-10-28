import { computeDuePrefill } from '../../../app/spaces/chat/duePrefill';

const FIXED = new Date('2025-10-28T10:00:00.000Z'); // Tue

describe('computeDuePrefill', () => {
  test('high-confidence explicit date -> returns dueDate', () => {
    const r = computeDuePrefill('Finish by 2025-11-03', { now: FIXED });
    expect(r.dueDate).toBeDefined();
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('medium-confidence relative -> no dueDate prefill', () => {
    const r = computeDuePrefill('buy flowers tomorrow', { now: FIXED });
    expect(r.dueDate).toBeUndefined();
    expect(r.confidence).toBeGreaterThan(0); // parsed something, but below 0.9
  });
});
