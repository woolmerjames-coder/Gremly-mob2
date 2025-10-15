import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ManualAddSheet from '../../components/ManualAddSheet';

jest.spyOn(Alert, 'alert');

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
  const _React = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => <>{children}</>,
    SheetManager: { show: jest.fn(), hide: jest.fn() },
  };
});

jest.mock('../../components/JournalInspiration', () => {
  const _React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="journal-inspiration" />,
  };
});

describe('ManualAddSheet - To-Do', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'todo_123', type: 'todo' });
  });

  it('creates todo with name only', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-todo'));
    fireEvent.changeText(getByTestId('input-name'), 'Buy groceries');

    fireEvent.press(getByTestId('button-save'));

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

  it('creates todo with due date', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-todo'));
    fireEvent.changeText(getByTestId('input-name'), 'Submit report');
    fireEvent.changeText(getByTestId('input-dueDate'), '2025-12-31');

    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'todo',
        title: 'Submit report',
        due_date: '2025-12-31',
        undefined_due: false,
        space_id: null,
        ai_placed: false,
      });
    });
  });

  it('shows validation error for invalid date format', async () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-todo'));
    fireEvent.changeText(getByTestId('input-name'), 'Task');
    fireEvent.changeText(getByTestId('input-dueDate'), '12/31/2025');

    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(getByText('Date must be YYYY-MM-DD format')).toBeTruthy();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows validation error when name is missing', async () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-todo'));
    fireEvent.changeText(getByTestId('input-dueDate'), '2025-12-31');

    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(getByText('Name is required')).toBeTruthy();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
