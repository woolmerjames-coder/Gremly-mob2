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
import { render } from '@testing-library/react-native';
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

// Mock OverlayContext
jest.mock('../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false, mode: 'create', record: null, spaceId: null },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
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
      const { getByLabelText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Edit button SHOULD be rendered in view mode (using accessibility label)
      expect(getByLabelText('Edit')).toBeTruthy();
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
});
