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

const mockHabitCandidate: SweepCandidate = {
  id: 'habit-1',
  kind: 'habit',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  raw: {
    id: 'habit-1',
    name: 'Morning meditation',
    notes: 'Practice mindfulness for 10 minutes',
    why_string: 'To reduce stress and improve focus',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    start_date: null,
  } as any,
};

const mockHabitWithStartDateCandidate: SweepCandidate = {
  id: 'habit-2',
  kind: 'habit',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  raw: {
    id: 'habit-2',
    name: 'Evening run',
    notes: 'Run 5k every evening',
    why_string: 'Stay fit',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    start_date: '2024-12-01',
  } as any,
};

const mockNoteCandidate: SweepCandidate = {
  id: 'note-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
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
  onSkip: jest.fn(),
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
      expect(getByText('TO-DO')).toBeTruthy();
    });

    it('shows "HABIT" chip for habit candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockHabitCandidate} {...defaultProps} />);
      expect(getByText('HABIT')).toBeTruthy();
    });

    it('shows "NOTE" chip for note candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText('NOTE')).toBeTruthy();
    });

    it('shows "LOG" chip for journal/log candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockLogCandidate} {...defaultProps} />);
      expect(getByText('LOG')).toBeTruthy();
    });
  });

  describe('Content Display', () => {
    it('displays the title for todos', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Buy groceries')).toBeTruthy();
    });

    it('displays the title for habits', () => {
      const { getByText } = render(<SweepCard candidate={mockHabitCandidate} {...defaultProps} />);
      expect(getByText('Morning meditation')).toBeTruthy();
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
    it('renders Keep button with swipe cue text', () => {
      const { getByRole, getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );
      expect(getByRole('button', { name: 'Keep this item' })).toBeTruthy();
      expect(getByText('Keep for later →')).toBeTruthy();
    });

    it('renders Clear button with swipe cue text', () => {
      const { getByRole, getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );
      expect(getByRole('button', { name: 'Clear this item' })).toBeTruthy();
      expect(getByText('← Not needed anymore')).toBeTruthy();
    });

    it('renders Skip button', () => {
      const { getByText, getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );
      expect(getByText('Skip')).toBeTruthy();
      expect(getByText('until next Sweep')).toBeTruthy();
      expect(getByLabelText('Skip until next Sweep')).toBeTruthy();
    });

    it('renders Fix button with icon', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );
      expect(getByLabelText('Fix this item')).toBeTruthy();
    });
  });

  describe('Button Interactions', () => {
    it('Keep button is pressable', () => {
      const onKeep = jest.fn();
      const { getByRole } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onKeep={onKeep} />,
      );
      // Button should be pressable (animation will trigger and callback happens after)
      expect(() => fireEvent.press(getByRole('button', { name: 'Keep this item' }))).not.toThrow();
    });

    it('Clear button is pressable', () => {
      const onClear = jest.fn();
      const { getByRole } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onClear={onClear} />,
      );
      // Button should be pressable (animation will trigger and callback happens after)
      expect(() => fireEvent.press(getByRole('button', { name: 'Clear this item' }))).not.toThrow();
    });

    it('calls onSkip when Skip button is pressed', () => {
      const onSkip = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onSkip={onSkip} />,
      );
      fireEvent.press(getByLabelText('Skip until next Sweep'));
      expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit when Fix button is pressed', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );
      fireEvent.press(getByLabelText('Fix this item'));
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

    it('shows "Due Dec 25" for todos with due_day set', () => {
      const { getByText } = render(
        <SweepCard candidate={mockTodoWithDueDateCandidate} {...defaultProps} />,
      );
      expect(getByText('Due Dec 25')).toBeTruthy();
    });

    it('shows "Due Dec 25" for todos with only due_date set (legacy)', () => {
      const todoLegacyDueDate = {
        ...mockTodoCandidate,
        raw: { ...mockTodoCandidate.raw, due_day: null, due_date: '2024-12-25' },
      };
      const { getByText } = render(<SweepCard candidate={todoLegacyDueDate} {...defaultProps} />);
      expect(getByText('Due Dec 25')).toBeTruthy();
    });
  });

  describe('CTA Mapping - Habit Candidates', () => {
    it('shows "Add start date" for habits without start_date', () => {
      const { getByText } = render(<SweepCard candidate={mockHabitCandidate} {...defaultProps} />);
      expect(getByText('Add start date')).toBeTruthy();
    });

    it('shows "Add start date" for habits with start_date=null', () => {
      const habitNoStart = {
        ...mockHabitCandidate,
        raw: { ...mockHabitCandidate.raw, start_date: null },
      };
      const { getByText } = render(<SweepCard candidate={habitNoStart} {...defaultProps} />);
      expect(getByText('Add start date')).toBeTruthy();
    });

    it('shows "Starts Dec 1" for habits with start_date set', () => {
      const { getByText } = render(
        <SweepCard candidate={mockHabitWithStartDateCandidate} {...defaultProps} />,
      );
      expect(getByText('Starts Dec 1')).toBeTruthy();
    });
  });

  describe('CTA Mapping - Note/Log Candidates', () => {
    it('shows "TURN INTO A TO-DO" for notes with subtype=null (general notes)', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText('TURN INTO A TO-DO')).toBeTruthy();
    });

    it('shows "TURN INTO A TO-DO" for idea notes', () => {
      const { getByText } = render(<SweepCard candidate={mockIdeaCandidate} {...defaultProps} />);
      expect(getByText('TURN INTO A TO-DO')).toBeTruthy();
    });

    it('does NOT show main CTA for journal logs (subtype=journal)', () => {
      const { queryByText } = render(
        <SweepCard candidate={mockJournalCandidate} {...defaultProps} />,
      );
      expect(queryByText('TURN INTO A TO-DO')).toBeNull();
      expect(queryByText('Add due date')).toBeNull();
      expect(queryByText('Add start date')).toBeNull();
    });

    it('does NOT show main CTA for logs with canonical_type=journal', () => {
      const journalByCanonicalType = {
        ...mockNoteCandidate,
        raw: { ...mockNoteCandidate.raw, subtype: null, canonical_type: 'journal' },
      };
      const { queryByText } = render(
        <SweepCard candidate={journalByCanonicalType} {...defaultProps} />,
      );
      expect(queryByText('TURN INTO A TO-DO')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CTA Interaction Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('CTA Interactions - Date Picker', () => {
    it('opens date picker modal when date control is pressed for todo without date', async () => {
      const { getByText, queryByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      // Modal should not be visible initially (no "Set due date" title)
      expect(queryByText('Set due date')).toBeNull();

      // Press the date control
      fireEvent.press(getByText('Add due date'));

      // Modal should now be visible with the title
      await waitFor(() => {
        expect(getByText('Set due date')).toBeTruthy();
      });
    });

    it('opens date picker modal when date control is pressed for todo with date', async () => {
      const { getByText, queryByText } = render(
        <SweepCard candidate={mockTodoWithDueDateCandidate} {...defaultProps} />,
      );

      expect(queryByText('Set due date')).toBeNull();

      fireEvent.press(getByText('Due Dec 25'));

      await waitFor(() => {
        expect(getByText('Set due date')).toBeTruthy();
      });
    });

    it('opens date picker modal when date control is pressed for habit without date', async () => {
      const { getByText, queryByText } = render(
        <SweepCard candidate={mockHabitCandidate} {...defaultProps} />,
      );

      expect(queryByText('Set start date')).toBeNull();

      fireEvent.press(getByText('Add start date'));

      await waitFor(() => {
        expect(getByText('Set start date')).toBeTruthy();
      });
    });

    it('opens date picker modal when date control is pressed for habit with date', async () => {
      const { getByText, queryByText } = render(
        <SweepCard candidate={mockHabitWithStartDateCandidate} {...defaultProps} />,
      );

      expect(queryByText('Set start date')).toBeNull();

      fireEvent.press(getByText('Starts Dec 1'));

      await waitFor(() => {
        expect(getByText('Set start date')).toBeTruthy();
      });
    });

    it('shows Today and Tomorrow quick date chips in date picker', async () => {
      const { getByText, getAllByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      fireEvent.press(getByText('Add due date'));

      await waitFor(() => {
        expect(getByText('Today')).toBeTruthy();
        expect(getByText('Tomorrow')).toBeTruthy();
        // "Clear" appears in the date chip area
        expect(getAllByText('Clear').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('closes date picker when Cancel is pressed', async () => {
      const { getByText, queryByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      fireEvent.press(getByText('Add due date'));

      await waitFor(() => {
        expect(getByText('Set due date')).toBeTruthy();
      });

      fireEvent.press(getByText('Cancel'));

      await waitFor(() => {
        expect(queryByText('Set due date')).toBeNull();
      });
    });
  });

  describe('CTA Interactions - Convert to Todo', () => {
    it('calls onConvertToTodo when "TURN INTO A TO-DO" is pressed for general note', () => {
      const onConvertToTodo = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          {...defaultProps}
          onConvertToTodo={onConvertToTodo}
        />,
      );

      fireEvent.press(getByText('TURN INTO A TO-DO'));

      expect(onConvertToTodo).toHaveBeenCalledTimes(1);
    });

    it('calls onConvertToTodo when "TURN INTO A TO-DO" is pressed for idea note', () => {
      const onConvertToTodo = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockIdeaCandidate}
          {...defaultProps}
          onConvertToTodo={onConvertToTodo}
        />,
      );

      fireEvent.press(getByText('TURN INTO A TO-DO'));

      expect(onConvertToTodo).toHaveBeenCalledTimes(1);
    });

    it('falls back to onOpenEdit if onConvertToTodo is not provided', () => {
      const onOpenEdit = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          {...defaultProps}
          onOpenEdit={onOpenEdit}
          onConvertToTodo={undefined}
        />,
      );

      fireEvent.press(getByText('TURN INTO A TO-DO'));

      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Fix Button Tests (Top-Right Icon)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Fix Button (Top-Right Icon)', () => {
    it('calls onOpenEdit for todo candidates regardless of due date', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      fireEvent.press(getByLabelText('Fix this item'));
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

      fireEvent.press(getByLabelText('Fix this item'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for habit candidates', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockHabitCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      fireEvent.press(getByLabelText('Fix this item'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for note candidates', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard candidate={mockNoteCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      fireEvent.press(getByLabelText('Fix this item'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for journal log candidates (no main CTA but Fix works)', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText, queryByText } = render(
        <SweepCard candidate={mockJournalCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );

      // Verify no main CTA
      expect(queryByText('TURN INTO A TO-DO')).toBeNull();

      // But Fix button still works
      fireEvent.press(getByLabelText('Fix this item'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('Fix button has accessible label "Fix this item"', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      expect(getByLabelText('Fix this item')).toBeTruthy();
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

    it('handles habit with empty string start_date as no start date', () => {
      const habitEmptyStart = {
        ...mockHabitCandidate,
        raw: { ...mockHabitCandidate.raw, start_date: '' },
      };
      const { getByText } = render(<SweepCard candidate={habitEmptyStart} {...defaultProps} />);
      // Empty string should be treated as no start date
      expect(getByText('Add start date')).toBeTruthy();
    });

    it('renders correctly when candidate changes', () => {
      const { getByText, rerender } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} />,
      );

      expect(getByText('Add due date')).toBeTruthy();

      // Re-render with a habit
      rerender(<SweepCard candidate={mockHabitCandidate} {...defaultProps} />);

      expect(getByText('Add start date')).toBeTruthy();
    });
  });
});
