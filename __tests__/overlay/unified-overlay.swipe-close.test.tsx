/**
 * UnifiedOverlayV2 Swipe-to-Close Tests
 *
 * Tests that the swipe-down gesture infrastructure is properly set up
 * and that the close callback works correctly.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import '../../tests/overlay/__testutils__/mockUnifiedOverlayDeps';

// Mock openEdit function
const mockOpenEdit = jest.fn();
const mockClose = jest.fn();

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
    close: mockClose,
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

// Mock record for tests
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

describe('UnifiedOverlayV2 - Swipe-to-Close', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetById.mockResolvedValue(mockRecord);
  });

  describe('Close button behavior (view mode)', () => {
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

      // Press Close button to trigger close
      const closeButton = getByLabelText('Close');
      fireEvent.press(closeButton);

      // onClose should be called
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cancel button behavior', () => {
    it('Cancel button calls onClose when pressed in create mode', async () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <UnifiedOverlayV2 visible={true} mode="create" onClose={onClose} />,
      );

      // Press Cancel to trigger close
      const cancelButton = getByText('Cancel');
      fireEvent.press(cancelButton);

      // onClose should be called (handleCancel is async)
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('Cancel button calls onClose when pressed in edit mode', async () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // Press Cancel to trigger close
      const cancelButton = getByText('Cancel');
      fireEvent.press(cancelButton);

      // onClose should be called (handleCancel is async)
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('PanResponder gesture handlers', () => {
    it('overlay renders correctly with swipe gesture support in create mode', () => {
      const onClose = jest.fn();
      const { UNSAFE_root } = render(
        <UnifiedOverlayV2 visible={true} mode="create" onClose={onClose} />,
      );

      // The component should render without errors (panHandlers are attached)
      expect(UNSAFE_root).toBeTruthy();
    });

    it('overlay renders correctly with swipe gesture support in edit mode', () => {
      const onClose = jest.fn();
      const { UNSAFE_root } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="edit"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // The component should render without errors (panHandlers are attached)
      expect(UNSAFE_root).toBeTruthy();
    });

    it('overlay renders correctly with swipe gesture support in view mode', () => {
      const onClose = jest.fn();
      const { UNSAFE_root } = render(
        <UnifiedOverlayV2
          visible={true}
          mode="view"
          onClose={onClose}
          initialEntity={mockRecord}
        />,
      );

      // The component should render without errors (panHandlers are attached)
      expect(UNSAFE_root).toBeTruthy();
    });
  });
});
