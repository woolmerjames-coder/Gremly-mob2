import React from 'react';
import { render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
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
        canonicalTypes: false,
      },
    },
  };
});

type RenderResult = ReturnType<typeof render>;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

describe('UnifiedCreateOverlay – Legacy Note Labels', () => {
  let mockRepo: any;
  let mockCortex: any;
  let mockAuth: any;
  let mockTheme: any;
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
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      listTags: jest.fn().mockResolvedValue([]),
      listItemTags: jest.fn().mockResolvedValue([]),
      listLinkedPeopleByItem: jest.fn().mockResolvedValue([]),
      linkTag: jest.fn(),
      unlinkTag: jest.fn(),
      linkPerson: jest.fn(),
      unlinkPerson: jest.fn(),
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
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
    }
  });

  it('renders "Note" label for the log type pill when canonical types disabled', () => {
    const { getByTestId } = renderOverlay();
  const logChip = getByTestId('type-pill-everything_else');
    expect(within(logChip).getByText('Note')).toBeTruthy();
  });
});
