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
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => <>{children}</>,
    SheetManager: { show: jest.fn(), hide: jest.fn() },
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

describe('ManualAddSheet - Journal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'note_123', type: 'note' });
  });

  it('creates journal with body only', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-journal'));
    fireEvent.changeText(getByTestId('input-body'), 'Today was a good day.');

    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: '',
        body: 'Today was a good day.',
        subtype: 'journal',
        space_id: null,
        ai_placed: false,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Journal entry saved to the Hub');
  });

  it('creates journal with title and body', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-journal'));
    fireEvent.changeText(getByTestId('input-title'), 'Morning thoughts');
    fireEvent.changeText(getByTestId('input-body'), 'Feeling grateful today.');

    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: 'Morning thoughts',
        body: 'Feeling grateful today.',
        subtype: 'journal',
        space_id: null,
        ai_placed: false,
      });
    });
  });

  it('shows validation error when body is missing', async () => {
    const { getByTestId, getByText } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-journal'));
    fireEvent.changeText(getByTestId('input-title'), 'Empty entry');

    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(getByText('Journal entry cannot be empty')).toBeTruthy();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('renders JournalInspiration component', () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-journal'));

    expect(getByTestId('journal-inspiration')).toBeTruthy();
  });
});
