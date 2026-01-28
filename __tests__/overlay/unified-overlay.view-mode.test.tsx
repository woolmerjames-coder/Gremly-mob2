/**
 * UnifiedOverlayV2 View Mode Tests
 *
 * Tests that view mode (mode='view') properly:
 * 1. Hides Save/Update button
 * 2. Hides destructive actions (Delete)
 * 3. Shows Edit button
 * 4. Makes fields non-editable
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import '../../tests/overlay/__testutils__/mockUnifiedOverlayDeps';

// Mock openEdit function that we can track
const mockOpenEdit = jest.fn();

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

// Mock OverlayContext
jest.mock('../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false, mode: 'create', record: null, spaceId: null },
    openCreate: jest.fn(),
    openEdit: mockOpenEdit,
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

// Mock record for view mode tests
const mockRecord = {
  id: 'test-note-123',
  type: 'note' as const,
  title: 'Test Note Title',
  body: 'Test note body content',
  subtype: 'catchall',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  user_id: 'test-user',
  space_id: null,
  tags: ['test-tag'],
};

describe('UnifiedOverlayV2 - View Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetById.mockResolvedValue(mockRecord);
    mockOpenEdit.mockClear();
  });

  describe('Footer buttons in view mode', () => {
    it('hides Save button in view mode', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Save button should NOT be rendered in view mode
      expect(queryByText('Save')).toBeNull();
    });

    it('shows Edit button in view mode', () => {
      const onClose = jest.fn();
      const { getAllByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Edit button SHOULD be rendered in view mode (there are two: header and footer)
      const editButtons = getAllByLabelText('Edit');
      expect(editButtons.length).toBeGreaterThan(0);
    });

    it('hides Cancel button in view mode', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Cancel button should NOT be rendered in view mode
      expect(queryByText('Cancel')).toBeNull();
    });
  });

  describe('Destructive actions in view mode', () => {
    it('hides Delete button in view mode', () => {
      const onClose = jest.fn();
      const { queryByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Delete button should NOT be rendered in view mode
      expect(queryByText('Delete')).toBeNull();
      expect(queryByText('Delete log')).toBeNull();
      expect(queryByText('Delete to-do')).toBeNull();
      expect(queryByText('Delete habit')).toBeNull();
    });
  });

  describe('Comparison with edit mode', () => {
    it('shows Save button in edit mode', () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Save button SHOULD be rendered in edit mode
      expect(getByText('Save')).toBeTruthy();
    });

    it('shows Cancel button in edit mode', () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Cancel button SHOULD be rendered in edit mode
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('does not show Edit button in edit mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Edit button should NOT be rendered in edit mode (already editing)
      // Using queryByLabelText because the button has accessibilityLabel="Edit"
      expect(queryByLabelText('Edit')).toBeNull();
    });
  });

  describe('Field interactivity in view mode', () => {
    it('view mode renders body content as non-editable Text instead of TextInput', () => {
      const onClose = jest.fn();
      const { getByText, queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // In view mode, the body should be rendered as Text, not TextInput
      // The body content should be visible
      expect(getByText('Test note body content')).toBeTruthy();

      // There should be no editable input with the overlay content label
      expect(queryByLabelText('Overlay content input')).toBeNull();
    });

    it('view mode renders title as non-editable Text', () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // In view mode, the title should be rendered as Text
      expect(getByText('Test Note Title')).toBeTruthy();
    });

    it('Reminder selector is disabled in view mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // The reminders row should be disabled in view mode
      const remindersRow = queryByLabelText('Reminders');
      if (remindersRow) {
        // If it exists, it should be disabled
        expect(remindersRow.props.disabled).toBe(true);
      }
    });

    it('Space selector is disabled in view mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // The space selector row should be disabled in view mode
      const spaceRow = queryByLabelText('Add to Space');
      if (spaceRow) {
        // If it exists, it should be disabled
        expect(spaceRow.props.disabled).toBe(true);
      }
    });

    it('mood selector buttons are disabled in view mode', () => {
      // Use a journal log entity which shows mood selector
      const journalRecord = {
        ...mockRecord,
        subtype: 'journal',
      };
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={journalRecord}
        />,
      );

      // Mood buttons should be disabled in view mode
      const happyButton = queryByLabelText('Set mood to happy');
      const neutralButton = queryByLabelText('Set mood to neutral');
      const sadButton = queryByLabelText('Set mood to sad');

      if (happyButton) expect(happyButton.props.disabled).toBe(true);
      if (neutralButton) expect(neutralButton.props.disabled).toBe(true);
      if (sadButton) expect(sadButton.props.disabled).toBe(true);
    });
  });

  describe('Edit button behavior', () => {
    it('Edit button calls openEdit with correct record and spaceId when pressed', () => {
      const onClose = jest.fn();
      const testSpaceId = 'test-space-456';

      const { getAllByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
          initialSpaceId={testSpaceId}
        />,
      );

      // Find and press the Edit button (use first one - footer Edit button)
      const editButtons = getAllByLabelText('Edit');
      fireEvent.press(editButtons[0]);

      // Assert openEdit was called once
      expect(mockOpenEdit).toHaveBeenCalledTimes(1);

      // Assert openEdit was called with the correct arguments
      expect(mockOpenEdit).toHaveBeenCalledWith({
        record: mockRecord,
        spaceId: testSpaceId,
      });
    });
  });

  describe('Close button in view mode', () => {
    it('renders Close button in view mode', () => {
      const onClose = jest.fn();
      const { getByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Close button SHOULD be rendered in view mode
      expect(getByLabelText('Close')).toBeTruthy();
    });

    it('Close button calls onClose when pressed', () => {
      const onClose = jest.fn();
      const { getByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Find and press the Close button
      const closeButton = getByLabelText('Close');
      fireEvent.press(closeButton);

      // Assert onClose was called
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not render Close button in edit mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Close button should NOT be rendered in edit mode
      expect(queryByLabelText('Close')).toBeNull();
    });

    it('does not render Close button in create mode', () => {
      const onClose = jest.fn();
      const { queryByLabelText } = render(
        <UnifiedOverlayV2 visible={true} mode="create" onClose={onClose} />,
      );

      // Close button should NOT be rendered in create mode
      expect(queryByLabelText('Close')).toBeNull();
    });
  });
});
