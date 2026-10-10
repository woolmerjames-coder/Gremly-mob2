/**
 * logAppEvent never fails the screen, and an event that is not saved is
 * logged rather than passed over in silence (final check item 16).
 */
const mockInsert = jest.fn();
jest.mock('../supabase/client', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
    from: () => ({ insert: (row: unknown) => mockInsert(row) }),
  },
}));
jest.mock('../date/DateService', () => ({
  getDateService: () => ({ now: () => new Date('2026-10-10T12:00:00Z') }),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

import { logAppEvent } from '../appEvents';

it('logs an insert the database refused, and resolves', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockInsert.mockResolvedValue({ error: { message: 'permission denied' } });
  await expect(logAppEvent('drop_timing', { type: 'drop', id: 'd1' }, {})).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith('[AppEvents] an event was not saved', {
    kind: 'drop_timing',
    error: 'permission denied',
  });
  warn.mockRestore();
});

it('logs a call that throws, and resolves', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockInsert.mockRejectedValue(new Error('offline'));
  await expect(
    logAppEvent('split_answer', { type: 'todo', id: 't1' }, {}),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith('[AppEvents] an event was not saved', {
    kind: 'split_answer',
    error: 'Error: offline',
  });
  warn.mockRestore();
});
