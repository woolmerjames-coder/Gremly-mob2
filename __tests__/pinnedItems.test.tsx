import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PinnedItemsModal } from '../components/spaces/PinnedItemsModal';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  X: () => null,
  Pin: () => null,
  PinOff: () => null,
  Circle: () => null,
  CheckCircle2: () => null,
  Flame: () => null,
  FileText: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockGetPinnedItemsForSpace = jest.fn();
const mockToggleTodoPinned = jest.fn();
const mockToggleHabitPinned = jest.fn();
const mockToggleNotePinned = jest.fn();

// Create a stable mock repo object to avoid infinite re-renders
const mockRepo = {
  getPinnedItemsForSpace: mockGetPinnedItemsForSpace,
  toggleTodoPinned: mockToggleTodoPinned,
  toggleHabitPinned: mockToggleHabitPinned,
  toggleNotePinned: mockToggleNotePinned,
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

describe('PinnedItemsModal', () => {
  const defaultProps = {
    visible: true,
    spaceId: 'space-1',
    onClose: jest.fn(),
    onItemPress: jest.fn(),
    onUnpin: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPinnedItemsForSpace.mockResolvedValue({
      todos: [],
      habits: [],
      notes: [],
    });
  });

  it('shows empty state when no pinned items', async () => {
    const { findByText } = render(<PinnedItemsModal {...defaultProps} />);

    expect(await findByText('No pinned items')).toBeTruthy();
  });

  it('renders pinned todos', async () => {
    mockGetPinnedItemsForSpace.mockResolvedValue({
      todos: [{ id: 'todo-1', title: 'Test Todo', is_pinned: true }],
      habits: [],
      notes: [],
    });

    const { findByText } = render(<PinnedItemsModal {...defaultProps} />);

    expect(await findByText('Test Todo')).toBeTruthy();
    expect(await findByText('To Do (1)')).toBeTruthy();
  });

  it('renders pinned habits', async () => {
    mockGetPinnedItemsForSpace.mockResolvedValue({
      todos: [],
      habits: [{ id: 'habit-1', name: 'Test Habit', is_pinned: true }],
      notes: [],
    });

    const { findByText } = render(<PinnedItemsModal {...defaultProps} />);

    expect(await findByText('Test Habit')).toBeTruthy();
    expect(await findByText('Habits (1)')).toBeTruthy();
  });

  it('renders pinned notes', async () => {
    mockGetPinnedItemsForSpace.mockResolvedValue({
      todos: [],
      habits: [],
      notes: [{ id: 'note-1', title: 'Test Note', is_pinned: true }],
    });

    const { findByText } = render(<PinnedItemsModal {...defaultProps} />);

    expect(await findByText('Test Note')).toBeTruthy();
    expect(await findByText('Guides & Logs (1)')).toBeTruthy();
  });

  it('calls onClose when X pressed', async () => {
    const { findByLabelText } = render(<PinnedItemsModal {...defaultProps} />);

    const closeButton = await findByLabelText('Close');
    fireEvent.press(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onUnpin when unpin button pressed', async () => {
    // Set up mock to return a todo
    mockGetPinnedItemsForSpace.mockResolvedValue({
      todos: [{ id: 'todo-1', title: 'Test Todo', is_pinned: true }],
      habits: [],
      notes: [],
    });
    mockToggleTodoPinned.mockResolvedValue({});

    const { findByText, findByLabelText } = render(<PinnedItemsModal {...defaultProps} />);

    // Wait for the todo text to appear (component done loading)
    await findByText('Test Todo');

    // Find and press the unpin button
    const unpinButton = await findByLabelText('Unpin');
    fireEvent.press(unpinButton);

    await waitFor(() => {
      expect(mockToggleTodoPinned).toHaveBeenCalledWith('todo-1', false);
    });

    expect(defaultProps.onUnpin).toHaveBeenCalled();
  });
});

// Test long-press in sections
describe('Section Long Press', () => {
  // These would test the section components with long press
  // but require more complex setup with the section components
});
