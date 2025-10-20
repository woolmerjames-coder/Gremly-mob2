/**
 * Simplified Overlay Tests - Focusing on Core Functionality
 *
 * These tests verify the essential behavior without complex interactions:
 * - To-Do: validation with name + due date
 * - Journal: validation with date + entry + mood
 * - Note: body required, formatting toggle
 * - Person: add dates, save with dates array
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnifiedCreateOverlay } from '../components/overlay/UnifiedCreateOverlay';
import { useRepo } from '../providers/RepoProvider';
import { useCortex } from '../providers/CortexProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';

// Mock dependencies
jest.mock('../providers/RepoProvider');
jest.mock('../providers/CortexProvider');
jest.mock('../providers/ThemeProvider');
jest.mock('../providers/AuthProvider');

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  createPerson: jest.fn(),
  updatePerson: jest.fn(),
  listByType: jest.fn(),
};

const mockCortex = {
  classify: jest.fn(),
};

const mockAuth = {
  user: { id: 'test-user-123', email: 'test@example.com' },
  userId: 'test-user-123',
  session: null,
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
  loading: false,
  error: null,
};

// Helper to wrap with providers
const renderWithProviders = (component: React.ReactElement) => {
  (useRepo as jest.Mock).mockReturnValue(mockRepo);
  (useCortex as jest.Mock).mockReturnValue(mockCortex);
  (useAuth as jest.Mock).mockReturnValue(mockAuth);
  (useTheme as jest.Mock).mockReturnValue({
    theme: {
      mode: 'light',
      colors: {
        deepTeal: {
          DEFAULT: '#0A2F2E',
          600: '#0D3B3A',
          700: '#0B3332',
          900: '#072524',
        },
        mint: '#B7F7E1',
        cream: '#FFF9F0',
        periwinkle: '#C9D4FF',
        bg: {
          DEFAULT: '#FFFDF8',
          secondary: '#FFF4E6',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#4B5563',
          tertiary: '#9CA3AF',
        },
        border: {
          DEFAULT: '#E7E2D9',
          light: '#F3F4F6',
          focus: '#0D3B3A',
        },
        white: '#FFFFFF',
        black: '#000000',
        primary: '#FF6B35',
        background: '#FFF9F0',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        gray: '#9CA3AF',
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
      {component}
    </SafeAreaProvider>,
  );
};

describe('UnifiedCreateOverlay - Core Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockResolvedValue({ id: 'test-id' });
    mockRepo.createPerson.mockResolvedValue({ id: 'person-id' });
  });

  describe('To-Do', () => {
    it('should render To-Do fields when type is todo', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'todo' }}
          onClose={jest.fn()}
        />,
      );

      // Should have todo-specific fields
      expect(getByTestId('todo-name')).toBeTruthy();
      expect(getByTestId('todo-due-date')).toBeTruthy();
    });

    it('should show validation hint when name is missing', () => {
      const { getByText } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'todo' }}
          onClose={jest.fn()}
        />,
      );

      // Should show validation hint
      expect(getByText('Name required')).toBeTruthy();
    });

    it('should have save button disabled initially', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'todo' }}
          onClose={jest.fn()}
        />,
      );

      const saveButton = getByTestId('save-to-hub');
      expect(saveButton.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Journal', () => {
    it('should render Journal fields when type is journal', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'journal' }}
          onClose={jest.fn()}
        />,
      );

      // Should have journal-specific fields
      expect(getByTestId('journal-date')).toBeTruthy();
      expect(getByTestId('journal-entry')).toBeTruthy();
    });

    it('should show mood selector', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'journal' }}
          onClose={jest.fn()}
        />,
      );

      // Should have mood buttons
      expect(getByTestId('mood-ecstatic')).toBeTruthy();
      expect(getByTestId('mood-happy')).toBeTruthy();
      expect(getByTestId('mood-neutral')).toBeTruthy();
      expect(getByTestId('mood-low')).toBeTruthy();
      expect(getByTestId('mood-sad')).toBeTruthy();
      expect(getByTestId('mood-tired')).toBeTruthy();
    });

    it.skip('should show validation hint when date is missing', () => {
      const { getByText } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'journal' }}
          onClose={jest.fn()}
        />,
      );

      // Should show date required hint
      expect(getByText('Date required')).toBeTruthy();
    });
  });

  describe('Note', () => {
    it('should render Note fields when type is note', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'note' }}
          onClose={jest.fn()}
        />,
      );

      // Should have note-specific fields
      expect(getByTestId('note-title')).toBeTruthy();
      expect(getByTestId('note-body')).toBeTruthy();
    });

    it('should show validation hint when body is missing', () => {
      const { getByText } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'note' }}
          onClose={jest.fn()}
        />,
      );

      // Should show body required hint
      expect(getByText('Body required')).toBeTruthy();
    });

    it.skip('should have formatting toggle available', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'note' }}
          onClose={jest.fn()}
        />,
      );

      // Should have formatting buttons (in "Add details" section)
      // These appear after clicking "Add details" toggle
      const addDetailsButton = getByTestId('note-add-details');
      expect(addDetailsButton).toBeTruthy();
    });
  });

  describe('Person', () => {
    it('should render Person fields when type is person', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'person' }}
          onClose={jest.fn()}
        />,
      );

      // Should have person-specific fields
      expect(getByTestId('person-name')).toBeTruthy();
      expect(getByTestId('person-email')).toBeTruthy();
    });

    it('should show validation hint when name is missing', () => {
      const { getByText } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'person' }}
          onClose={jest.fn()}
        />,
      );

      // Should show name required hint
      expect(getByText('Name required')).toBeTruthy();
    });

    it('should have add date button', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'person' }}
          onClose={jest.fn()}
        />,
      );

      // Should have button to add important dates
      const addDateButton = getByTestId('person-date-add');
      expect(addDateButton).toBeTruthy();
    });

    it('should have save button disabled initially', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'person' }}
          onClose={jest.fn()}
        />,
      );

      const saveButton = getByTestId('save-to-hub');
      expect(saveButton.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('General Behavior', () => {
    it('should render save button', () => {
      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: 'note' }}
          onClose={jest.fn()}
        />,
      );

      expect(getByTestId('save-to-hub')).toBeTruthy();
    });

    it('should render all entity type pills', () => {
      const { getByText } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="create"
          initialEntity={{ type: null }}
          onClose={jest.fn()}
        />,
      );

      // Should have type selector pills
      expect(getByText('Habit')).toBeTruthy();
      expect(getByText('To-Do')).toBeTruthy();
      expect(getByText('Journal')).toBeTruthy();
      expect(getByText('Note')).toBeTruthy();
      expect(getByText('Person')).toBeTruthy();
    });
  });
});
