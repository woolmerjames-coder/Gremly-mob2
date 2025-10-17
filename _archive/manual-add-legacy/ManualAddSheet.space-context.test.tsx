import { renderWithProviders as render } from '../utils/renderWithProviders';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ManualAddSheet, { openManualAdd } from '../../components/ManualAddSheet';

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

describe('ManualAddSheet - Space Context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'item_123' });
  });

  it('includes spaceId when creating habit from Space detail', async () => {
    openManualAdd({ spaceId: 'space_456' });

    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.changeText(getByTestId('habit-name'), 'Space habit');
    fireEvent.press(getByTestId('frequency-daily'));

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'habit',
        title: 'Space habit',
        frequency: 'daily',
        space_id: 'space_456',
        ai_placed: false,
      });
    });
  });

  it('includes spaceId when creating todo from Space detail', async () => {
    openManualAdd({ spaceId: 'space_789', defaultTab: 'todo' });

    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.changeText(getByTestId('todo-name'), 'Space task');

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'todo',
        title: 'Space task',
        due_date: null,
        undefined_due: true,
        space_id: 'space_789',
        ai_placed: false,
      });
    });
  });

  it('includes spaceId when creating journal from Space detail', async () => {
    openManualAdd({ spaceId: 'space_111', defaultTab: 'journal' });

    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.changeText(getByTestId('journal-body'), 'Reflection on this space');

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: '',
        body: 'Reflection on this space',
        subtype: 'journal',
        space_id: 'space_111',
        ai_placed: false,
      });
    });
  });

  it('includes spaceId when creating catch-all from Space detail', async () => {
    openManualAdd({ spaceId: 'space_222', defaultTab: 'catchall' });

    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.changeText(getByTestId('catchall-body'), 'Random space note');

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: '',
        body: 'Random space note',
        subtype: 'catchall',
        space_id: 'space_222',
        ai_placed: false,
      });
    });
  });

  it('opens to specified default tab', async () => {
    openManualAdd({ defaultTab: 'journal' });

    const { getByTestId } = render(<ManualAddSheet />);

    // Journal tab should show journal fields
    expect(getByTestId('journal-body')).toBeTruthy();
    expect(getByTestId('journal-inspiration')).toBeTruthy();
  });
});
