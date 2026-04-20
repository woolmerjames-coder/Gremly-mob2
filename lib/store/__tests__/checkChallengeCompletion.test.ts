/**
 * Tests for checkChallengeCompletionOnFedFlip store action.
 *
 * Covers: no-op when missing userId/challengeStartedAt/already completed,
 * count < 7 = no completion, count >= 7 triggers completion + persistence.
 */

let mockCountResult: { count: number | null; error: unknown } = { count: 0, error: null };
let mockUpdateResult: { error: unknown } = { error: null };

jest.mock('../../../lib/supabase/client', () => {
  // Use a real object (not jest.fn) so resetMocks doesn't destroy the implementation
  const supabase = {
    from(table: string) {
      if (table === 'daily_ritual_progress') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gte() {
                        return Promise.resolve(mockCountResult);
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'cortex_preferences') {
        return {
          update() {
            return {
              eq() {
                return Promise.resolve(mockUpdateResult);
              },
            };
          },
        };
      }
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        upsert() {
          return Promise.resolve({ error: null });
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    auth: {
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession() {
        return Promise.resolve({ data: { session: null } });
      },
    },
  };
  return { supabase };
});

jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({
    now: () => new Date('2026-04-15T12:00:00Z'),
    today: () => '2026-04-15',
    getHour: () => 12,
  }),
  createDateService: () => ({}),
  nowTimestamp: () => '2026-04-15T12:00:00.000Z',
  dateService: {
    now: () => new Date('2026-04-15T12:00:00Z'),
    today: () => '2026-04-15',
    toLocalDate: () => '2026-04-15',
    getHour: () => 12,
  },
}));

jest.mock('../../../lib/env', () => ({
  env: { cortexUrl: '' },
  getEnv: jest.fn(),
}));

import { useGremlyStore } from '../../../lib/store/useGremlyStore';

describe('checkChallengeCompletionOnFedFlip', () => {
  beforeEach(() => {
    mockCountResult = { count: 0, error: null };
    mockUpdateResult = { error: null };
    useGremlyStore.setState({
      userId: 'user-123',
      challengeStartedAt: '2026-04-08T12:00:00Z',
      challengeCompletedAt: null,
    });
  });

  it('no-ops when userId is missing', async () => {
    useGremlyStore.setState({ userId: null });
    await useGremlyStore.getState().checkChallengeCompletionOnFedFlip();
    // No crash, no state change
    expect(useGremlyStore.getState().challengeCompletedAt).toBeNull();
  });

  it('no-ops when challengeStartedAt is null', async () => {
    useGremlyStore.setState({ challengeStartedAt: null });
    await useGremlyStore.getState().checkChallengeCompletionOnFedFlip();
    expect(useGremlyStore.getState().challengeCompletedAt).toBeNull();
  });

  it('no-ops when already completed', async () => {
    useGremlyStore.setState({ challengeCompletedAt: '2026-04-12T00:00:00Z' });
    await useGremlyStore.getState().checkChallengeCompletionOnFedFlip();
    // Should remain at original timestamp
    expect(useGremlyStore.getState().challengeCompletedAt).toBe('2026-04-12T00:00:00Z');
  });

  it('does not complete when fed day count < 7', async () => {
    mockCountResult = { count: 5, error: null };

    await useGremlyStore.getState().checkChallengeCompletionOnFedFlip();
    expect(useGremlyStore.getState().challengeCompletedAt).toBeNull();
  });

  it('completes challenge when fed day count >= 7', async () => {
    mockCountResult = { count: 7, error: null };

    await useGremlyStore.getState().checkChallengeCompletionOnFedFlip();
    expect(useGremlyStore.getState().challengeCompletedAt).not.toBeNull();
  });

  it('handles supabase count query error gracefully', async () => {
    mockCountResult = { count: null, error: { message: 'DB error' } };

    await useGremlyStore.getState().checkChallengeCompletionOnFedFlip();
    expect(useGremlyStore.getState().challengeCompletedAt).toBeNull();
  });
});
