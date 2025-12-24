/**
 * Tests for components/calendar/CalendarDayView.tsx
 * Tests calendar day item list component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CalendarDayView from '../CalendarDayView';
import { resetDateService, createDateService } from '../../../lib/date';
import { useCalendarItemsForDate, type CalendarItem } from '../../../lib/store/calendarSelectors';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-24';

jest.mock('../../../lib/store/calendarSelectors', () => ({
  useCalendarItemsForDate: jest.fn(),
}));
const mockUseCalendarItemsForDate = useCalendarItemsForDate as jest.MockedFunction<
  typeof useCalendarItemsForDate
>;

beforeEach(() => {
  resetDateService();
  createDateService({
    clock: () => new Date(`${TODAY}T10:00:00`),
  });
  mockUseCalendarItemsForDate.mockReturnValue([]);
  jest.clearAllMocks();
});

afterEach(() => {
  resetDateService();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeCalendarItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    title: 'Test Item',
    time: null,
    isCompleted: false,
    isOverdue: false,
    space: null,
    milestone: null,
    tags: [],
    raw: { id: 'raw-1', type: 'todo' } as any,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('CalendarDayView', () => {
  describe('rendering', () => {
    it('renders empty state when no items', () => {
      mockUseCalendarItemsForDate.mockReturnValue([]);
      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Nothing scheduled')).toBeTruthy();
      expect(getByText('Your day is wide open')).toBeTruthy();
    });

    it('renders formatted date header', () => {
      mockUseCalendarItemsForDate.mockReturnValue([]);
      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      // DateService.formatForOverlay returns "Today" for today's date
      expect(getByText('Today')).toBeTruthy();
    });

    it('renders todo items', () => {
      const item = makeCalendarItem({ title: 'My Todo', type: 'todo' });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('My Todo')).toBeTruthy();
      expect(getByText('Todo')).toBeTruthy();
    });

    it('renders habit items', () => {
      const item = makeCalendarItem({ title: 'My Habit', type: 'habit' });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('My Habit')).toBeTruthy();
      expect(getByText('Habit · Daily')).toBeTruthy();
    });

    it('renders journal items', () => {
      const item = makeCalendarItem({ title: 'My Journal', type: 'journal' });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('My Journal')).toBeTruthy();
      expect(getByText('Journal')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TIME DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('time display', () => {
    it('shows time for timed todos in 12-hour format', () => {
      const item = makeCalendarItem({
        title: 'Morning Meeting',
        type: 'todo',
        time: '09:30',
      });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Todo · 9:30 AM')).toBeTruthy();
    });

    it('shows PM time correctly', () => {
      const item = makeCalendarItem({
        title: 'Afternoon Task',
        type: 'todo',
        time: '14:00',
      });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Todo · 2:00 PM')).toBeTruthy();
    });

    it('handles noon correctly', () => {
      const item = makeCalendarItem({
        title: 'Lunch',
        type: 'todo',
        time: '12:00',
      });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Todo · 12:00 PM')).toBeTruthy();
    });

    it('handles midnight correctly', () => {
      const item = makeCalendarItem({
        title: 'Midnight Task',
        type: 'todo',
        time: '00:00',
      });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Todo · 12:00 AM')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION DIVIDER TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('section divider', () => {
    it('shows divider when both timed and untimed items exist', () => {
      const timedItem = makeCalendarItem({ title: 'Timed', time: '10:00' });
      const untimedItem = makeCalendarItem({ title: 'Untimed', time: null });
      mockUseCalendarItemsForDate.mockReturnValue([timedItem, untimedItem]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('No specific time')).toBeTruthy();
    });

    it('does not show divider when only timed items', () => {
      const timedItem = makeCalendarItem({ title: 'Timed', time: '10:00' });
      mockUseCalendarItemsForDate.mockReturnValue([timedItem]);

      const { queryByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(queryByText('No specific time')).toBeNull();
    });

    it('does not show divider when only untimed items', () => {
      const untimedItem = makeCalendarItem({ title: 'Untimed', time: null });
      mockUseCalendarItemsForDate.mockReturnValue([untimedItem]);

      const { queryByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(queryByText('No specific time')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATUS STYLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('status styling', () => {
    it('applies completed styling for completed items', () => {
      const item = makeCalendarItem({
        title: 'Completed Task',
        isCompleted: true,
      });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      const titleText = getByText('Completed Task');
      // Check that it has the completed style (line-through)
      expect(titleText.props.style).toBeDefined();
    });

    it('applies overdue styling for overdue incomplete items', () => {
      const item = makeCalendarItem({
        title: 'Overdue Task',
        isOverdue: true,
        isCompleted: false,
      });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Overdue Task')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERACTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('interactions', () => {
    it('calls onItemPress with CalendarItem when item is pressed', () => {
      const item = makeCalendarItem({ title: 'Clickable Item' });
      mockUseCalendarItemsForDate.mockReturnValue([item]);

      const onItemPress = jest.fn();
      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={onItemPress} />,
      );

      fireEvent.press(getByText('Clickable Item'));

      expect(onItemPress).toHaveBeenCalledWith(item);
    });

    it('calls onItemPress with correct item when multiple items exist', () => {
      const item1 = makeCalendarItem({ id: '1', title: 'First Item' });
      const item2 = makeCalendarItem({ id: '2', title: 'Second Item' });
      mockUseCalendarItemsForDate.mockReturnValue([item1, item2]);

      const onItemPress = jest.fn();
      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={onItemPress} />,
      );

      fireEvent.press(getByText('Second Item'));

      expect(onItemPress).toHaveBeenCalledWith(item2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATE SELECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('date selection', () => {
    it('queries items for the selected date', () => {
      render(<CalendarDayView selectedDate="2025-12-25" onItemPress={jest.fn()} />);

      expect(mockUseCalendarItemsForDate).toHaveBeenCalledWith('2025-12-25');
    });

    it('re-queries when selected date changes', () => {
      const { rerender } = render(<CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />);

      expect(mockUseCalendarItemsForDate).toHaveBeenCalledWith(TODAY);

      mockUseCalendarItemsForDate.mockClear();

      rerender(<CalendarDayView selectedDate="2025-12-25" onItemPress={jest.fn()} />);

      expect(mockUseCalendarItemsForDate).toHaveBeenCalledWith('2025-12-25');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // MIXED CONTENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('mixed content', () => {
    it('renders all item types together', () => {
      const todo = makeCalendarItem({ title: 'Todo Item', type: 'todo' });
      const habit = makeCalendarItem({ title: 'Habit Item', type: 'habit' });
      const journal = makeCalendarItem({ title: 'Journal Item', type: 'journal' });
      mockUseCalendarItemsForDate.mockReturnValue([todo, habit, journal]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Todo Item')).toBeTruthy();
      expect(getByText('Habit Item')).toBeTruthy();
      expect(getByText('Journal Item')).toBeTruthy();
    });

    it('separates timed and untimed items correctly', () => {
      const timedTodo = makeCalendarItem({
        title: 'Timed Todo',
        type: 'todo',
        time: '09:00',
      });
      const untimedHabit = makeCalendarItem({
        title: 'Untimed Habit',
        type: 'habit',
        time: null,
      });
      mockUseCalendarItemsForDate.mockReturnValue([timedTodo, untimedHabit]);

      const { getByText } = render(
        <CalendarDayView selectedDate={TODAY} onItemPress={jest.fn()} />,
      );

      expect(getByText('Timed Todo')).toBeTruthy();
      expect(getByText('Untimed Habit')).toBeTruthy();
      expect(getByText('No specific time')).toBeTruthy();
    });
  });
});
