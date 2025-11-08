/**
 * Test: Urgent todos skip timing chips and get assigned to Today immediately
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

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

describe('Mind Drop Urgent Skip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-08T14:00:00')); // 2 PM
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('urgent keyword "ASAP" skips timing chips and sets due today at 17:00', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'urgent-todo-123',
      type: 'todo',
      name: 'Book doctor ASAP',
    });

    mockRepo.update.mockResolvedValue({ id: 'urgent-todo-123' });

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Submit urgent todo
    fireEvent.changeText(input, 'Book doctor ASAP');
    fireEvent(input, 'submitEditing');

    // Wait for processing
    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Timing chips should NOT appear
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();

    // Verify immediate assignment to Today at 17:00
    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'urgent-todo-123',
          patch: expect.objectContaining({
            due_date: expect.any(String),
            undefined_due: false,
          }),
        }),
      );

      // Verify time is 17:00 (5 PM) today
      const updateCall = mockRepo.update.mock.calls[0][0];
      const dueDate = new Date(updateCall.patch.due_date);
      expect(dueDate.getHours()).toBe(17);
      expect(dueDate.getMinutes()).toBe(0);

      // Verify it's today
      const today = new Date('2025-11-08T14:00:00');
      expect(dueDate.toDateString()).toBe(today.toDateString());
    });
  });

  it('detects multiple urgent keywords: urgent, now, immediately, today', async () => {
    const urgentKeywords = [
      'Call dentist urgent',
      'Submit report now',
      'Fix bug immediately',
      'Finish task today',
      'asap email client', // lowercase
    ];

    for (const text of urgentKeywords) {
      mockRepo.create.mockClear();
      mockRepo.update.mockClear();

      mockRepo.create.mockResolvedValue({
        id: `urgent-${text.substring(0, 5)}`,
        type: 'todo',
        name: text,
      });

      mockRepo.update.mockResolvedValue({ id: `urgent-${text.substring(0, 5)}` });

      const { getByTestId, queryByTestId, unmount } = render(<CatchAllNotepad />);
      const input = getByTestId('minddrop-input');

      fireEvent.changeText(input, text);
      fireEvent(input, 'submitEditing');

      await waitFor(() => {
        expect(mockRepo.update).toHaveBeenCalled();
      });

      // No timing chips should appear for any urgent keyword
      expect(queryByTestId('minddrop-timing-chips')).toBeNull();

      // Verify due date is set to today at 17:00
      const updateCall = mockRepo.update.mock.calls[0][0];
      const dueDate = new Date(updateCall.patch.due_date);
      expect(dueDate.getHours()).toBe(17);
      expect(updateCall.patch.undefined_due).toBe(false);

      unmount();
    }
  });

  it('non-urgent todos still show timing chips', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'normal-todo-123',
      type: 'todo',
      name: 'Review document',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Submit non-urgent todo (high confidence but no urgent keywords)
    fireEvent.changeText(input, 'Review document');
    fireEvent(input, 'submitEditing');

    // Timing chips SHOULD appear for non-urgent high-confidence todos
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();

    // No immediate due date update before user selection
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
