import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ManualAddOverlay } from '../../components/ManualAddOverlay';

const mockClassify = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../components/overlay/ManualAddHeader', () => {
  const _React = require('react');
  const Stub = () => null;
  return {
    __esModule: true,
    ManualAddHeader: Stub,
    default: Stub,
  };
});

jest.mock('../../components/overlay/ManualAddFooter', () => {
  const _React = require('react');
  const Stub = () => null;
  return {
    __esModule: true,
    ManualAddFooter: Stub,
    default: Stub,
  };
});

jest.mock('../../components/overlay/ReminderSelector', () => {
  const _React = require('react');
  const Stub = () => null;
  return {
    __esModule: true,
    ReminderSelector: Stub,
    default: Stub,
  };
});

jest.mock('../../components/overlay/HabitsTab', () => {
  const _React = require('react');
  const Stub = () => null;
  return {
    __esModule: true,
    HabitsTab: Stub,
    default: Stub,
  };
});

jest.mock('../../components/overlay/TodoForm', () => {
  const _React = require('react');
  const Stub = () => null;
  return {
    __esModule: true,
    TodoForm: Stub,
    default: Stub,
  };
});

jest.mock('../../components/overlay/JournalForm', () => {
  const _React = require('react');
  const Stub = () => null;
  return {
    __esModule: true,
    JournalForm: Stub,
    default: Stub,
  };
});

jest.mock('../../design-system/Button', () => {
  const _React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    Button: ({ label, onPress, testID, disabled }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID={testID}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../providers/CortexProvider', () => ({
  __esModule: true,
  useCortex: () => ({
    classify: mockClassify,
  }),
}));

jest.mock('../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
  }),
}));

// Unified overlay is the only supported path; keep legacy coverage disabled.
describe.skip('ManualAddOverlay catch-all tags (legacy)', () => {
  const originalFlag = process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
  let alertSpy: jest.SpyInstance;
  let globalAlertMock: jest.Mock | undefined;
  const originalGlobalAlert = global.alert;

  beforeAll(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    globalAlertMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).alert = globalAlertMock;
  });

  afterAll(() => {
    alertSpy.mockRestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).alert = originalGlobalAlert;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';
    mockCreate.mockResolvedValue({ id: 'record-1' });
    mockClassify.mockResolvedValue({
      type: 'note',
      subtype: 'journal',
      aiPlaced: true,
      whyString: 'LLM classified.',
      tags: ['@Teammate', '*meeting', '#launch'],
    });
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
    } else {
      process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = originalFlag;
    }
  });

  test('persists classification tags into repo create payload', async () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <ManualAddOverlay visible defaultTab="catchall" onClose={onClose} />,
    );

    fireEvent.changeText(
      getByTestId('catchall-entry'),
      'Sync with teammate about launch checklist',
    );
    fireEvent.press(getByTestId('capture-catchall'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    expect(mockCreate).toHaveBeenCalledWith({
      type: 'note',
      title: 'Sync with teammate about launch checklist',
      body: 'Sync with teammate about launch checklist',
      subtype: 'journal',
      space_id: null,
      ai_placed: true,
      why_string: 'LLM classified.',
      tags: ['@Teammate', '*meeting', '#launch'],
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    const toastMessage = 'Saved to the Hub. I put this here.';
    const nativeCall = alertSpy.mock.calls.some(
      ([title, body]) => title === 'Success' && body === toastMessage,
    );
    const browserCall = globalAlertMock?.mock.calls.some(([message]) => message === toastMessage);
    expect(nativeCall || !!browserCall).toBe(true);
  });
});
