/**
 * Test: Narrative classification prevents todo conversion
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

const mockClassifyNarrative = jest.fn();
const mockClassifyMindDrop = jest.fn();

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

describe('Mind Drop Narrative Classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('narrative journal text does NOT produce todo classification', async () => {
    const narrativeText =
      'Today was a great day. I went to the park and enjoyed the sunshine. Feeling grateful.';

    // Narrative classifier returns high narrative confidence
    mockClassifyNarrative.mockResolvedValue({
      isNarrative: true,
      confidence: 0.92,
      reasoning: 'Personal reflection, past tense',
    });

    // Mind drop classifier should classify as note (not todo)
    mockClassifyMindDrop.mockResolvedValue({
      payload: { type: 'note', subtype: 'journal' },
      confidence: 0.88,
      reasoning: 'Journal entry',
    });

    mockRepo.create.mockResolvedValue({
      id: 'note-journal-123',
      type: 'note',
      subtype: 'journal',
    });

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Submit narrative text
    fireEvent.changeText(input, narrativeText);
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Verify no timing chips appear (narrative should not be treated as todo)
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();

    // Verify no category chips for todo conversion
    expect(queryByTestId('minddrop-category-todo')).toBeNull();

    // Verify created as note, not todo
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.type).toBe('note');
  });

  it('task-oriented input with narrative false produces todo with timing chips', async () => {
    const taskText = 'Submit quarterly report by Friday';

    // Not narrative
    mockClassifyNarrative.mockResolvedValue({
      isNarrative: false,
      confidence: 0.95,
      reasoning: 'Action-oriented, future deadline',
    });

    // High confidence todo
    mockClassifyMindDrop.mockResolvedValue({
      payload: { type: 'todo', name: 'Submit quarterly report by Friday' },
      confidence: 0.91,
      reasoning: 'Clear action with deadline',
    });

    mockRepo.create.mockResolvedValue({
      id: 'todo-report-123',
      type: 'todo',
      name: 'Submit quarterly report by Friday',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, taskText);
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Verify created as todo
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.type).toBe('todo');

    // Timing chips SHOULD appear for non-urgent high-confidence todo
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();
  });

  it('low-confidence narrative offers category chips for log (not todo)', async () => {
    const ambiguousNarrative = 'Went to dentist, teeth are fine';

    // Moderate narrative signal
    mockClassifyNarrative.mockResolvedValue({
      isNarrative: true,
      confidence: 0.75,
      reasoning: 'Past tense, personal event',
    });

    // Low confidence classification
    mockClassifyMindDrop.mockResolvedValue({
      payload: { type: 'note', subtype: 'unsorted' },
      confidence: 0.4,
      reasoning: 'Ambiguous',
    });

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-dentist-123',
      type: 'note',
      subtype: 'unsorted',
      body: ambiguousNarrative,
    });

    const { getByTestId, findByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, ambiguousNarrative);
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Category chips should appear for low confidence
    const logChip = await findByTestId('minddrop-category-log', {}, { timeout: 3000 });
    expect(logChip).toBeTruthy();

    // Todo chip should also be available but narrative context suggests log
    const todoChip = await findByTestId('minddrop-category-todo');
    expect(todoChip).toBeTruthy();

    // No automatic todo timing chips
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();
  });

  it('mixed narrative with action triggers note classification', async () => {
    const mixedText = 'Had a great meeting today. I should follow up with Jane about the proposal.';

    // Contains both narrative and action - narrative wins
    mockClassifyNarrative.mockResolvedValue({
      isNarrative: true,
      confidence: 0.68,
      reasoning: 'Mixed: past tense event + future action mention',
    });

    mockClassifyMindDrop.mockResolvedValue({
      payload: { type: 'note', subtype: 'idea' },
      confidence: 0.65,
      reasoning: 'Contains action hint but primarily reflective',
    });

    mockRepo.create.mockResolvedValue({
      id: 'note-mixed-123',
      type: 'note',
      subtype: 'idea',
    });

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, mixedText);
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Should be classified as note
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.type).toBe('note');

    // No timing chips for narrative-dominant input
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();
  });

  it('pure action without narrative context produces todo', async () => {
    const pureAction = 'Email Sarah about project timeline';

    mockClassifyNarrative.mockResolvedValue({
      isNarrative: false,
      confidence: 0.97,
      reasoning: 'Imperative verb, no narrative markers',
    });

    mockClassifyMindDrop.mockResolvedValue({
      payload: { type: 'todo', name: 'Email Sarah about project timeline' },
      confidence: 0.93,
      reasoning: 'Clear action item',
    });

    mockRepo.create.mockResolvedValue({
      id: 'todo-email-123',
      type: 'todo',
      name: 'Email Sarah about project timeline',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, pureAction);
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Verify todo creation
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.type).toBe('todo');

    // Timing chips should appear
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();
  });
});
