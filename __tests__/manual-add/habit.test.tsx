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

describe('ManualAddSheet - Habit Form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'test-id' });
  });

  const renderSheet = () => {
    return render(<ManualAddSheet />);
  };

  it('save button is disabled when form is empty', () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('save button is enabled when name and frequency are filled', () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    const nameInput = screen.getByTestId('habit-name');
    fireEvent.changeText(nameInput, 'Morning run');

    // Daily is selected by default
    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(false);
  });

  it('creates habit with Daily frequency', async () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    const nameInput = screen.getByTestId('habit-name');
    fireEvent.changeText(nameInput, 'Drink water');

    fireEvent.press(screen.getByTestId('frequency-daily'));

    const saveButton = screen.getByTestId('button-save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'habit',
        title: 'Drink water',
        frequency: 'daily',
        space_id: null,
        ai_placed: false,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Habit saved to the Hub');
  });

  it('creates habit with Weekly frequency', async () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('habit-name'), 'Yoga');
    fireEvent.press(screen.getByTestId('frequency-weekly'));

    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'habit',
          title: 'Yoga',
          frequency: 'weekly',
          ai_placed: false,
        }),
      );
    });
  });

  it('creates habit with Custom frequency', async () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('habit-name'), 'Gym');
    // Type a custom frequency instead of pressing a custom chip
    fireEvent.changeText(screen.getByTestId('input-frequency'), 'custom');

    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'habit',
          title: 'Gym',
          frequency: 'custom',
          ai_placed: false,
        }),
      );
    });
  });

  it('creates habit with spaceId when provided', async () => {
    openManualAdd({ defaultTab: 'habit', spaceId: 'space-123' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('habit-name'), 'Read');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          space_id: 'space-123',
        }),
      );
    });
  });

  it('shows validation error for empty name', async () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    // Try to save without filling name
    // Note: Save button should be disabled, but test validation anyway
    const nameInput = screen.getByTestId('habit-name');
    fireEvent.changeText(nameInput, 'Test');
    fireEvent.changeText(nameInput, ''); // Clear it

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });
});
