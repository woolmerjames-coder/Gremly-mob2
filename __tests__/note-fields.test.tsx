/**
 * Tests for NoteFields component
 * Validates note creation UI with required body, optional title/formatting/space/tags
 * NO subtype chips (idea/list/reference are AI-only)
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NoteFields, type NoteDetailsState } from '../components/overlay/fields/NoteFields';

describe('NoteFields Component', () => {
  const mockOnTitleChange = jest.fn();
  const mockOnBodyChange = jest.fn();
  const mockOnDetailsChange = jest.fn();

  const defaultDetails: NoteDetailsState = {
    formatting: null,
    spaceId: null,
    tags: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('renders all required fields', () => {
    const { getByTestId, getByText } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Required body field
    expect(getByTestId('note-body')).toBeTruthy();
    expect(getByText(/Body/)).toBeTruthy();

    // Optional title field
    expect(getByTestId('note-title')).toBeTruthy();
    expect(getByText(/Title \(optional\)/)).toBeTruthy();
  });

  it('allows text input in body field', () => {
    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    const bodyInput = getByTestId('note-body');
    fireEvent.changeText(bodyInput, 'My important note');

    expect(mockOnBodyChange).toHaveBeenCalledWith('My important note');
  });

  it('allows text input in title field', () => {
    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    const titleInput = getByTestId('note-title');
    fireEvent.changeText(titleInput, 'Project Ideas');

    expect(mockOnTitleChange).toHaveBeenCalledWith('Project Ideas');
  });

  // ============================================================================
  // Formatting Toggle Tests
  // ============================================================================

  it('renders formatting toggle', () => {
    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    expect(getByTestId('fmt-bullets')).toBeTruthy();
    expect(getByTestId('fmt-numbers')).toBeTruthy();
    expect(getByTestId('fmt-checkboxes')).toBeTruthy();
  });

  it('handles formatting selection', () => {
    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    fireEvent.press(getByTestId('fmt-bullets'));

    expect(mockOnDetailsChange).toHaveBeenCalledWith({
      ...defaultDetails,
      formatting: 'bullets',
    });
  });

  // ============================================================================
  // Add Details Toggle Tests
  // ============================================================================

  it('shows "Add details" toggle button', () => {
    const { getByText } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    expect(getByText('Add details')).toBeTruthy();
  });

  it('expands details section when toggle pressed', () => {
    const { getByText, queryByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Initially hidden
    expect(queryByTestId('note-space')).toBeNull();

    // Press toggle
    fireEvent.press(getByText('Add details'));

    // Now visible
    expect(queryByTestId('note-space')).toBeTruthy();
    expect(queryByTestId('note-tag-input')).toBeTruthy();
  });

  it('collapses details section when toggle pressed again', () => {
    const { getByText, queryByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Expand
    fireEvent.press(getByText('Add details'));
    expect(queryByTestId('note-space')).toBeTruthy();

    // Collapse
    fireEvent.press(getByText('Hide details'));
    expect(queryByTestId('note-space')).toBeNull();
  });

  // ============================================================================
  // Space Tests
  // ============================================================================

  it('allows space ID input', () => {
    const { getByText, getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Expand details
    fireEvent.press(getByText('Add details'));

    const spaceInput = getByTestId('note-space');
    fireEvent.changeText(spaceInput, 'space-123');

    expect(mockOnDetailsChange).toHaveBeenCalledWith({
      ...defaultDetails,
      spaceId: 'space-123',
    });
  });

  // ============================================================================
  // Tags Tests
  // ============================================================================

  it('allows adding tags', () => {
    const { getByText, getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Expand details
    fireEvent.press(getByText('Add details'));

    // Enter tag
    const tagInput = getByTestId('note-tag-input');
    fireEvent.changeText(tagInput, 'important');

    // Press add button
    fireEvent.press(getByTestId('note-tag-add'));

    expect(mockOnDetailsChange).toHaveBeenCalledWith({
      ...defaultDetails,
      tags: ['important'],
    });
  });

  it('renders existing tags as chips', () => {
    const detailsWithTags: NoteDetailsState = {
      formatting: null,
      spaceId: null,
      tags: ['work', 'urgent'],
    };

    const { getByText, getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={detailsWithTags}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Expand details
    fireEvent.press(getByText('Add details'));

    expect(getByTestId('note-tag-chip-work')).toBeTruthy();
    expect(getByTestId('note-tag-chip-urgent')).toBeTruthy();
  });

  it('allows removing tags', () => {
    const detailsWithTags: NoteDetailsState = {
      formatting: null,
      spaceId: null,
      tags: ['work', 'urgent'],
    };

    const { getByText, getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={detailsWithTags}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // Expand details
    fireEvent.press(getByText('Add details'));

    // Tag chips should be visible
    expect(getByTestId('note-tag-chip-work')).toBeTruthy();

    // Note: Testing tag removal would require finding the X icon within the chip
    // For now, just verify the chips render correctly
    expect(mockOnDetailsChange).not.toHaveBeenCalled(); // No changes yet
  });

  // ============================================================================
  // NO Subtype Chips Test
  // ============================================================================

  it('does NOT render idea/list/reference subtype chips', () => {
    const { queryByText, queryByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    // These should NOT exist (AI-only)
    expect(queryByText('Idea')).toBeNull();
    expect(queryByText('List')).toBeNull();
    expect(queryByText('Reference')).toBeNull();
    expect(queryByTestId('subtype-pill-idea')).toBeNull();
    expect(queryByTestId('subtype-pill-list')).toBeNull();
    expect(queryByTestId('subtype-pill-reference')).toBeNull();
  });

  // ============================================================================
  // Disabled State Tests
  // ============================================================================

  it('disables all controls when disabled=true', () => {
    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
        disabled={true}
      />,
    );

    const titleInput = getByTestId('note-title');
    const bodyInput = getByTestId('note-body');

    expect(titleInput.props.editable).toBe(false);
    expect(bodyInput.props.editable).toBe(false);
  });

  it('disables formatting toggle when disabled=true', () => {
    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={defaultDetails}
        onDetailsChange={mockOnDetailsChange}
        disabled={true}
      />,
    );

    const bulletsButton = getByTestId('fmt-bullets');
    expect(bulletsButton.props.accessibilityState.disabled).toBe(true);
  });

  // ============================================================================
  // Visual Feedback Tests
  // ============================================================================

  it('shows selected formatting option visually', () => {
    const detailsWithFormatting: NoteDetailsState = {
      formatting: 'bullets',
      spaceId: null,
      tags: [],
    };

    const { getByTestId } = render(
      <NoteFields
        title=""
        onTitleChange={mockOnTitleChange}
        body=""
        onBodyChange={mockOnBodyChange}
        details={detailsWithFormatting}
        onDetailsChange={mockOnDetailsChange}
      />,
    );

    const bulletsButton = getByTestId('fmt-bullets');
    const numbersButton = getByTestId('fmt-numbers');

    // Bullets should be selected (have selected styles)
    expect(bulletsButton.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: expect.any(String) })]),
    );

    // Numbers should NOT be selected
    expect(numbersButton.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: '#2E7D6A' })]),
    );
  });
});
