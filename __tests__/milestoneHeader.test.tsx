import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MilestoneHeader } from '../components/spaces/MilestoneHeader';

// Mock lucide icons
jest.mock('lucide-react-native', () => ({
  Flag: () => null,
  Plus: () => null,
  Pin: () => null,
  Settings: () => null,
}));

describe('MilestoneHeader', () => {
  const defaultProps = {
    spaceName: 'Test Space',
    milestone: null,
    countdown: { days: null, dateFormatted: null, isPast: false },
    pinnedCount: 0,
    onGremlyPress: jest.fn(),
    onAddPress: jest.fn(),
    onPinnedPress: jest.fn(),
    onNudgePress: jest.fn(),
    onSettingsPress: jest.fn(),
    onBackPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Without Milestone (Nudge State)', () => {
    it('renders space name', () => {
      const { getByText } = render(<MilestoneHeader {...defaultProps} />);
      expect(getByText('Test Space')).toBeTruthy();
    });

    it('renders nudge when no milestone', () => {
      const { getByText, getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      expect(getByText('Set a goal')).toBeTruthy();
      expect(getByText('Goals help you get things done')).toBeTruthy();
      expect(getByTestId('header-nudge-button')).toBeTruthy();
    });

    it('calls onNudgePress when nudge tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-nudge-button'));
      expect(defaultProps.onNudgePress).toHaveBeenCalled();
    });

    it('does not render pinned button when count is 0', () => {
      const { queryByTestId } = render(<MilestoneHeader {...defaultProps} />);
      expect(queryByTestId('header-pinned-button')).toBeNull();
    });
  });

  describe('With Milestone', () => {
    const milestoneProps = {
      ...defaultProps,
      milestone: {
        id: 'milestone-1',
        space_id: 'space-1',
        owner_id: 'user-1',
        name: 'Trip to Japan',
        date: '2025-06-15',
        completed: false,
        completed_at: null,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      countdown: { days: 12, dateFormatted: 'June 15', isPast: false },
    };

    it('renders milestone name', () => {
      const { getByText } = render(<MilestoneHeader {...milestoneProps} />);
      expect(getByText('Trip to Japan')).toBeTruthy();
    });

    it('renders countdown with date and days', () => {
      const { getByText } = render(<MilestoneHeader {...milestoneProps} />);
      expect(getByText(/June 15/)).toBeTruthy();
      expect(getByText(/12 days/)).toBeTruthy();
    });

    it('does not render nudge when milestone exists', () => {
      const { queryByText } = render(<MilestoneHeader {...milestoneProps} />);
      expect(queryByText('Set a goal')).toBeNull();
    });

    it('renders "Today!" for countdown of 0', () => {
      const props = {
        ...milestoneProps,
        countdown: { days: 0, dateFormatted: 'June 15', isPast: false },
      };
      const { getByText } = render(<MilestoneHeader {...props} />);
      expect(getByText(/Today!/)).toBeTruthy();
    });

    it('renders "1 day" for countdown of 1', () => {
      const props = {
        ...milestoneProps,
        countdown: { days: 1, dateFormatted: 'June 16', isPast: false },
      };
      const { getByText } = render(<MilestoneHeader {...props} />);
      expect(getByText(/1 day$/)).toBeTruthy();
    });

    it('renders past countdown correctly', () => {
      const props = {
        ...milestoneProps,
        countdown: { days: -5, dateFormatted: 'June 10', isPast: true },
      };
      const { getByText } = render(<MilestoneHeader {...props} />);
      expect(getByText(/5 days ago/)).toBeTruthy();
    });
  });

  describe('With Milestone Without Date', () => {
    const noDateProps = {
      ...defaultProps,
      milestone: {
        id: 'milestone-1',
        space_id: 'space-1',
        owner_id: 'user-1',
        name: 'Get Fit',
        date: null,
        completed: false,
        completed_at: null,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      countdown: { days: null, dateFormatted: null, isPast: false },
    };

    it('renders milestone name without countdown', () => {
      const { getByText, queryByText } = render(<MilestoneHeader {...noDateProps} />);
      expect(getByText('Get Fit')).toBeTruthy();
      expect(queryByText(/days/)).toBeNull();
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

    it('calls onAddPress when Add button tapped', () => {
      const { getByTestId } = render(<MilestoneHeader {...defaultProps} />);
      fireEvent.press(getByTestId('header-add-button'));
      expect(defaultProps.onAddPress).toHaveBeenCalled();
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
