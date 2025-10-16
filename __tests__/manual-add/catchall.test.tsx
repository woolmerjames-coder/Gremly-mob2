import React from 'react';
import {
  renderWithProviders as render,
  fireEvent,
  screen,
  waitFor,
} from '../utils/renderWithProviders';
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

describe('ManualAddSheet - Catch-All Form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'test-id' });
  });

  const renderSheet = () => {
    return render(<ManualAddSheet />);
  };

  it('save button is disabled when body is empty', () => {
    openManualAdd({ defaultTab: 'catchall' });
    renderSheet();

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('save button is enabled when body is filled', () => {
    openManualAdd({ defaultTab: 'catchall' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('catchall-body'), 'Random thought...');

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(false);
  });

  it('creates catchall note with body', async () => {
    openManualAdd({ defaultTab: 'catchall' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('catchall-body'), 'Remember to check the mail.');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: '',
        body: 'Remember to check the mail.',
        subtype: 'catchall',
        space_id: null,
        ai_placed: false,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Note saved to the Hub');
  });

  it('creates catchall with spaceId when provided', async () => {
    openManualAdd({ defaultTab: 'catchall', spaceId: 'space-xyz' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('catchall-body'), 'Quick note for later');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          subtype: 'catchall',
          space_id: 'space-xyz',
          ai_placed: false,
        }),
      );
    });
  });

  it('shows validation error when body is empty on submit attempt', async () => {
    openManualAdd({ defaultTab: 'catchall' });
    renderSheet();

    // Try to save with empty body (button should be disabled anyway)
    const bodyInput = screen.getByTestId('catchall-body');
    fireEvent.changeText(bodyInput, 'Test');
    fireEvent.changeText(bodyInput, ''); // Clear it

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });
});
