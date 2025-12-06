/**
 * Tests for Photo Drop functionality in UnifiedOverlayV2
 * 
 * Photo attachments flow:
 * 1. Create mode: Photos from Mind Drop are passed via initialLogPhotoUris prop
 * 2. The overlay hydrates logPhotos state from initialLogPhotoUris
 * 3. On save, photos are uploaded to Supabase storage and recorded in log_photos table
 * 4. Edit mode: Photos are loaded from log_photos table via repo.listLogPhotos
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import './__testutils__/mockUnifiedOverlayDeps';

// Mock repo
const mockCreate = jest.fn().mockResolvedValue({ id: 'note-1', type: 'note' });
const mockUpdate = jest.fn().mockResolvedValue({ id: 'note-1', type: 'note' });
const mockListLogPhotos = jest.fn().mockResolvedValue([]);
const mockInsertLogPhoto = jest.fn().mockResolvedValue({ id: 'photo-1' });
const mockDeleteLogPhoto = jest.fn().mockResolvedValue(undefined);
const mockGetById = jest.fn().mockResolvedValue({
  id: 'note-1',
  type: 'note',
  body: 'Test note',
  subtype: 'journal',
});

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    update: mockUpdate,
    listLogPhotos: mockListLogPhotos,
    insertLogPhoto: mockInsertLogPhoto,
    deleteLogPhoto: mockDeleteLogPhoto,
    getById: mockGetById,
  }),
}));

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

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

beforeEach(() => {
  jest.clearAllMocks();
  mockListLogPhotos.mockResolvedValue([]);
});

describe('Photo Drop - Create Mode', () => {
  it('hydrates logPhotos from initialLogPhotoUris in create mode', async () => {
    const initialPhotoUris = ['file://photo1.jpg', 'file://photo2.jpg'];
    
    const { queryByLabelText, getByText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="create"
        initialEntity={{ type: 'log' }}
        initialLogPhotoUris={initialPhotoUris}
        onClose={jest.fn()}
      />
    );

    // Wait for hydration
    await waitFor(() => {
      // The photo grid should be visible since we have photos
      // Check for "Add photo" button which appears when photos exist but < 5
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeTruthy();
    });
  });

  it('does not hydrate photos when initialLogPhotoUris is empty', async () => {
    const { queryByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="create"
        initialEntity={{ type: 'log' }}
        initialLogPhotoUris={[]}
        onClose={jest.fn()}
      />
    );

    // The photo grid should NOT be visible
    await waitFor(() => {
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeNull();
    });
  });

  it('limits hydrated photos to maximum of 5', async () => {
    const manyPhotos = [
      'file://photo1.jpg',
      'file://photo2.jpg', 
      'file://photo3.jpg',
      'file://photo4.jpg',
      'file://photo5.jpg',
      'file://photo6.jpg', // Should be dropped
      'file://photo7.jpg', // Should be dropped
    ];
    
    const { queryByLabelText, queryAllByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="create"
        initialEntity={{ type: 'log' }}
        initialLogPhotoUris={manyPhotos}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      // Should have 5 photos max
      // The "Add photo" button should NOT appear when at max capacity
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeNull();
      
      // Should have 5 "View photo" buttons
      const viewPhotoButtons = queryAllByLabelText(/View photo \d/);
      expect(viewPhotoButtons.length).toBe(5);
    });
  });
});

describe('Photo Drop - Edit Mode', () => {
  it('loads photos from database in edit mode', async () => {
    const existingPhotos = [
      { id: 'photo-1', url: 'https://storage.example.com/photo1.jpg', position: 0 },
      { id: 'photo-2', url: 'https://storage.example.com/photo2.jpg', position: 1 },
    ];
    mockListLogPhotos.mockResolvedValue(existingPhotos);

    const { queryByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="edit"
        initialEntity={{ type: 'log', id: 'note-1' }}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      // Photos should be loaded
      expect(mockListLogPhotos).toHaveBeenCalledWith('note-1');
      
      // Photo grid should be visible
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeTruthy();
    });
  });

  it('does not load photos for non-log entity types', async () => {
    const { queryByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="edit"
        initialEntity={{ type: 'todo', id: 'todo-1' }}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      // Should not call listLogPhotos for todos
      expect(mockListLogPhotos).not.toHaveBeenCalled();
      
      // Photo grid should not be visible
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeNull();
    });
  });

  it('handles empty photo list gracefully', async () => {
    mockListLogPhotos.mockResolvedValue([]);

    const { queryByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="edit"
        initialEntity={{ type: 'log', id: 'note-1' }}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      // Should call listLogPhotos
      expect(mockListLogPhotos).toHaveBeenCalledWith('note-1');
      
      // Photo grid should NOT be visible when no photos
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeNull();
    });
  });

  it('handles listLogPhotos error gracefully', async () => {
    mockListLogPhotos.mockRejectedValue(new Error('Database error'));

    const { queryByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="edit"
        initialEntity={{ type: 'log', id: 'note-1' }}
        onClose={jest.fn()}
      />
    );

    // Should not crash - render should complete
    await waitFor(() => {
      expect(mockListLogPhotos).toHaveBeenCalledWith('note-1');
    });
    
    // Photo grid should not be visible after error
    const addPhotoButton = queryByLabelText('Add another photo');
    expect(addPhotoButton).toBeNull();
  });
});

describe('Photo rendering', () => {
  it('renders photo thumbnails for each photo', async () => {
    const existingPhotos = [
      { id: 'photo-1', url: 'https://storage.example.com/photo1.jpg', position: 0 },
      { id: 'photo-2', url: 'https://storage.example.com/photo2.jpg', position: 1 },
      { id: 'photo-3', url: 'https://storage.example.com/photo3.jpg', position: 2 },
    ];
    mockListLogPhotos.mockResolvedValue(existingPhotos);

    const { queryAllByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="edit"
        initialEntity={{ type: 'log', id: 'note-1' }}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      // Should have 3 view photo buttons
      const viewPhotoButtons = queryAllByLabelText(/View photo \d/);
      expect(viewPhotoButtons.length).toBe(3);
      
      // Should have 3 remove photo buttons
      const removePhotoButtons = queryAllByLabelText(/Remove photo \d/);
      expect(removePhotoButtons.length).toBe(3);
    });
  });

  it('does not break text-only entries', async () => {
    mockListLogPhotos.mockResolvedValue([]);

    const { getByPlaceholderText, queryByLabelText } = render(
      <UnifiedOverlayV2
        visible={true}
        mode="edit"
        initialEntity={{ type: 'log', id: 'note-1' }}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      // Text input should be present
      const textInput = getByPlaceholderText('Add notes...');
      expect(textInput).toBeTruthy();
      
      // Photo grid should NOT be visible
      const addPhotoButton = queryByLabelText('Add another photo');
      expect(addPhotoButton).toBeNull();
    });
  });
});
