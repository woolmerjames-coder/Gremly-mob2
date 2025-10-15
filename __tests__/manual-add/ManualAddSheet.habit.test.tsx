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
  const { useEffect } = require('react');
  function MockActionSheet({ children, onOpen }: any) {
    useEffect(() => {
      if (onOpen) onOpen();
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
    fireEvent.changeText(getByTestId('input-name'), 'Morning run');
    fireEvent.changeText(getByTestId('input-frequency'), 'daily');

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
    fireEvent.changeText(getByTestId('input-name'), 'Workout');
    fireEvent.changeText(getByTestId('input-frequency'), 'weekly');

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

  it('shows validation error when name is missing', async () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    // Leave name empty
    fireEvent.changeText(getByTestId('input-frequency'), 'daily');

    // Submit
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(getByText('Name is required')).toBeTruthy();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows validation error when frequency is missing', async () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    // Fill name but clear frequency
    fireEvent.changeText(getByTestId('input-name'), 'Test habit');
    fireEvent.changeText(getByTestId('input-frequency'), '');

    // Submit
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(getByText('Frequency is required')).toBeTruthy();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('allows custom frequency text', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Fill in with custom frequency
    fireEvent.changeText(getByTestId('input-name'), 'Meditation');
    fireEvent.changeText(getByTestId('input-frequency'), 'Every other day');

    // Submit
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'habit',
        title: 'Meditation',
        frequency: 'Every other day',
        space_id: null,
        ai_placed: false,
      });
    });
  });
});
