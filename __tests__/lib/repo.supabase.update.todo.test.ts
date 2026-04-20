/**
 * Unit test for SupabaseRepo.update() - Todo updates
 *
 * Verifies that update() correctly maps fields to database schema:
 * - details → body for todos
 * - due_at → due_date + due_time + due_day
 * - name/title kept in sync
 */

import { SupabaseRepo } from '../../lib/repo/supabase';

// Mock the Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

// Mock date-fns to avoid installation requirement
jest.mock('date-fns', () => ({
  isToday: jest.fn(),
  parseISO: jest.fn(),
}));

describe('SupabaseRepo.update - Todo payload construction', () => {
  let repo: SupabaseRepo;
  let mockUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create repo with authenticated user
    repo = new SupabaseRepo('test-user-id');

    // Mock getById to avoid complex Supabase chain mocking
    jest.spyOn(repo, 'getById').mockResolvedValue({
      type: 'todo',
      id: 'todo-1',
      name: 'Original name',
      title: 'Original name',
      body: 'Original body',
      frequency: 'once',
      completed: false,
      labels: [],
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    } as any);

    // Mock minimal update chain: from().update().eq().select().single()
    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'todo-1',
        type: 'todo',
        name: 'Updated',
        title: 'Updated',
        body: 'Updated body',
        owner_id: 'test-user-id',
        labels: [],
        tags: [],
        tags_meta: null,
        due_date: null,
        due_day: null,
        due_time: null,
        undefined_due: true,
        ai_placed: false,
        origin: 'catchall',
        drop_id: null,
        space_id: null,
        views: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');
    supabase.from = mockFrom;
  });

  it('should map details to body in update payload', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        details: 'Find somewhere great for dinner in Zipolite',
      } as any,
    });

    // Get the payload sent to update()
    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: details was mapped to body
    expect(updatePayload.body).toBe('Find somewhere great for dinner in Zipolite');
    expect(updatePayload).not.toHaveProperty('details');
  });

  it('should sync name and title when updating name', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        name: 'New name',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: both name and title are set
    expect(updatePayload.name).toBe('New name');
    expect(updatePayload.title).toBe('New name');
  });

  it('should map due_day directly from patch', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        due_day: '2024-12-15',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: due_day is set and due_date is synced
    expect(updatePayload.due_day).toBe('2024-12-15');
    expect(updatePayload.due_date).toBe('2024-12-15');
  });

  it('should compute due_day when due_date is provided', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        due_date: '2024-12-15T10:00:00.000Z',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: due_day is computed from due_date
    expect(updatePayload.due_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(updatePayload.due_date).toBeTruthy();
  });

  it('should clear due_day when due_day is set to null', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        due_day: null,
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: both due_day and due_date are null
    expect(updatePayload.due_day).toBeNull();
    expect(updatePayload.due_date).toBeNull();
  });

  it('should handle body updates directly', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        body: 'Directly updated body',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: body is updated
    expect(updatePayload.body).toBe('Directly updated body');
  });

  it('should handle due_time updates', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        due_time: '14:30',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: due_time is updated
    expect(updatePayload.due_time).toBe('14:30');
  });

  it('should map time_estimate_minutes in update payload', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        time_estimate_minutes: 30,
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: time_estimate_minutes is set
    expect(updatePayload.time_estimate_minutes).toBe(30);
  });

  it('should allow clearing time_estimate_minutes to null', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        time_estimate_minutes: null,
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: time_estimate_minutes is explicitly null
    expect(updatePayload.time_estimate_minutes).toBeNull();
  });
});
