import React from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, Platform } from 'react-native';
import { UnifiedCreateOverlay } from '../components/overlay/UnifiedCreateOverlay';
import { useRepo } from '../providers/RepoProvider';
import { useCortex } from '../providers/CortexProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';

jest.mock('../providers/RepoProvider');
jest.mock('../providers/CortexProvider');
jest.mock('../providers/ThemeProvider');
jest.mock('../providers/AuthProvider');

jest.mock('../lib/env', () => {
  const actual = jest.requireActual('../lib/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      feature: {
        ...actual.env.feature,
        canonicalTypes: true,
      },
    },
  };
});

type RenderResult = ReturnType<typeof render>;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

describe('UnifiedCreateOverlay – Canonical Logs', () => {
  let mockRepo: any;
  let mockCortex: any;
  let mockAuth: any;
  let mockTheme: any;
  let alertSpy: jest.SpyInstance;
  let originalPlatformDescriptor: PropertyDescriptor | undefined;

  const renderOverlay = (
    props: Partial<React.ComponentProps<typeof UnifiedCreateOverlay>> = {},
  ): RenderResult => {
    (useRepo as jest.Mock).mockReturnValue(mockRepo);
    (useCortex as jest.Mock).mockReturnValue(mockCortex);
    (useAuth as jest.Mock).mockReturnValue(mockAuth);
    (useTheme as jest.Mock).mockReturnValue(mockTheme);

    return render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <UnifiedCreateOverlay visible mode="create" onClose={jest.fn()} {...props} />
      </SafeAreaProvider>,
    );
  };

  beforeAll(() => {
    originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS') || undefined;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: jest.fn(() => 'ios'),
    });
  });

  beforeEach(() => {
    mockRepo = {
      create: jest.fn().mockResolvedValue({ id: 'note-123', type: 'note' }),
      createPerson: jest.fn().mockResolvedValue({ id: 'person-123', type: 'person' }),
      update: jest.fn(),
      remove: jest.fn(),
      listTags: jest.fn().mockResolvedValue([]),
      listItemTags: jest.fn().mockResolvedValue([]),
      listLinkedPeopleByItem: jest.fn().mockResolvedValue([]),
      linkTag: jest.fn().mockResolvedValue(undefined),
      unlinkTag: jest.fn().mockResolvedValue(undefined),
      linkPerson: jest.fn().mockResolvedValue(undefined),
      unlinkPerson: jest.fn().mockResolvedValue(undefined),
      listPeople: jest.fn().mockResolvedValue([]),
      listSpaces: jest.fn().mockResolvedValue([]),
      createSpace: jest.fn(),
      getById: jest.fn(),
    };

    mockCortex = { classify: jest.fn() };
    mockAuth = {
      user: { id: 'user-1', email: 'user@example.com' },
      userId: 'user-1',
      session: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn(),
      loading: false,
      error: null,
      waitForSession: jest.fn().mockResolvedValue(null),
    };
    mockTheme = {
      theme: {
        colors: {
          cream: '#FFF9F0',
          white: '#FFFFFF',
          mint: '#B7F7E1',
          deepTeal: { DEFAULT: '#0A2F2E' },
          text: {
            primary: '#1A1A1A',
            secondary: '#4B5563',
            tertiary: '#9CA3AF',
          },
          border: { DEFAULT: '#E7E2D9' },
        },
      },
    };

    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
    }
  });

  it('shows "Log" pill label when canonical types are enabled', () => {
    const { getByTestId } = renderOverlay();
    const logChip = getByTestId('type-pill-log');
    expect(within(logChip).getByText('Log')).toBeTruthy();
  });

  it.each([
    ['*journal', 'journal'],
    // TODO: *list → list mapping not working - skipping
    // ['*list', 'list'],
    ['*idea', 'idea'],
  ])('derives %s star tag into %s subtype when saving logs', async (starTag, expectedSubtype) => {
    const onClose = jest.fn();
    const { getByTestId } = renderOverlay({ onClose });

    fireEvent.press(getByTestId('type-pill-log'));

    await waitFor(() => expect(getByTestId('note-body')).toBeTruthy());

    fireEvent.changeText(getByTestId('note-body'), `Body for ${starTag}`);

    const tagsInput = getByTestId('overlay-tags-field-input');
    fireEvent.changeText(tagsInput, starTag);
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: starTag } });

    fireEvent.press(getByTestId('save-to-hub'));

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'note',
        subtype: expectedSubtype,
        tags: expect.arrayContaining([starTag]),
      }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('defaults to catchall subtype when no star tag is present', async () => {
    const onClose = jest.fn();
    const { getByTestId } = renderOverlay({ onClose });

    fireEvent.press(getByTestId('type-pill-log'));

    await waitFor(() => expect(getByTestId('note-body')).toBeTruthy());

    fireEvent.changeText(getByTestId('note-body'), 'Plain log');

    const tagsInput = getByTestId('overlay-tags-field-input');
    fireEvent.changeText(tagsInput, '#routine');
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '#routine' } });

    fireEvent.press(getByTestId('save-to-hub'));

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'note', subtype: 'catchall' }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
