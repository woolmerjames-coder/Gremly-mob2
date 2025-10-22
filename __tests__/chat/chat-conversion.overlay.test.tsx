/**
 * Integration tests for Space Chat explicit conversion via overlay
 * Tests that chat chip/action conversions create items with correct metadata
 */

import React from 'react';

// Mock environment module first to prevent import errors
jest.mock('../../lib/env', () => ({
  getOptimisticFlag: jest.fn(() => false),
  getMinThinkMs: jest.fn(() => 1000),
  getBgTimeoutMs: jest.fn(() => 3000),
  getEnv: jest.fn(() => 'off'),
}));

// Mock cortex imports
jest.mock('../../lib/cortex/CortexClient', () => ({
  callComplete: jest.fn(),
  callClassify: jest.fn(),
}));

// Mock the design theme system to provide required colors
jest.mock('../../design/theme', () => ({
  useTheme: () => ({
    colors: {
      cream: '#FAF6F0',
      deepTeal: '#0D5F5C',
      mint: '#B7F7E1',
      periwinkle: '#E0D9FF',
      bg: { DEFAULT: '#FFFFFF' },
      text: { primary: '#000000' },
      border: { DEFAULT: '#E5E5E5' },
    },
    mode: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { renderWithProviders } from '../utils/renderWithProviders';
import { fireEvent, waitFor } from '@testing-library/react-native';

// Mock repo with create method
const mockCreate = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
  }),
}));

// Mock auth provider
jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    userId: 'test-user',
  }),
}));

// Mock cortex provider
jest.mock('../../providers/CortexProvider', () => ({
  useCortex: () => ({
    isAvailable: false, // Disable cortex to avoid API calls
  }),
}));

// Mock theme provider
jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'light',
  }),
}));

describe('Space Chat explicit conversion via overlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'test-item-123', type: 'todo' });
  });

  it('creates todo with origin=space_chat and ai_placed=false', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();

    const { getByTestId, getByText } = renderWithProviders(
      <UnifiedCreateOverlay
        visible={true}
        mode="create"
        initialEntity={{ type: 'todo', id: undefined, subtype: null }}
        initialSpaceId="space_123"
        conversionMeta={{
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'travel planning',
          source_message_id: 'msg_999',
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Fill out the todo form
    const nameInput = getByTestId('todo-name-input');
    fireEvent.changeText(nameInput, 'Book hotel');

    // Submit the form
    const saveButton = getByText('Save');
    fireEvent.press(saveButton);

    // Wait for the create call
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          name: 'Book hotel',
          space_id: 'space_123',
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'travel planning',
          source_message_id: 'msg_999',
        }),
      );
    });

    expect(onSaved).toHaveBeenCalledWith({ type: 'todo', id: 'test-item-123' });
  });

  it('creates note with chat conversion metadata', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();

    const { getByTestId, getByText } = renderWithProviders(
      <UnifiedCreateOverlay
        visible={true}
        mode="create"
        initialEntity={{ type: 'note', id: undefined, subtype: null }}
        initialSpaceId="space_456"
        conversionMeta={{
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'user idea from chat',
          source_message_id: 'msg_888',
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Fill out the note form
    const bodyInput = getByTestId('note-body-input');
    fireEvent.changeText(bodyInput, 'Remember to buy groceries');

    // Submit the form
    const saveButton = getByText('Save');
    fireEvent.press(saveButton);

    // Wait for the create call
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          body: 'Remember to buy groceries',
          space_id: 'space_456',
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'user idea from chat',
          source_message_id: 'msg_888',
        }),
      );
    });

    expect(onSaved).toHaveBeenCalledWith({ type: 'note', id: 'test-item-123' });
  });

  it('creates habit with chat conversion metadata', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();

    const { getByTestId, getByText } = renderWithProviders(
      <UnifiedCreateOverlay
        visible={true}
        mode="create"
        initialEntity={{ type: 'habit', id: undefined, subtype: null }}
        initialSpaceId={null}
        conversionMeta={{
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'daily routine suggestion',
          source_message_id: 'msg_777',
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Fill out the habit form
    const nameInput = getByTestId('habit-name-input');
    fireEvent.changeText(nameInput, 'Morning meditation');

    // Select daily frequency (should be default)
    const dailyChip = getByText('Daily');
    fireEvent.press(dailyChip);

    // Submit the form
    const saveButton = getByText('Save');
    fireEvent.press(saveButton);

    // Wait for the create call
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'habit',
          title: 'Morning meditation',
          space_id: null,
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'daily routine suggestion',
          source_message_id: 'msg_777',
        }),
      );
    });

    expect(onSaved).toHaveBeenCalledWith({ type: 'habit', id: 'test-item-123' });
  });

  it('does not create anything until overlay submit is called', () => {
    // This is more of a documentation guard: chips only open overlay.
    // Simulating that opening the overlay doesn't immediately create items
    const onClose = jest.fn();
    const onSaved = jest.fn();

    renderWithProviders(
      <UnifiedCreateOverlay
        visible={true}
        mode="create"
        initialEntity={{ type: 'todo', id: undefined, subtype: null }}
        initialSpaceId="space_123"
        conversionMeta={{
          origin: 'space_chat',
          ai_placed: false,
          why_string: 'travel planning',
          source_message_id: 'msg_999',
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Just opening the overlay should not trigger create
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('defaults to manual origin when no conversionMeta provided', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();

    const { getByTestId, getByText } = renderWithProviders(
      <UnifiedCreateOverlay
        visible={true}
        mode="create"
        initialEntity={{ type: 'todo', id: undefined, subtype: null }}
        initialSpaceId="space_123"
        // No conversionMeta provided
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Fill out the todo form
    const nameInput = getByTestId('todo-name-input');
    fireEvent.changeText(nameInput, 'Manual todo');

    // Submit the form
    const saveButton = getByText('Save');
    fireEvent.press(saveButton);

    // Wait for the create call - should default to manual
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          name: 'Manual todo',
          space_id: 'space_123',
          origin: 'manual',
          ai_placed: false,
          why_string: null,
          source_message_id: null,
        }),
      );
    });
  });
});
