import { expireOldLockIns, lockInDay } from '../storePlan';

const mockState: any = { todos: [], habits: [], removeCommitment: jest.fn() };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
  isHabitLockedIn: () => false,
}));

const todo = (id: string, extra: Record<string, unknown>) => ({
  id,
  name: id,
  archived: false,
  completed_at: null,
  commitment: true,
  ...extra,
});

describe('the day a Lock In is for', () => {
  it('is the day it was made, or the next day when the todo is due then', () => {
    expect(lockInDay('2026-10-01', null)).toBe('2026-10-01');
    expect(lockInDay('2026-10-01', '2026-10-01')).toBe('2026-10-01');
    // locked in last night for today, or moved to tomorrow at the checkpoint
    expect(lockInDay('2026-10-01', '2026-10-02')).toBe('2026-10-02');
    // the Sage deck: locked in by Thursday's plan, due Saturday
    expect(lockInDay('2026-10-01', '2026-10-03')).toBe('2026-10-01');
    expect(lockInDay('2026-10-01', '2026-09-28')).toBe('2026-10-01');
    expect(lockInDay(null, '2026-01-05')).toBe('2026-01-05');
  });
});

describe('Lock Ins last the day they were for', () => {
  beforeEach(() => {
    mockState.removeCommitment = jest.fn(async () => undefined);
  });

  it('ends a Lock In made on an earlier day, and keeps today’s', () => {
    mockState.todos = [
      // locked in on 1 October (Los Angeles), still open on the 2nd
      todo('deck', { commitment_started_at: '2026-10-01T21:04:28Z', due_day: '2026-10-03' }),
      todo('present', { commitment_started_at: '2026-10-02T15:13:53Z', due_day: '2026-10-02' }),
      // done, or not a Lock In: left alone
      todo('plumber', {
        commitment_started_at: '2026-10-01T21:04:28Z',
        completed_at: '2026-10-02T02:52:39Z',
      }),
      todo('loose', { commitment: false, commitment_started_at: '2026-09-01T10:00:00Z' }),
      // an old row with no start: its due date decides
      todo('legacy', { commitment_started_at: null, due_day: '2026-01-05' }),
      // locked in at 9pm last night for today: it holds
      todo('tonight', { commitment_started_at: '2026-10-02T04:00:00Z', due_day: '2026-10-02' }),
    ];
    expect(expireOldLockIns('2026-10-02')).toBe(2);
    expect(mockState.removeCommitment.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      'deck',
      'legacy',
    ]);
  });
});
