import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ManualAddSheet from '../../components/ManualAddSheet';

const mockCreate = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({ create: mockCreate }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('frequency normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'habit_1', type: 'habit' });
  });

  it('chips map to lowercase frequency', async () => {
    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.changeText(getByTestId('habit-name'), 'Habit');

    // pick each chip and ensure frequency is lowercase in payload
    fireEvent.press(getByTestId('frequency-daily'));
    fireEvent.press(getByTestId('button-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'habit', frequency: 'daily' }),
      );
    });
  });
});
