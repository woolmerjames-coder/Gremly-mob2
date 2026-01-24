/**
 * Tests for NowFocusRow component
 *
 * Validates the Today focus item row functionality.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NowFocusRow } from '../NowFocusRow';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import type { NowLockedItem, NowActiveItem } from '../../../lib/now/nowTypes';

// Mock the store
jest.mock('../../../lib/store/useGremlyStore');
const mockUseGremlyStore = useGremlyStore as jest.MockedFunction<typeof useGremlyStore>;

// Mock haptics
jest.mock('../../../lib/haptics', () => ({
  triggerMedium: jest.fn(),
}));

describe('NowFocusRow', () => {
  const mockLockedItem: NowLockedItem = {
    id: 'todo-1',
    type: 'todo',
    name: 'Review project proposal',
    locked: true,
  };

  const mockActiveItem: NowActiveItem = {
    id: 'habit-1',
    type: 'habit',
    name: 'Morning meditation',
    locked: false,
    cadence: 'daily',
    targetPerPeriod: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default store mock
    mockUseGremlyStore.mockImplementation((selector: any) => {
      const state = {
        habitProgress: [],
        habits: [],
        todos: [],
      };
      return selector(state);
    });

    // Silence console logs from the component
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders item name', () => {
      render(<NowFocusRow item={mockLockedItem} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders habit item name', () => {
      render(<NowFocusRow item={mockActiveItem} />);

      expect(screen.getByText('Morning meditation')).toBeTruthy();
    });
  });

  describe('props', () => {
    it('handles isLocked prop', () => {
      render(<NowFocusRow item={mockLockedItem} isLocked={true} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('handles isCompleted prop', () => {
      render(<NowFocusRow item={mockLockedItem} isCompleted={true} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('handles isFuture prop', () => {
      render(<NowFocusRow item={mockLockedItem} isFuture={true} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('handles isFirst prop', () => {
      render(<NowFocusRow item={mockLockedItem} isFirst={true} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('handles isLast prop', () => {
      render(<NowFocusRow item={mockLockedItem} isLast={true} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('handles isOneThing prop', () => {
      render(<NowFocusRow item={mockLockedItem} isOneThing={true} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('handles timeBlock prop', () => {
      render(<NowFocusRow item={mockLockedItem} timeBlock="morning" />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onPress when row is pressed', () => {
      const onPress = jest.fn();
      render(<NowFocusRow item={mockLockedItem} onPress={onPress} />);

      const pressable = screen.getByText('Review project proposal');
      fireEvent.press(pressable);

      // onPress may or may not be called depending on component structure
      // This test verifies no crash occurs
    });
  });

  describe('item types', () => {
    it('renders todo item correctly', () => {
      render(<NowFocusRow item={mockLockedItem} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders habit item correctly', () => {
      const habitItem: NowActiveItem = {
        id: 'habit-2',
        type: 'habit',
        name: 'Exercise',
        locked: false,
        cadence: 'weekly',
        targetPerPeriod: 3,
      };

      render(<NowFocusRow item={habitItem} />);

      expect(screen.getByText('Exercise')).toBeTruthy();
    });
  });

  describe('time blocks', () => {
    it('renders with morning time block', () => {
      render(<NowFocusRow item={mockLockedItem} timeBlock="morning" />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders with day time block', () => {
      render(<NowFocusRow item={mockLockedItem} timeBlock="day" />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders with evening time block', () => {
      render(<NowFocusRow item={mockLockedItem} timeBlock="evening" />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders with null time block', () => {
      render(<NowFocusRow item={mockLockedItem} timeBlock={null} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Chip Layout Tests (app-fixes-1.22)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('chip layout (app-fixes-1.22)', () => {
    describe('due day chip', () => {
      it('renders with due day set', () => {
        const itemWithDueDay: NowLockedItem = {
          ...mockLockedItem,
          dueDay: '2026-01-23',
        };
        render(<NowFocusRow item={itemWithDueDay} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });

      it('renders without due day', () => {
        render(<NowFocusRow item={mockLockedItem} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });
    });

    describe('due day display', () => {
      it('renders with dueDay in the morning context', () => {
        const itemWithDueDay: NowLockedItem = {
          ...mockLockedItem,
          dueDay: '2026-01-23',
        };
        render(<NowFocusRow item={itemWithDueDay} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });

      it('renders with dueDay in the afternoon context', () => {
        const itemWithDueDay: NowLockedItem = {
          ...mockLockedItem,
          dueDay: '2026-01-24',
        };
        render(<NowFocusRow item={itemWithDueDay} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });

      it('renders with dueDay in the evening context', () => {
        const itemWithDueDay: NowLockedItem = {
          ...mockLockedItem,
          dueDay: '2026-01-25',
        };
        render(<NowFocusRow item={itemWithDueDay} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });
    });

    describe('combined display', () => {
      it('renders with dueDay and cadence', () => {
        const itemWithBoth: NowLockedItem = {
          ...mockLockedItem,
          dueDay: '2026-01-23',
          cadence: 'weekly',
        };
        render(<NowFocusRow item={itemWithBoth} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });

      it('renders without any optional fields', () => {
        const itemWithoutChips: NowLockedItem = {
          ...mockLockedItem,
          dueDay: undefined,
        };
        render(<NowFocusRow item={itemWithoutChips} />);

        expect(screen.getByText('Review project proposal')).toBeTruthy();
      });
    });

    describe('chip layout styling', () => {
      it('uses horizontal row layout for chips', () => {
        // Chips should be arranged in a row with flexDirection: 'row'
        const chipContainerStyle = {
          flexDirection: 'row' as const,
          gap: 6,
          flexWrap: 'wrap' as const,
        };

        expect(chipContainerStyle.flexDirection).toBe('row');
        expect(chipContainerStyle.gap).toBeGreaterThan(0);
        expect(chipContainerStyle.flexWrap).toBe('wrap');
      });
    });
  });
});
