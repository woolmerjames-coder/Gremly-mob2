/**
 * Overlay Open Test
 * Ensures UnifiedCreateOverlay renders even when feature flag is off
 * and AI is disabled.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnifiedCreateOverlay } from '../components/overlay/UnifiedCreateOverlay';
import { useRepo } from '../providers/RepoProvider';
import { useCortex } from '../providers/CortexProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';

jest.mock('../providers/RepoProvider');
jest.mock('../providers/CortexProvider');
jest.mock('../providers/ThemeProvider');
jest.mock('../providers/AuthProvider');

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  createPerson: jest.fn(),
  updatePerson: jest.fn(),
};

const mockCortex = {
  classify: jest.fn(),
};

const mockAuth = {
  user: { id: 'test-user', email: 'test@example.com' },
  userId: 'test-user',
  session: null,
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
  loading: false,
  error: null,
  waitForSession: jest.fn().mockResolvedValue(null),
};

const renderWithProviders = (node: React.ReactElement) => {
  (useRepo as jest.Mock).mockReturnValue(mockRepo);
  (useCortex as jest.Mock).mockReturnValue(mockCortex);
  (useAuth as jest.Mock).mockReturnValue(mockAuth);
  (useTheme as jest.Mock).mockReturnValue({
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
  });

  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 44, left: 0, right: 0, bottom: 34 },
      }}
    >
      {node}
    </SafeAreaProvider>,
  );
};

describe('UnifiedCreateOverlay – Open Guard', () => {
  const originalOverlay = process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;
  const originalDisableAi = process.env.EXPO_PUBLIC_DISABLE_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockResolvedValue({ id: 'rec-123' });
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'off';
    process.env.EXPO_PUBLIC_DISABLE_AI = 'on';
  });

  afterEach(() => {
    if (typeof originalOverlay === 'string') {
      process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = originalOverlay;
    } else {
      delete process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;
    }

    if (typeof originalDisableAi === 'string') {
      process.env.EXPO_PUBLIC_DISABLE_AI = originalDisableAi;
    } else {
      delete process.env.EXPO_PUBLIC_DISABLE_AI;
    }
  });

  it('renders overlay with banner when AI disabled and flag off', () => {
    const { getByTestId, getByText } = renderWithProviders(
      <UnifiedCreateOverlay visible mode="create" onClose={jest.fn()} />,
    );

    expect(getByTestId('unified-overlay')).toBeTruthy();
    expect(getByText('Add or Edit Item')).toBeTruthy();
    expect(getByTestId('ai-unavailable-banner')).toBeTruthy();
  });
});
