/**
 * Test suite for narrative detection guard
 * Verifies that journaling/narrative text doesn't trigger todo conversion chips
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

// Mock dependencies before imports
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findBySourceMessageId: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' } }),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn() }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const mockOverlayController = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
  },
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  openView: jest.fn(),
  close: jest.fn(),
};

const mockDecideWithContext = jest.fn();
jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({
    decideWithContext: mockDecideWithContext,
  }),
}));

const mockShowActionToast = jest.fn();
jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => mockOverlayController,
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => mockOverlayController,
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad - Narrative Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockResolvedValue({
      id: 'test-note-id',
      type: 'note',
      created_at: new Date().toISOString(),
    });
    mockRepo.findBySourceMessageId.mockResolvedValue(null);
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  });

  it('should NOT trigger todo conversion for multi-sentence narrative text', async () => {
    // Cortex returns todo classification for narrative text
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Had a great day today' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId, queryByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Multi-sentence narrative without imperative verbs or task keywords
    fireEvent.changeText(
      input,
      'Had a great day today. Met with friends and discussed interesting ideas about philosophy and life.',
    );
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        // Should NOT create a todo despite cortex saying so
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBe(0);
      },
      { timeout: 3000 },
    );
  });

  it('should trigger todo for imperative verb start even if multiple sentences', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.9,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Buy groceries' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Starts with imperative verb - should still create todo
    fireEvent.changeText(input, 'Buy groceries tomorrow. Need milk and bread.');
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('should trigger todo for text with task keywords', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.88,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'This is urgent' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'This is urgent and needs to be done ASAP. Very important task.');
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('should trigger todo for text with date/time patterns', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.87,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Meeting tomorrow' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(
      input,
      'Had a thought about the meeting tomorrow. Need to prepare some notes for it.',
    );
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('should allow narrative text with long single sentence', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.82,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Long thought' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Single sentence but >8 words average - should be classified as narrative
    fireEvent.changeText(
      input,
      'Thinking deeply about how to approach this complex philosophical question regarding consciousness and awareness',
    );
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBe(0);
      },
      { timeout: 3000 },
    );
  });

  it('should allow short action-oriented text to become todo', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.95,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Fix bug' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Short, imperative - should create todo
    fireEvent.changeText(input, 'Fix the signup bug');
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });
});
