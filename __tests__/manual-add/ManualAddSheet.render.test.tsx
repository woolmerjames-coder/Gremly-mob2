import { render, fireEvent } from '@testing-library/react-native';
import ManualAddSheet, { openManualAdd } from '../../components/ManualAddSheet';

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
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => <>{children}</>,
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

describe('ManualAddSheet - Render', () => {
  it('renders with default Habit tab active', () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    // Should show tabs
    expect(getByTestId('tab-habit')).toBeTruthy();
    expect(getByTestId('tab-todo')).toBeTruthy();
    expect(getByTestId('tab-journal')).toBeTruthy();
    expect(getByTestId('tab-catchall')).toBeTruthy();

    // Should show Habit form fields
    expect(getByTestId('input-name')).toBeTruthy();
    expect(getByTestId('input-frequency')).toBeTruthy();

    // Should show save button
    expect(getByTestId('button-save')).toBeTruthy();
    expect(getByText('Save to the Hub')).toBeTruthy();
  });

  it('switches to To-Do tab when pressed', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-todo'));

    // Should show To-Do form fields
    expect(getByTestId('input-name')).toBeTruthy();
    expect(getByTestId('input-dueDate')).toBeTruthy();
  });

  it('switches to Journal tab when pressed', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-journal'));

    // Should show Journal form fields
    expect(getByTestId('input-title')).toBeTruthy();
    expect(getByTestId('input-body')).toBeTruthy();
    expect(getByTestId('journal-inspiration')).toBeTruthy();
  });

  it('switches to Catch All tab when pressed', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    // Should show Catch All form field
    expect(getByTestId('input-body')).toBeTruthy();
  });
});
