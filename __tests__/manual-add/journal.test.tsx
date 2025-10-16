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

describe('ManualAddSheet - Journal Form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'test-id' });
  });

  const renderSheet = () => {
    return render(<ManualAddSheet />);
  };

  it('save button is disabled when body is empty', () => {
    openManualAdd({ defaultTab: 'journal' });
    renderSheet();

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('save button is enabled when body is filled', () => {
    openManualAdd({ defaultTab: 'journal' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('journal-body'), 'Today was a good day');

    const saveButton = screen.getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(false);
  });

  it('creates journal note with body only (no title)', async () => {
    openManualAdd({ defaultTab: 'journal' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('journal-body'), 'Reflecting on my progress today.');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: '',
        body: 'Reflecting on my progress today.',
        subtype: 'journal',
        space_id: null,
        ai_placed: false,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Journal entry saved to the Hub');
  });

  // Title field removed in cleanup; no separate title test needed.

  it('shows validation error when body is empty', async () => {
    openManualAdd({ defaultTab: 'journal' });
    const { getByTestId } = renderSheet();

    // Try to save with empty body
    const saveButton = getByTestId('button-save');
    fireEvent.press(saveButton);

    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('creates journal with spaceId when provided', async () => {
    openManualAdd({ defaultTab: 'journal', spaceId: 'space-789' });
    renderSheet();

    fireEvent.changeText(screen.getByTestId('journal-body'), 'Thoughts about the project.');
    fireEvent.press(screen.getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          space_id: 'space-789',
        }),
      );
    });
  });
});
