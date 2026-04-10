/**
 * UnifiedOverlayV2 View Mode Visual Tests
 *
 * Tests for Phase 4: View mode UI and view/edit transitions
 * Verifies:
 * 1. View mode content block renders correctly
 * 2. Edit mode content block is hidden in view mode
 * 3. Pressing Edit calls openEdit
 * 4. Delete row is not visible in view mode
 * 5. All fields are non-editable in view mode
 * 6. Header shows Edit button in view mode
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import '../../tests/overlay/__testutils__/mockUnifiedOverlayDeps';

// Mock RepoProvider
const mockGetById = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    getById: mockGetById,
    remove: jest.fn(),
    listSpaces: jest.fn(() => Promise.resolve([])),
    getAll: jest.fn(() => []),
  }),
}));

// Mock useOverlayPrefill
jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    shouldRunMindDropPrefill: false,
    suggestedTitle: null,
    suggestedTags: [],
    aiTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

// Mock OverlayContext with trackable openEdit
const mockOpenEdit = jest.fn();
const mockOpenView = jest.fn();
jest.mock('../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false, mode: 'create', record: null, spaceId: null },
    openCreate: jest.fn(),
    openEdit: mockOpenEdit,
    openView: mockOpenView,
    close: jest.fn(),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

// Mock record for view mode tests
const mockTodoRecord = {
  id: 'test-todo-123',
  type: 'todo' as const,
  name: 'Test Todo Title',
  body: 'Test todo body content with notes',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  user_id: 'test-user',
  space_id: 'test-space-id',
  due_day: '2025-01-15',
  tags: ['work', 'urgent'],
};

const mockNoteRecord = {
  id: 'test-note-456',
  type: 'note' as const,
  title: 'Test Note Title',
  body: 'This is a detailed note body with multiple sentences. It contains important information.',
  subtype: 'journal',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  user_id: 'test-user',
  space_id: null,
  tags: ['personal', 'reflection'],
};

describe('UnifiedOverlayV2 - View Mode Visual', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetById.mockResolvedValue(mockTodoRecord);
  });

  describe('View mode content rendering', () => {
    it('renders view mode content when mode is view', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      // View mode should render the title prominently
      // The title should be visible somewhere in the overlay
      expect(queryByText('Test Todo Title')).toBeTruthy();
    });

    it('hides type selector pills in view mode', () => {
      const onClose = jest.fn();
      const { queryByTestId, queryByRole } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      // Type selector tabs should not be interactable in view mode
      // The type should be shown as a badge instead
      const tabs = queryByTestId('type-selector-tabs');
      expect(tabs).toBeNull();
    });

    it('shows Edit button in header in view mode', () => {
      const onClose = jest.fn();
      const { getAllByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      // Edit button(s) should be present (header and/or footer)
      const editButtons = getAllByLabelText('Edit');
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Edit mode content is hidden in view mode', () => {
    it('does not show Save button in view mode', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      expect(queryByText('Save')).toBeNull();
    });

    it('does not show Cancel button in view mode', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      expect(queryByText('Cancel')).toBeNull();
    });

    it('does not show Delete actions in view mode', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      expect(queryByText('Delete')).toBeNull();
      expect(queryByText('Delete to-do')).toBeNull();
      expect(queryByText('Delete todo')).toBeNull();
    });
  });

  describe('Edit button interaction', () => {
    it('pressing Edit button calls openEdit with correct record', () => {
      const onClose = jest.fn();
      const { getAllByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      // Use first Edit button (footer Edit button)
      const editButtons = getAllByLabelText('Edit');
      fireEvent.press(editButtons[0]);

      expect(mockOpenEdit).toHaveBeenCalledTimes(1);
      expect(mockOpenEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          record: expect.objectContaining({ id: 'test-todo-123' }),
        }),
      );
    });
  });

  describe('Field interactivity in view mode', () => {
    it('text input is not editable in view mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockNoteRecord}
        />,
      );

      // The text input should either not be present or be non-editable
      const textInput = queryByLabelText('Overlay content input');
      if (textInput) {
        // If it exists, it should be non-editable
        expect(textInput.props.editable).toBe(false);
      }
    });
  });

  describe('Comparison with edit mode', () => {
    it('shows Save and Cancel buttons in edit mode', () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      expect(getByText('Save')).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('does not show Edit button in footer in edit mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockTodoRecord}
        />,
      );

      // In edit mode, footer should have Save/Cancel, not Edit
      // But the header might have edit icons - check specifically for the footer Edit button
      const allEditButtons = queryByLabelText('Edit');
      // In edit mode, there should be NO Edit button with the footer styling
      // The header has "Edit title" not "Edit"
      expect(allEditButtons).toBeNull();
    });

    it('shows type pill in create mode', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <UnifiedOverlayV2 visible={true} mode="create" onClose={onClose} />,
      );

      // Type pill should be visible and tappable in create mode
      expect(getByTestId('type-pill')).toBeTruthy();
    });
  });
});
