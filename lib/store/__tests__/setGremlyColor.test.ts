/**
 * Tests for useGremlyStore.setGremlyColor
 */

const mockUpsert = jest.fn();
jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: mockUpsert,
    }),
  },
}));

// Minimal DateService mock
jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({
    today: () => '2025-12-15',
    now: () => new Date('2025-12-15T12:00:00Z'),
    nowTimestamp: () => '2025-12-15T12:00:00Z',
    getTimezone: () => 'UTC',
  }),
  createDateService: () => ({}),
  nowTimestamp: () => '2025-12-15T12:00:00Z',
}));

// We need the real store, but with Supabase mocked
import { useGremlyStore } from '../../../lib/store/useGremlyStore';

describe('setGremlyColor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    useGremlyStore.setState({ userId: 'user-1', gremlyColor: 'forest' });
  });

  it('updates gremlyColor in state', async () => {
    await useGremlyStore.getState().setGremlyColor('coral');
    expect(useGremlyStore.getState().gremlyColor).toBe('coral');
  });

  it('upserts to cortex_preferences via Supabase', async () => {
    await useGremlyStore.getState().setGremlyColor('periwinkle');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'user-1',
        gremly_color: 'periwinkle',
      }),
      { onConflict: 'owner_id' },
    );
  });

  it('does nothing if no userId', async () => {
    useGremlyStore.setState({ userId: null });
    await useGremlyStore.getState().setGremlyColor('golden');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
