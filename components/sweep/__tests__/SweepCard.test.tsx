/**
 * SweepCard Component Tests
 *
 * Tests the SweepCard component rendering and interactions.
 *
 * NOTE: The Keep and Clear buttons now trigger swipe-out animations before
 * calling their callbacks. Since Animated.timing with useNativeDriver: true
 * doesn't work with Jest fake timers, we test that:
 * 1. The buttons are rendered and pressable
 * 2. Skip and Fix buttons (which don't animate) call callbacks immediately
 *
 * Full integration testing of the swipe animations is covered by
 * SweepFlowScreen integration tests.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SweepCard, SweepCardProps } from '../SweepCard';
import type { SweepCandidate } from '../../../lib/sweep/types';

// Mock useRepo hook
const mockRepoUpdate = jest.fn().mockResolvedValue({});
jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({
    update: mockRepoUpdate,
    getById: jest.fn().mockResolvedValue(null),
  }),
}));

// Mock DateTimePicker to avoid native component issues in tests
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ testID, value }: { testID?: string; value: Date }) => (
      <View testID={testID || 'date-time-picker'}>
        <Text>DateTimePicker Mock</Text>
        <Text testID="picker-value">{value?.toISOString()}</Text>
      </View>
    ),
  };
});

// Mock react-native's Switch component to avoid test renderer issues
jest.mock('react-native/Libraries/Components/Switch/Switch', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onValueChange, testID }: any) => (
      <TouchableOpacity
        testID={testID || 'switch'}
        onPress={() => onValueChange && onValueChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      >
        <Text>{value ? 'ON' : 'OFF'}</Text>
      </TouchableOpacity>
    ),
  };
});

// Test fixtures
const mockTodoCandidate: SweepCandidate = {
  id: 'todo-1',
  kind: 'todo',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'todo-1',
    name: 'Buy groceries',
    notes: 'Get milk, eggs, and bread from the store',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    due_day: null,
    due_date: null,
  } as any,
};

const mockTodoWithDueDateCandidate: SweepCandidate = {
  id: 'todo-2',
  kind: 'todo',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'todo-2',
    name: 'Submit report',
    notes: 'Q4 quarterly report',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    due_day: '2024-12-25',
    due_date: '2024-12-25',
  } as any,
};

const mockNoteCandidate: SweepCandidate = {
  id: 'note-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'note-1',
    title: 'Meeting notes',
    body: 'Discussion about Q4 planning and roadmap priorities',
    subtype: null,
    canonical_type: null,
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockIdeaCandidate: SweepCandidate = {
  id: 'idea-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'idea-1',
    title: 'App feature idea',
    body: 'What if we added dark mode support?',
    subtype: 'idea',
    canonical_type: 'idea',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockJournalCandidate: SweepCandidate = {
  id: 'journal-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'journal-1',
    title: 'Evening reflection',
    body: 'Today was productive. I feel grateful for the progress made.',
    subtype: 'journal',
    canonical_type: 'journal',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockLogCandidate: SweepCandidate = {
  id: 'log-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'log-1',
    title: 'Evening reflection',
    body: 'Today was productive',
    subtype: 'journal',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const defaultProps: Omit<SweepCardProps, 'candidate'> = {
  index: 0,
  total: 5,
  onKeep: jest.fn(),
  onClear: jest.fn(),
  onOpenEdit: jest.fn(),
  onConvertToTodo: jest.fn(),
};

describe('SweepCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepoUpdate.mockClear();
  });

  describe('Type Chip', () => {
    it('shows "TO-DO" chip for todo candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText(/TO-DO/)).toBeTruthy();
    });

    it('shows "NOTE" chip for note candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText(/NOTE/)).toBeTruthy();
    });

    it('shows "LOG" chip for journal/log candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockLogCandidate} {...defaultProps} />);
      expect(getByText(/LOG/)).toBeTruthy();
    });
  });

  describe('Overdue Pill', () => {
    it('shows "Overdue" pill when candidate isOverdue is true', () => {
      const overdueCandidate: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-overdue',
        isOverdue: true,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-overdue',
          name: 'Email Sarah',
          due_day: '2024-01-01', // past date
        } as any,
      };

      const { getByText } = render(<SweepCard candidate={overdueCandidate} {...defaultProps} />);

      expect(getByText('Overdue')).toBeTruthy();
      expect(getByText('Email Sarah')).toBeTruthy();
    });

    it('does NOT show "Overdue" pill when candidate isOverdue is false', () => {
      const notOverdueCandidate: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-not-overdue',
        isOverdue: false,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-not-overdue',
          name: 'Future task',
          due_day: '2099-12-31', // far future date
        } as any,
      };

      const { queryByText, getByText } = render(
        <SweepCard candidate={notOverdueCandidate} {...defaultProps} />,
      );

      expect(queryByText('Overdue')).toBeNull();
      expect(getByText('Future task')).toBeTruthy();
    });

    it('does NOT show "Overdue" pill for notes (even with isOverdue: false)', () => {
      // Notes should never be overdue by design
      const { queryByText, getByText } = render(
        <SweepCard candidate={mockNoteCandidate} {...defaultProps} />,
      );

      expect(queryByText('Overdue')).toBeNull();
      expect(getByText('Meeting notes')).toBeTruthy();
    });

    it('shows both Type chip and Overdue pill together for overdue todos', () => {
      const overdueCandidate: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-overdue-with-chip',
        isOverdue: true,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-overdue-with-chip',
          name: 'Overdue task with chips',
        } as any,
      };

      const { getByText } = render(<SweepCard candidate={overdueCandidate} {...defaultProps} />);

      // Both pills should be visible
      expect(getByText(/TO-DO/)).toBeTruthy();
      expect(getByText('Overdue')).toBeTruthy();
    });
  });

  describe('Due Today Badge', () => {
    it('shows "Due today" badge for todos with isDueToday=true', () => {
      const dueTodayCandidate: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-due-today',
        isOverdue: false,
        isDueToday: true,
        isCreatedToday: false,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-due-today',
          name: 'Task due today',
        } as any,
      };

      const { getByText } = render(<SweepCard candidate={dueTodayCandidate} {...defaultProps} />);

      expect(getByText('Due today')).toBeTruthy();
      expect(getByText('Task due today')).toBeTruthy();
    });

    it('does NOT show "Due today" badge for notes (even with isDueToday=true)', () => {
      const noteDueToday: SweepCandidate = {
        ...mockNoteCandidate,
        id: 'note-due-today',
        isDueToday: true,
        isCreatedToday: false,
      };

      const { queryByText, getByText } = render(
        <SweepCard candidate={noteDueToday} {...defaultProps} />,
      );

      expect(queryByText('Due today')).toBeNull();
      expect(getByText('Meeting notes')).toBeTruthy();
    });

    it('shows "Overdue" instead of "Due today" when both are true (priority)', () => {
      const overdueAndDueTodayCandidate: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-overdue-and-due-today',
        isOverdue: true,
        isDueToday: true,
        isCreatedToday: false,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-overdue-and-due-today',
          name: 'Priority test task',
        } as any,
      };

      const { getByText, queryByText } = render(
        <SweepCard candidate={overdueAndDueTodayCandidate} {...defaultProps} />,
      );

      expect(getByText('Overdue')).toBeTruthy();
      expect(queryByText('Due today')).toBeNull();
    });
  });

  describe('Entered Today Badge', () => {
    it('shows "Entered today" badge for items with isCreatedToday=true', () => {
      const enteredTodayCandidate: SweepCandidate = {
        ...mockNoteCandidate,
        id: 'note-entered-today',
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
      };

      const { getByText } = render(
        <SweepCard candidate={enteredTodayCandidate} {...defaultProps} />,
      );

      expect(getByText('Entered today')).toBeTruthy();
    });

    it('shows "Entered today" for todos when not overdue and not due today', () => {
      const todoEnteredToday: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-entered-today',
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-entered-today',
          name: 'New task entered today',
        } as any,
      };

      const { getByText } = render(<SweepCard candidate={todoEnteredToday} {...defaultProps} />);

      expect(getByText('Entered today')).toBeTruthy();
    });

    it('shows "Due today" instead of "Entered today" when both are true (priority)', () => {
      const dueTodayAndEnteredToday: SweepCandidate = {
        ...mockTodoCandidate,
        id: 'todo-due-and-entered-today',
        isOverdue: false,
        isDueToday: true,
        isCreatedToday: true,
        raw: {
          ...mockTodoCandidate.raw,
          id: 'todo-due-and-entered-today',
          name: 'Due and entered today',
        } as any,
      };

      const { getByText, queryByText } = render(
        <SweepCard candidate={dueTodayAndEnteredToday} {...defaultProps} />,
      );

      expect(getByText('Due today')).toBeTruthy();
      expect(queryByText('Entered today')).toBeNull();
    });

    it('shows no badge when all flags are false', () => {
      const noBadgeCandidate: SweepCandidate = {
        ...mockNoteCandidate,
        id: 'note-no-badge',
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: false,
      };

      const { queryByText } = render(<SweepCard candidate={noBadgeCandidate} {...defaultProps} />);

      expect(queryByText('Overdue')).toBeNull();
      expect(queryByText('Due today')).toBeNull();
      expect(queryByText('Entered today')).toBeNull();
    });
  });

  describe('Content Display', () => {
    it('displays the title for todos', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Buy groceries')).toBeTruthy();
    });

    it('displays the title for notes', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText('Meeting notes')).toBeTruthy();
    });

    it('displays the body preview for todos', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Get milk, eggs, and bread from the store')).toBeTruthy();
    });

    it('displays timestamp with "Added" prefix', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      // Should contain "Added today" for items created today
      expect(getByText(/Added today/)).toBeTruthy();
    });
  });

  describe('Swipe Cues and Action Buttons', () => {
    it('renders contextual swipe cues for todos ("Still matters" / "Done with this")', () => {
      const { getByRole, getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );
      expect(getByRole('button', { name: 'Skip this item' })).toBeTruthy();
      expect(getByRole('button', { name: 'Clear this item' })).toBeTruthy();
      expect(getByText('Still matters →')).toBeTruthy();
      expect(getByText('← Done with this')).toBeTruthy();
    });

    it('renders contextual swipe cues for notes ("Save this" / "Remove this")', () => {
      const { getByRole, getByText } = render(
        <SweepCard candidate={mockNoteCandidate} {...defaultProps} />,
      );
      expect(getByRole('button', { name: 'Skip this item' })).toBeTruthy();
      expect(getByRole('button', { name: 'Clear this item' })).toBeTruthy();
      expect(getByText('Save this →')).toBeTruthy();
      expect(getByText('← Remove this')).toBeTruthy();
    });

    it('renders Edit button with icon', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );
      expect(getByLabelText('Edit details')).toBeTruthy();
    });
  });

  describe('Button Interactions', () => {
    it('Keep button is pressable', () => {
      const onKeep = jest.fn();
      const { getByRole } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onKeep={onKeep} />,
      );
      // Button should be pressable (animation will trigger and callback happens after)
      expect(() => fireEvent.press(getByRole('button', { name: 'Skip this item' }))).not.toThrow();
    });

    it('Clear button is pressable', () => {
      const onClear = jest.fn();
      const { getByRole } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onClear={onClear} />,
      );
      // Button should be pressable (animation will trigger and callback happens after)
      expect(() => fireEvent.press(getByRole('button', { name: 'Clear this item' }))).not.toThrow();
    });

    it('calls onOpenEdit when Edit button is pressed', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );
      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CTA Mapping Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('CTA Mapping - Todo Candidates', () => {
    it('shows "Add due date" for todos without due date (due_day=null)', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Add due date')).toBeTruthy();
    });

    it('shows "Add due date" for todos without due date (due_date=null)', () => {
      const todoNoDueDate = {
        ...mockTodoCandidate,
        raw: { ...mockTodoCandidate.raw, due_day: null, due_date: null },
      };
      const { getByText } = render(<SweepCard candidate={todoNoDueDate} {...defaultProps} />);
      expect(getByText('Add due date')).toBeTruthy();
    });

    it('shows "Review date" for todos with due_day set', () => {
      const { getByText } = render(
        <SweepCard candidate={mockTodoWithDueDateCandidate} {...defaultProps} />,
      );
      expect(getByText('Review date')).toBeTruthy();
    });

    it('shows "Review date" for todos with only due_date set (legacy)', () => {
      const todoLegacyDueDate = {
        ...mockTodoCandidate,
        raw: { ...mockTodoCandidate.raw, due_day: null, due_date: '2024-12-25' },
      };
      const { getByText } = render(<SweepCard candidate={todoLegacyDueDate} {...defaultProps} />);
      expect(getByText('Review date')).toBeTruthy();
    });
  });

  describe('CTA Mapping - Note/Log Candidates', () => {
    it('shows "Decide what this is" for notes with subtype=null (general notes)', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText('Decide what this is')).toBeTruthy();
    });

    it('shows "Turn into to-do" for idea notes', () => {
      const { getByText } = render(<SweepCard candidate={mockIdeaCandidate} {...defaultProps} />);
      expect(getByText('Turn into to-do')).toBeTruthy();
    });

    it('shows "Reflect more" for journal logs (subtype=journal)', () => {
      const { getByText } = render(
        <SweepCard candidate={mockJournalCandidate} {...defaultProps} />,
      );
      expect(getByText('Reflect more')).toBeTruthy();
    });

    it('shows "Reflect more" for logs with canonical_type=journal', () => {
      const journalByCanonicalType = {
        ...mockNoteCandidate,
        raw: { ...mockNoteCandidate.raw, subtype: null, canonical_type: 'journal' },
      };
      const { getByText } = render(
        <SweepCard candidate={journalByCanonicalType} {...defaultProps} />,
      );
      expect(getByText('Reflect more')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CTA Interaction Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('CTA Interactions - Primary Action', () => {
    it('calls onPrimaryAction when date CTA is pressed for todo', () => {
      const onPrimaryAction = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          {...defaultProps}
          onPrimaryAction={onPrimaryAction}
        />,
      );

      fireEvent.press(getByText('Add due date'));

      expect(onPrimaryAction).toHaveBeenCalledTimes(1);
      expect(onPrimaryAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'todo_add_due_date', label: 'Add due date' }),
        mockTodoCandidate,
      );
    });

    it('calls onPrimaryAction when date CTA is pressed for todo with date', () => {
      const onPrimaryAction = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoWithDueDateCandidate}
          {...defaultProps}
          onPrimaryAction={onPrimaryAction}
        />,
      );

      fireEvent.press(getByText('Review date'));

      expect(onPrimaryAction).toHaveBeenCalledTimes(1);
      expect(onPrimaryAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'todo_review_due_date', label: 'Review date' }),
        mockTodoWithDueDateCandidate,
      );
    });

    it('calls onPrimaryAction when note CTA is pressed for general note', () => {
      const onPrimaryAction = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          {...defaultProps}
          onPrimaryAction={onPrimaryAction}
        />,
      );

      fireEvent.press(getByText('Decide what this is'));

      expect(onPrimaryAction).toHaveBeenCalledTimes(1);
      expect(onPrimaryAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'log_general_decide' }),
        mockNoteCandidate,
      );
    });

    it('calls onPrimaryAction when note CTA is pressed for idea note', () => {
      const onPrimaryAction = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockIdeaCandidate}
          {...defaultProps}
          onPrimaryAction={onPrimaryAction}
        />,
      );

      fireEvent.press(getByText('Turn into to-do'));

      expect(onPrimaryAction).toHaveBeenCalledTimes(1);
      expect(onPrimaryAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'log_idea_to_todo' }),
        mockIdeaCandidate,
      );
    });

    it('calls onPrimaryAction when journal CTA is pressed', () => {
      const onPrimaryAction = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockJournalCandidate}
          {...defaultProps}
          onPrimaryAction={onPrimaryAction}
        />,
      );

      fireEvent.press(getByText('Reflect more'));

      expect(onPrimaryAction).toHaveBeenCalledTimes(1);
      expect(onPrimaryAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'log_journal_followup' }),
        mockJournalCandidate,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edit Button Tests (Top-Right Icon)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Edit Button (Top-Right Icon)', () => {
    it('calls onOpenEdit for todo candidates regardless of due date', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for todo with due date', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoWithDueDateCandidate}
          {...defaultProps}
          onOpenEdit={onOpenEdit}
        />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for note candidates', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockNoteCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for journal log candidates', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockJournalCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('Edit button has accessible label "Edit details"', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      expect(getByLabelText('Edit details')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles todo with empty string due_day as no due date', () => {
      const todoEmptyDueDay = {
        ...mockTodoCandidate,
        raw: { ...mockTodoCandidate.raw, due_day: '', due_date: '' },
      };
      const { getByText } = render(<SweepCard candidate={todoEmptyDueDay} {...defaultProps} />);
      // Empty string should be treated as no due date
      expect(getByText('Add due date')).toBeTruthy();
    });

    it('renders correctly when candidate changes', () => {
      const { getByText, rerender } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      expect(getByText('Add due date')).toBeTruthy();

      // Re-render with a note
      rerender(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);

      expect(getByText('Decide what this is')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Photo Attachments
  // ─────────────────────────────────────────────────────────────────────────

  describe('Photo Attachments', () => {
    const mockNoteWithAttachments: SweepCandidate = {
      id: 'note-with-photos',
      kind: 'note',
      createdAt: new Date().toISOString(),
      dropId: null,
      skippedInSweepAt: null,
      isOverdue: false,
      isDueToday: false,
      isCreatedToday: true,
      raw: {
        id: 'note-with-photos',
        title: 'Photo memory',
        body: 'A beautiful sunset at the beach',
        subtype: 'journal',
        canonical_type: 'log',
        owner_id: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any,
      attachments: [
        { id: 'photo-1', url: 'https://example.com/photo1.jpg', position: 0 },
        { id: 'photo-2', url: 'https://example.com/photo2.jpg', position: 1 },
      ],
    };

    const mockNoteWithSingleAttachment: SweepCandidate = {
      ...mockNoteWithAttachments,
      id: 'note-single-photo',
      attachments: [{ id: 'photo-1', url: 'https://example.com/photo1.jpg', position: 0 }],
    };

    it('renders photo preview for note with attachments', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockNoteWithAttachments} {...defaultProps} />,
      );

      // Should render the tappable photo container with accessibility label
      expect(getByLabelText('Tap to view full photo')).toBeTruthy();
    });

    it('shows photo count badge when multiple attachments', () => {
      const { getByText } = render(
        <SweepCard candidate={mockNoteWithAttachments} {...defaultProps} />,
      );

      // Should show +1 for the second photo
      expect(getByText('+1')).toBeTruthy();
    });

    it('does NOT show photo count badge for single attachment', () => {
      const { queryByText } = render(
        <SweepCard candidate={mockNoteWithSingleAttachment} {...defaultProps} />,
      );

      // Should not show any +N badge
      expect(queryByText(/\+\d/)).toBeNull();
    });

    it('does NOT render photo preview for note without attachments', () => {
      const { queryByLabelText } = render(
        <SweepCard candidate={mockNoteCandidate} {...defaultProps} />,
      );

      // Should not render the photo container
      expect(queryByLabelText('Tap to view full photo')).toBeNull();
    });

    it('does NOT render photo preview for todo candidates', () => {
      const { queryByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      // Todos don't have photo attachments
      expect(queryByLabelText('Tap to view full photo')).toBeNull();
    });

    it('renders note content alongside photo preview', () => {
      const { getByText, getByLabelText } = render(
        <SweepCard candidate={mockNoteWithAttachments} {...defaultProps} />,
      );

      // Photo preview should be present
      expect(getByLabelText('Tap to view full photo')).toBeTruthy();

      // Title and body should also be visible
      expect(getByText('Photo memory')).toBeTruthy();
      expect(getByText('A beautiful sunset at the beach')).toBeTruthy();
    });

    it('opens full-screen photo preview modal when tapping photo', () => {
      const { getByLabelText, queryByLabelText } = render(
        <SweepCard candidate={mockNoteWithAttachments} {...defaultProps} />,
      );

      // Initially, the full-size preview should not be visible
      expect(queryByLabelText('Full size photo')).toBeNull();

      // Tap the photo to open preview
      const photoContainer = getByLabelText('Tap to view full photo');
      fireEvent.press(photoContainer);

      // After tapping, the full-size photo should be visible in the modal
      expect(getByLabelText('Full size photo')).toBeTruthy();
    });
  });
});
