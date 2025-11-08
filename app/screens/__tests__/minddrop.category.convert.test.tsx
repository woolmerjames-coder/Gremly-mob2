/**
 * Test: Category chip conversion creates ONE todo (no duplicates)
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

describe('Mind Drop Category Chip Conversion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('converts low-confidence note to todo via category chip - ONE entry only', async () => {
    const mockUnsortedNote = {
      id: 'unsorted-123',
      type: 'note',
      body: 'Buy groceries and milk',
      labels: ['needs_review', 'unsorted'],
      created_at: new Date().toISOString(),
    };

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-123',
      type: 'note',
      body: 'Buy groceries and milk',
    });

    mockRepo.getById.mockResolvedValue(mockUnsortedNote);
    mockRepo.update.mockResolvedValue({ id: 'unsorted-123' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Submit low-confidence input
    fireEvent.changeText(input, 'Buy groceries and milk');
    fireEvent(input, 'submitEditing');

    // Wait for category chips to appear
    const todoChip = await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });
    expect(todoChip).toBeTruthy();

    // Click "Add to To-Do List"
    fireEvent.press(todoChip);

    await waitFor(() => {
      // Verify repo.update was called (in-place conversion)
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'unsorted-123',
          patch: expect.objectContaining({
            type: 'todo',
            name: 'Buy groceries and milk',
          }),
        }),
      );
    });

    // Verify NO duplicate creation
    expect(mockRepo.create).toHaveBeenCalledTimes(1); // Only the initial unsorted note
    expect(mockRepo.remove).not.toHaveBeenCalled(); // No deletion needed with repo.update

    // Verify needs_review label was removed
    const updateCall = mockRepo.update.mock.calls[0][0];
    expect(updateCall.patch.labels).not.toContain('needs_review');
  });

  it('truncates first line to 80 chars for todo name', async () => {
    const longText =
      'This is a very long first line that exceeds eighty characters and should be truncated properly\nSecond line here';
    const mockUnsortedNote = {
      id: 'unsorted-456',
      type: 'note',
      body: longText,
      labels: ['needs_review'],
    };

    mockRepo.create.mockResolvedValue({ id: 'unsorted-456' });
    mockRepo.getById.mockResolvedValue(mockUnsortedNote);
    mockRepo.update.mockResolvedValue({ id: 'unsorted-456' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, longText);
    fireEvent(input, 'submitEditing');

    const todoChip = await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });
    fireEvent.press(todoChip);

    await waitFor(() => {
      const updateCall = mockRepo.update.mock.calls[0][0];
      expect(updateCall.patch.name).toBe(longText.split('\n')[0].substring(0, 80));
      expect(updateCall.patch.name.length).toBeLessThanOrEqual(80);
    });
  });
});
