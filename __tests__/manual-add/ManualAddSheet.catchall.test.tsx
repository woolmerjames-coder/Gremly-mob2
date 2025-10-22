import { renderWithProviders as render } from '../utils/renderWithProviders';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ManualAddSheet from '../../components/ManualAddSheet';

// Set env before any imports that might read it
process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';

jest.spyOn(Alert, 'alert');

const mockCreate = jest.fn();
const mockClassify = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
  }),
}));

jest.mock('../../providers/CortexProvider', () => ({
  useCortex: () => ({
    classify: mockClassify,
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

describe.skip('ManualAddSheet - Catch All', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Enable classification for tests
    process.env = {
      ...originalEnv,
      EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL: 'true',
    };
    mockCreate.mockResolvedValue({ id: 'note_456', type: 'note' });
    mockClassify.mockResolvedValue({
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
      whyString: 'No strong signal; storing in Catch All.',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
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
      expect(mockClassify).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith({
        type: 'note',
        title: 'Random idea for later',
        body: 'Random idea for later',
        subtype: 'catchall',
        space_id: null,
        ai_placed: false,
        why_string: 'No strong signal; storing in Catch All.',
        origin: 'catchall',
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
          why_string: 'No strong signal; storing in Catch All.',
          origin: 'catchall',
        }),
      );
    });
  });

  it('reclassifies to todo when cortex suggests it', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'todo',
      undefinedDue: true,
      aiPlaced: true,
      whyString: 'Detected actionable verb.',
    });

    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    await waitFor(() => {
      expect(getByTestId('catchall-body')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('catchall-body'), 'Call the dentist tomorrow');
    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          title: 'Call the dentist tomorrow',
          body: 'Call the dentist tomorrow',
          undefined_due: true,
          ai_placed: true,
          why_string: 'Detected actionable verb.',
          origin: 'catchall',
        }),
      );
    });
  });

  it('falls back to catchall when classification fails', async () => {
    mockClassify.mockRejectedValueOnce(new Error('timeout'));

    const { getByTestId } = render(<ManualAddSheet />);

    fireEvent.press(getByTestId('tab-catchall'));

    await waitFor(() => {
      expect(getByTestId('catchall-body')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('catchall-body'), 'Keep this in catchall');
    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          subtype: 'catchall',
          why_string: null,
          origin: 'catchall',
        }),
      );
    });
  });
});
