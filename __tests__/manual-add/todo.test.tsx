import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
import ManualAddSheet, { openManualAdd } from '../../components/ManualAddSheet';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock repo
const mockCreate = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
  }),
}));

// Mock ActionSheet
jest.mock('react-native-actions-sheet', () => {
  const { useEffect, useRef } = require('react');
  function MockActionSheet({ children, onOpen }: any) {
    const hasOpenedRef = useRef(false);
    useEffect(() => {
      if (onOpen && !hasOpenedRef.current) {
        hasOpenedRef.current = true;
        onOpen();
      }
    }, [onOpen]);
    return <>{children}</>;
  }
  return {
    __esModule: true,
    default: MockActionSheet,
    SheetManager: {
      show: jest.fn(),
      hide: jest.fn(),
    },
  };
});

describe('ManualAddSheet - Todo Form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'test-id' });
  });

  const renderSheet = () => {
    return render(<ManualAddSheet />);
  };

  it('creates todo with name only (no due date)', async () => {
    openManualAdd({ defaultTab: 'todo' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('todo-name'), 'Buy groceries');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'todo',
        title: 'Buy groceries',
        due_date: null,
        undefined_due: true,
        space_id: null,
        ai_placed: false,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', 'To-Do saved to the Hub');
  });

  it('creates todo with valid due date', async () => {
    openManualAdd({ defaultTab: 'todo' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('todo-name'), 'Submit report');
    fireEvent.changeText(screen.getByTestId('todo-date'), '2025-12-31');

    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          title: 'Submit report',
          due_date: '2025-12-31',
          undefined_due: false,
          ai_placed: false,
        }),
      );
    });
  });

  it('shows validation error for invalid date format', async () => {
    openManualAdd({ defaultTab: 'todo' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('todo-name'), 'Task');
    fireEvent.changeText(screen.getByTestId('todo-date'), '12/31/2025'); // Wrong format

    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(screen.getByText(/must be YYYY-MM-DD format/i)).toBeTruthy();
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Saved to the Hub');
  });

  it('save button is disabled when name is empty', () => {
    openManualAdd({ defaultTab: 'todo' });
    renderSheet();

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('save button is enabled when name is filled (date optional)', () => {
    openManualAdd({ defaultTab: 'todo' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('todo-name'), 'Some task');

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(false);
  });

  it('creates todo with spaceId when provided', async () => {
    openManualAdd({ defaultTab: 'todo', spaceId: 'space-456' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('todo-name'), 'Team meeting');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          space_id: 'space-456',
        }),
      );
    });
  });
});
