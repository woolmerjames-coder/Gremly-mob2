import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MilestoneHeader } from '../components/spaces/MilestoneHeader';

// Mock lucide icons
jest.mock('lucide-react-native', () => ({
  Flag: () => null,
  Pin: () => null,
  MoreHorizontal: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  CheckCircle2: () => null,
  Calendar: () => null,
}));

// Mock mascot config
jest.mock('../lib/mascots/mascotConfig', () => ({
  getMascotSource: () => 0,
  DEFAULT_MASCOT_ID: 'default',
}));

describe('MilestoneHeader', () => {
  const defaultProps = {
    spaceName: 'Test Space',
    pinnedCount: 0,
    onGremlyPress: jest.fn(),
    onPinnedPress: jest.fn(),
    onKeyDatesPress: jest.fn(),
    onSettingsPress: jest.fn(),
    onBackPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Without Goals (Nudge State)', () => {
    it('renders space name', () => {
      const { getByText } = render(<MilestoneHeader {...defaultProps} />);
      expect(getByText('Test Space')).toBeTruthy();
    });

    it('renders nudge when no goals', () => {
      const { getByText, getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      expect(getByText('Set a goal')).toBeTruthy();
      expect(getByText('Goals help you get things done')).toBeTruthy();
      expect(getByTestId('header-nudge-button')).toBeTruthy();
    });

    it('calls onKeyDatesPress when nudge tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-nudge-button'));
      expect(defaultProps.onKeyDatesPress).toHaveBeenCalled();
    });

    it('does not render pinned button when count is 0', () => {
      const { queryByTestId } = render(<MilestoneHeader {...defaultProps} />);
      expect(queryByTestId('header-pinned-button')).toBeNull();
    });
  });

  describe('With Goals', () => {
    const goalNote = {
      id: 'goal-1',
      title: 'Trip to Japan',
      content: '',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const goalProps = {
      ...defaultProps,
      goals: [goalNote] as any[],
    };

    it('renders goal title', () => {
      const { getByText } = render(<MilestoneHeader {...goalProps} />);
      expect(getByText('Trip to Japan')).toBeTruthy();
    });

    it('does not render nudge when goals exist', () => {
      const { queryByText } = render(<MilestoneHeader {...goalProps} />);
      expect(queryByText('Set a goal')).toBeNull();
    });

    it('calls onKeyDatesPress when goal tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...goalProps} />);
      fireEvent.press(getByTestId('header-goal-button'));
      expect(defaultProps.onKeyDatesPress).toHaveBeenCalled();
    });

    it('renders additional goals count when multiple goals', () => {
      const multiGoalProps = {
        ...defaultProps,
        goals: [
          goalNote,
          { ...goalNote, id: 'goal-2', title: 'Learn Japanese' },
          { ...goalNote, id: 'goal-3', title: 'Save Money' },
        ] as any[],
      };
      const { getByText } = render(<MilestoneHeader {...multiGoalProps} />);
      expect(getByText('+2 more')).toBeTruthy();
    });
  });

  describe('With goalEvent (backward compatibility)', () => {
    const goalEventProps = {
      ...defaultProps,
      goalEvent: {
        id: 'note-1',
        title: 'Get Fit',
        content: '',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      } as any,
    };

    it('renders goalEvent title when no goals array', () => {
      const { getByText } = render(<MilestoneHeader {...goalEventProps} />);
      expect(getByText('Get Fit')).toBeTruthy();
    });

    it('does not render nudge when goalEvent exists', () => {
      const { queryByText } = render(<MilestoneHeader {...goalEventProps} />);
      expect(queryByText('Set a goal')).toBeNull();
    });
  });

  describe('Key Dates Row', () => {
    it('always renders Key Dates row', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      expect(getByTestId('header-key-dates-button')).toBeTruthy();
    });

    it('shows key dates count when provided', () => {
      const { getByText } = render(<MilestoneHeader {...defaultProps} keyDatesCount={5} />);
      expect(getByText('(5)')).toBeTruthy();
    });

    it('calls onKeyDatesPress when key dates tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-key-dates-button'));
      expect(defaultProps.onKeyDatesPress).toHaveBeenCalled();
    });
  });

  describe('Pinned Button', () => {
    it('renders pinned button when count > 0', () => {
      const { getByTestId, getByText } = render(
        <MilestoneHeader {...defaultProps} pinnedCount={3} />,
      );
      expect(getByTestId('header-pinned-button')).toBeTruthy();
      expect(getByText('3 pinned')).toBeTruthy();
    });

    it('calls onPinnedPress when pinned button tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} pinnedCount={3} />);
      fireEvent.press(getByTestId('header-pinned-button'));
      expect(defaultProps.onPinnedPress).toHaveBeenCalled();
    });
  });

  describe('Tap Handlers', () => {
    it('calls onGremlyPress when Gremly tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-gremly-button'));
      expect(defaultProps.onGremlyPress).toHaveBeenCalled();
    });

    it('calls onSettingsPress when settings tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-settings-button'));
      expect(defaultProps.onSettingsPress).toHaveBeenCalled();
    });

    it('calls onBackPress when back arrow tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-back-button'));
      expect(defaultProps.onBackPress).toHaveBeenCalled();
    });
  });
});
