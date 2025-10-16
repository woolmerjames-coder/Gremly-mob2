import { render, fireEvent } from '@testing-library/react-native';
import ManualAddSheet, { openManualAdd as _openManualAdd } from '../../components/ManualAddSheet';

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
  const _React = require('react');
  const { useEffect, useRef } = _React;
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
  const _React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="journal-inspiration" />,
  };
});

describe('ManualAddSheet - Render', () => {
  it('renders with default Habit tab active', () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    // Should show tabs
    expect(getByTestId('tab-habit')).toBeTruthy();
    expect(getByTestId('tab-todo')).toBeTruthy();
    expect(getByTestId('tab-journal')).toBeTruthy();
    expect(getByTestId('tab-catchall')).toBeTruthy();

    // Should show Habit form fields (name + frequency chips)
    expect(getByTestId('habit-name')).toBeTruthy();
    expect(getByTestId('frequency-daily')).toBeTruthy();

    // Should show save button
    expect(getByTestId('button-save')).toBeTruthy();
    expect(getByText('Submit to Gremly')).toBeTruthy();
  });

  it('switches to To-Do tab when pressed', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-todo'));

    // Should show To-Do form fields
    expect(getByTestId('todo-name')).toBeTruthy();
    expect(getByTestId('todo-date')).toBeTruthy();
  });

  it('switches to Journal tab when pressed', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-journal'));

    // Should show Journal form fields
    expect(getByTestId('journal-date')).toBeTruthy();
    expect(getByTestId('journal-body')).toBeTruthy();
    expect(getByTestId('journal-inspiration')).toBeTruthy();
  });

  it('switches to Catch All tab when pressed', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    // Should show Catch All form field
    expect(getByTestId('catchall-body')).toBeTruthy();
  });
});
