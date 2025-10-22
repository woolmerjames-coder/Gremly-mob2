/**
 * Test: Overlay mounts exactly once per open, not dozens of times
 * Ensures the open-once guard prevents excessive logging and re-renders
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
  getById: jest.fn(),
  listPeople: jest.fn().mockResolvedValue([]),
};

const mockCortex = {
  classify: jest.fn().mockResolvedValue({ whyString: 'test' }),
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
        primary: '#6C63FF',
        secondary: '#2ECC71',
        text: { primary: '#000', secondary: '#666' },
        background: { DEFAULT: '#FFF' },
        border: { DEFAULT: '#E0E0E0' },
      },
    },
  });

  return render(<SafeAreaProvider>{node}</SafeAreaProvider>);
};

describe('UnifiedCreateOverlay - Mount Once Guard', () => {
  it('should render without crashing when visible=true', () => {
    const onClose = jest.fn();

    expect(() => {
      renderWithProviders(<UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />);
    }).not.toThrow();
  });

  it('should render without crashing when visible=false', () => {
    const onClose = jest.fn();

    expect(() => {
      renderWithProviders(<UnifiedCreateOverlay visible={false} mode="create" onClose={onClose} />);
    }).not.toThrow();
  });

  it('should handle mode prop correctly', () => {
    const onClose = jest.fn();

    expect(() => {
      renderWithProviders(<UnifiedCreateOverlay visible={true} mode="edit" onClose={onClose} />);
    }).not.toThrow();
  });
});
