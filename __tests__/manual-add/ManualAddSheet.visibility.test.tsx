import { render, fireEvent } from '@testing-library/react-native';
import ManualAddSheet from '../../components/ManualAddSheet';

// Mock dependencies
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(),
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

describe('ManualAddSheet - Visibility', () => {
  it('renders without debug text overlays', () => {
    const { queryByText } = render(<ManualAddSheet />);
    expect(queryByText(/DEBUG/i)).toBeNull();
  });

  it('renders Habit tab by default with visible inputs', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Habit tab should be active
    expect(getByTestId('tab-habit')).toBeTruthy();

    // Name input should be visible with placeholder
    // Habit name input should be visible
    expect(getByTestId('habit-name')).toBeTruthy();
    // Frequency chips visible
    expect(getByTestId('frequency-daily')).toBeTruthy();
  });

  it('switches to To-Do tab and shows correct inputs', () => {
    const { getByTestId, getByPlaceholderText } = render(<ManualAddSheet />);

    // Switch to To-Do tab
    fireEvent.press(getByTestId('tab-todo'));

    // Should show To-Do specific inputs
    expect(getByPlaceholderText('e.g., Buy groceries')).toBeTruthy();
    expect(getByPlaceholderText('YYYY-MM-DD')).toBeTruthy();
  });

  it('switches to Journal tab and shows correct inputs', () => {
    const { getByTestId, getByPlaceholderText } = render(<ManualAddSheet />);

    // Switch to Journal tab
    fireEvent.press(getByTestId('tab-journal'));

    // Should show Journal specific inputs
    expect(getByPlaceholderText('Write freely…')).toBeTruthy();
    expect(getByTestId('journal-inspiration')).toBeTruthy();
  });

  it('switches to Catch All tab and shows correct input', () => {
    const { getByTestId, getByPlaceholderText } = render(<ManualAddSheet />);

    // Switch to Catch All tab
    fireEvent.press(getByTestId('tab-catchall'));

    // Should show Catch All input
    expect(getByPlaceholderText('Drop any thought or idea — I’ll sort it for you ✨')).toBeTruthy();
  });

  it('renders save button with correct text', () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    const saveButton = getByTestId('button-save');
    expect(saveButton).toBeTruthy();
    expect(getByText('Submit to Gremly')).toBeTruthy();
  });

  it('all text inputs accept user input', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    // Test Habit input
    const habitInput = getByTestId('habit-name');
    fireEvent.changeText(habitInput, 'Test habit');
    expect(habitInput.props.value).toBe('Test habit');

    // Switch to Todo and test
    fireEvent.press(getByTestId('tab-todo'));
    const todoInput = getByTestId('todo-name');
    fireEvent.changeText(todoInput, 'Test todo');
    expect(todoInput.props.value).toBe('Test todo');
  });
});
