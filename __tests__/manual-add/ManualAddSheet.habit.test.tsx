import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ManualAddSheet, {
  openManualAdd,
  closeManualAdd as _closeManualAdd,
} from '../../components/ManualAddSheet';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock repo
const mockCreate = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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

jest.mock('../../components/JournalInspiration', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="journal-inspiration" />,
  };
});

describe('ManualAddSheet - Habit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'habit_123', type: 'habit' });
  });

  it('creates habit with name and frequency', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Fill in habit form
    fireEvent.changeText(getByTestId('habit-name'), 'Morning run');
    // Select daily via chip (daily is default, but press to be explicit)
    fireEvent.press(getByTestId('frequency-daily'));

    // Submit
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'habit',
        title: 'Morning run',
        frequency: 'daily',
        space_id: null,
        ai_placed: false,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Habit saved to the Hub');
  });

  it('creates habit with spaceId when provided', async () => {
    // Simulate opening with spaceId
    openManualAdd({ spaceId: 'space_123' });

    const { getByTestId } = render(<ManualAddSheet />);

    // Fill in habit form
    fireEvent.changeText(getByTestId('habit-name'), 'Workout');
    fireEvent.press(getByTestId('frequency-weekly'));

    // Submit
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'habit',
        title: 'Workout',
        frequency: 'weekly',
        space_id: 'space_123',
        ai_placed: false,
      });
    });
  });

  it('keeps save disabled when name is missing', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Leave name empty, frequency defaults to daily

    const saveButton = getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('save is enabled when name is present (frequency defaults to daily)', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Frequency defaults to daily; with name present, save should be enabled
    fireEvent.changeText(getByTestId('habit-name'), 'Test habit');

    const saveButton = getByTestId('button-save');
    expect(saveButton.props.accessibilityState.disabled).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('allows custom frequency text', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Select custom frequency via chip
    fireEvent.changeText(getByTestId('habit-name'), 'Meditation');
    fireEvent.press(getByTestId('frequency-custom'));

    // Submit
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'habit',
        title: 'Meditation',
        frequency: 'custom',
        space_id: null,
        ai_placed: false,
      });
    });
  });
});
