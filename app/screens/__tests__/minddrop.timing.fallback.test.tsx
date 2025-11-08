/**
 * Test: Timing chips auto-fallback to "Someday" after 5 seconds
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
  query: jest.fn(() => Promise.resolve([])),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('Mind Drop Timing Fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-08T10:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-assigns "Someday" (null due date) after 5 seconds if chips ignored', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'todo-fallback-123',
      type: 'todo',
      name: 'Review docs',
    });

    mockRepo.update.mockResolvedValue({ id: 'todo-fallback-123' });

    const { getByTestId, findByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Submit high-confidence todo
    fireEvent.changeText(input, 'Review docs');
    fireEvent(input, 'submitEditing');

    // Wait for timing chips to appear
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();

    // Advance timers by 5 seconds (auto-dismiss threshold)
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // Chips should be dismissed
    await waitFor(() => {
      expect(queryByTestId('minddrop-timing-chips')).toBeNull();
    });

    // Verify repo.update was called with "Someday" (null due date)
    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-fallback-123',
          patch: expect.objectContaining({
            due_date: null,
            undefined_due: true,
          }),
        }),
      );
    });
  });

  it('does NOT auto-fallback if user selects timing before timeout', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'todo-selected-123',
      type: 'todo',
      name: 'Important task',
    });

    mockRepo.update.mockResolvedValue({ id: 'todo-selected-123' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Important task');
    fireEvent(input, 'submitEditing');

    // Wait for timing chips
    await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    const tomorrowChip = await findByTestId('minddrop-timing-tomorrow');

    // Advance only 2 seconds (before auto-dismiss)
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // User clicks "Tomorrow" before timeout
    fireEvent.press(tomorrowChip);

    await waitFor(() => {
      // Verify Tomorrow was set (not Someday)
      const updateCall = mockRepo.update.mock.calls[0][0];
      expect(updateCall.patch.due_date).toBeTruthy(); // Should have a date
      expect(updateCall.patch.undefined_due).toBe(false);

      // Verify it's tomorrow's date at 9 AM
      const dueDate = new Date(updateCall.patch.due_date);
      expect(dueDate.getHours()).toBe(9);
    });

    // Should only be called once (for Tomorrow selection, NOT for fallback)
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });
});
