import { renderWithProviders as render } from '../utils/renderWithProviders';
import { fireEvent, waitFor } from '@testing-library/react-native';
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

describe('ManualAddSheet - Catch All', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'note_456', type: 'note' });
  });

  it('creates catch-all note with body', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    await waitFor(() => {
      expect(getByTestId('catchall-body')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('catchall-body'), 'Random idea for later');

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: '',
        body: 'Random idea for later',
        subtype: 'catchall',
        space_id: null,
        ai_placed: false,
      });
    });
  });

  it('keeps save disabled when body is missing', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    await waitFor(() => {
      expect(getByTestId('catchall-body')).toBeTruthy();
    });

    const saveButton = getByTestId('save-button');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates catch-all with aiPlaced=false', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    await waitFor(() => {
      expect(getByTestId('catchall-body')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('catchall-body'), 'Manual note');

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ai_placed: false,
        }),
      );
    });
  });
});
