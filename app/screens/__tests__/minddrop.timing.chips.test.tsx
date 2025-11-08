/**
 * Test: Timing chips appear for high-confidence todos and selection sets due date
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

describe('Mind Drop Timing Chips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock morning time (8 AM) for consistent timing options
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-08T08:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows timing chips after high-confidence todo creation', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'todo-123',
      type: 'todo',
      name: 'Submit report',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Submit high-confidence todo
    fireEvent.changeText(input, 'Submit report');
    fireEvent(input, 'submitEditing');

    // Wait for timing chips container to appear
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();

    // Morning timing options should include: Today, Tomorrow, Someday
    const todayChip = await findByTestId('minddrop-timing-today');
    const tomorrowChip = await findByTestId('minddrop-timing-tomorrow');
    const somedayChip = await findByTestId('minddrop-timing-someday');

    expect(todayChip).toBeTruthy();
    expect(tomorrowChip).toBeTruthy();
    expect(somedayChip).toBeTruthy();
  });

  it('sets due date when timing chip selected', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'todo-456',
      type: 'todo',
      name: 'Call dentist',
    });

    mockRepo.update.mockResolvedValue({ id: 'todo-456' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Call dentist');
    fireEvent(input, 'submitEditing');

    const todayChip = await findByTestId('minddrop-timing-today', {}, { timeout: 3000 });

    // Select "Today" timing
    fireEvent.press(todayChip);

    await waitFor(() => {
      // Verify repo.update was called with due_date
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-456',
          patch: expect.objectContaining({
            due_date: expect.any(String), // ISO date string
            undefined_due: false,
          }),
        }),
      );

      // Due date should be today at 17:00
      const updateCall = mockRepo.update.mock.calls[0][0];
      const dueDate = new Date(updateCall.patch.due_date);
      expect(dueDate.getHours()).toBe(17);
      expect(dueDate.getMinutes()).toBe(0);
    });
  });

  it('shows context-aware timing options based on time of day', async () => {
    // Test evening time (8 PM)
    jest.setSystemTime(new Date('2025-11-08T20:00:00'));

    mockRepo.create.mockResolvedValue({
      id: 'todo-789',
      type: 'todo',
      name: 'Evening task',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Evening task');
    fireEvent(input, 'submitEditing');

    await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });

    // Evening should show: Tomorrow, Today actually, Someday
    const tomorrowChip = await findByTestId('minddrop-timing-tomorrow');
    const todayActuallyChip = await findByTestId('minddrop-timing-today-actually');
    const somedayChip = await findByTestId('minddrop-timing-someday');

    expect(tomorrowChip).toBeTruthy();
    expect(todayActuallyChip).toBeTruthy();
    expect(somedayChip).toBeTruthy();
  });
});
