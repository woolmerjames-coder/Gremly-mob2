/**
 * Unit test for SupabaseRepo.update() - Habit updates
 *
 * Verifies that update() correctly maps fields to database schema:
 * - start_date (when habit tracking begins)
 * - end_date (optional, for time-bound habits)
 * - frequency, reminders, etc.
 */

import { SupabaseRepo } from '../../lib/repo/supabase';

// Mock the Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock date-fns to avoid installation requirement
jest.mock('date-fns', () => ({
  isToday: jest.fn(),
  parseISO: jest.fn(),
}));

describe('SupabaseRepo.update - Habit payload construction', () => {
  let repo: SupabaseRepo;
  let mockUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create repo with authenticated user
    repo = new SupabaseRepo('test-user-id');

    // Mock getById to return a habit
    jest.spyOn(repo, 'getById').mockResolvedValue({
      type: 'habit',
      id: 'habit-1',
      name: 'Morning run',
      title: 'Morning run',
      notes: 'Run for 30 minutes',
      frequency: 'daily',
      completed: false,
      labels: [],
      start_date: null,
      end_date: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    } as any);

    // Mock minimal update chain: from().update().eq().select().single()
    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'habit-1',
        type: 'habit',
        name: 'Morning run',
        title: 'Morning run',
        notes: 'Run for 30 minutes',
        owner_id: 'test-user-id',
        labels: [],
        tags: [],
        tags_meta: null,
        frequency: 'daily',
        frequency_value: null,
        start_date: null,
        end_date: null,
        origin: 'catchall',
        drop_id: null,
        space_id: null,
        views: {},
        ai_placed: false,
        completed: false,
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
        subtype: 'start_habit',
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

  it('should map start_date in habit update payload', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        start_date: '2025-01-01',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: start_date is set
    expect(updatePayload.start_date).toBe('2025-01-01');
  });

  it('should map end_date in habit update payload', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        end_date: '2025-12-31',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: end_date is set
    expect(updatePayload.end_date).toBe('2025-12-31');
  });

  it('should allow clearing start_date to null', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        start_date: null,
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: start_date is explicitly null
    expect(updatePayload.start_date).toBeNull();
  });

  it('should allow clearing end_date to null', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        end_date: null,
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: end_date is explicitly null
    expect(updatePayload.end_date).toBeNull();
  });

  it('should handle both start_date and end_date together', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        start_date: '2025-01-01',
        end_date: '2025-03-31',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: both dates are set for time-bound habit
    expect(updatePayload.start_date).toBe('2025-01-01');
    expect(updatePayload.end_date).toBe('2025-03-31');
  });

  it('should sync name and title when updating name', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        name: 'Evening run',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: both name and title are set
    expect(updatePayload.name).toBe('Evening run');
    expect(updatePayload.title).toBe('Evening run');
  });

  it('should handle frequency updates', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        frequency: 'weekly',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: frequency is updated
    expect(updatePayload.frequency).toBe('weekly');
  });

  it('should handle notes updates', async () => {
    await repo.update({
      id: 'habit-1',
      patch: {
        notes: 'Run for 45 minutes with stretching',
      } as any,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];

    // Assert: notes is updated
    expect(updatePayload.notes).toBe('Run for 45 minutes with stretching');
  });
});
