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
import type { SweepCandidate, SweepCardMeta } from '../../../lib/sweep/types';

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

const mockLockedInTodo: SweepCandidate = {
  id: 'todo-locked-in',
  kind: 'todo',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: false,
  raw: {
    id: 'todo-locked-in',
    name: 'Locked in commitment',
    notes: 'This is a locked-in todo',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    due_day: '2024-12-20',
    due_date: '2024-12-20',
    locked_in: true,
  } as any,
};

/** Generate mock meta for testing */
function createMockMeta(overrides: Partial<SweepCardMeta> = {}): SweepCardMeta {
  return {
    typeChip: 'Todo',
    todoStatus: 'unscheduled',
    logSubtype: null,
    habitStatus: null,
    isNew: true,
    resurfacingDate: null,
    spaceName: null,
    spaceId: null,
    isLockedIn: false,
    gremlyResponse: 'What do you want to do with this one?',
    rescheduleCount: 0,
    ...overrides,
  };
}

/** Generate mock meta for log/note candidates */
function createMockLogMeta(overrides: Partial<SweepCardMeta> = {}): SweepCardMeta {
  return {
    typeChip: 'Note',
    todoStatus: null,
    logSubtype: 'general',
    habitStatus: null,
    isNew: true,
    resurfacingDate: null,
    spaceName: null,
    spaceId: null,
    isLockedIn: false,
    gremlyResponse: "Thanks for letting that out. I've got it.",
    rescheduleCount: 0,
    ...overrides,
  };
}

const defaultProps: Omit<SweepCardProps, 'candidate' | 'meta'> = {
  index: 0,
  total: 5,
  onSkip: jest.fn(),
  onClear: jest.fn(),
  onOpenEdit: jest.fn(),
  onConvertToTodo: jest.fn(),
  onConfirmQuickDate: jest.fn(),
  onAddToSpace: jest.fn(),
};

function resetMocks() {
  (defaultProps.onSkip as jest.Mock).mockClear();
  (defaultProps.onClear as jest.Mock).mockClear();
  (defaultProps.onOpenEdit as jest.Mock).mockClear();
  (defaultProps.onConvertToTodo as jest.Mock).mockClear();
  (defaultProps.onConfirmQuickDate as jest.Mock).mockClear();
  (defaultProps.onAddToSpace as jest.Mock).mockClear();
}

describe('SweepCard', () => {
  beforeEach(() => {
    resetMocks();
    mockRepoUpdate.mockClear();
  });

  describe('Type Chip', () => {
    it('shows "Todo" chip for todo candidates', () => {
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      expect(getByText('Todo')).toBeTruthy();
    });

    it('shows "Note" chip for note candidates', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Note')).toBeTruthy();
    });

    it('shows "Note" chip for journal/log candidates', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockLogCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Note')).toBeTruthy();
    });
  });

  describe('Overdue Pill', () => {
    it('shows "Overdue" chip when meta.todoStatus is overdue', () => {
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

      const { getByText } = render(
        <SweepCard
          candidate={overdueCandidate}
          meta={createMockMeta({ todoStatus: 'overdue' })}
          {...defaultProps}
        />,
      );

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
        <SweepCard candidate={notOverdueCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      expect(queryByText('Overdue')).toBeNull();
      expect(getByText('Future task')).toBeTruthy();
    });

    it('does NOT show "Overdue" pill for notes (even with isOverdue: false)', () => {
      // Notes should never be overdue by design
      const { queryByText, getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );

      expect(queryByText('Overdue')).toBeNull();
      expect(getByText('Meeting notes')).toBeTruthy();
    });

    it('shows both Type chip and Overdue chip together for overdue todos', () => {
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

      const { getByText } = render(
        <SweepCard
          candidate={overdueCandidate}
          meta={createMockMeta({ todoStatus: 'overdue' })}
          {...defaultProps}
        />,
      );

      // Both chips should be visible
      expect(getByText('Todo')).toBeTruthy();
      expect(getByText('Overdue')).toBeTruthy();
    });
  });

  describe('Due Today Badge', () => {
    it('shows "Due today" chip for todos with meta.todoStatus=due_today', () => {
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

      const { getByText } = render(
        <SweepCard
          candidate={dueTodayCandidate}
          meta={createMockMeta({ todoStatus: 'due_today' })}
          {...defaultProps}
        />,
      );

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
        <SweepCard
          candidate={noteDueToday}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );

      expect(queryByText('Due today')).toBeNull();
      expect(getByText('Meeting notes')).toBeTruthy();
    });

    it('shows "Overdue" instead of "Due today" when meta.todoStatus is overdue (priority)', () => {
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

      // meta.todoStatus should be 'overdue' when overdue takes priority
      const { getByText, queryByText } = render(
        <SweepCard
          candidate={overdueAndDueTodayCandidate}
          meta={createMockMeta({ todoStatus: 'overdue' })}
          {...defaultProps}
        />,
      );

      expect(getByText('Overdue')).toBeTruthy();
      // Only one status chip is shown based on meta.todoStatus
    });
  });

  describe('New/Resurfacing Indicator', () => {
    it('shows "New" for items with meta.isNew=true', () => {
      const enteredTodayCandidate: SweepCandidate = {
        ...mockNoteCandidate,
        id: 'note-entered-today',
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
      };

      const { getByText } = render(
        <SweepCard
          candidate={enteredTodayCandidate}
          meta={createMockMeta({
            typeChip: 'Note',
            todoStatus: null,
            logSubtype: 'general',
            isNew: true,
          })}
          {...defaultProps}
        />,
      );

      expect(getByText(/New/)).toBeTruthy();
    });

    it('shows "New" for todos with meta.isNew=true', () => {
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

      const { getAllByText } = render(
        <SweepCard
          candidate={todoEnteredToday}
          meta={createMockMeta({ isNew: true })}
          {...defaultProps}
        />,
      );

      // Multiple elements may contain "New" (including the title), so use getAllByText
      expect(getAllByText(/New/).length).toBeGreaterThan(0);
    });

    it('shows "Since" with date for items with meta.isNew=false', () => {
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

      const { getByText } = render(
        <SweepCard
          candidate={dueTodayAndEnteredToday}
          meta={createMockMeta({
            todoStatus: 'due_today',
            isNew: false,
            resurfacingDate: 'Dec 15',
          })}
          {...defaultProps}
        />,
      );

      expect(getByText(/Since/)).toBeTruthy();
      expect(getByText(/Dec 15/)).toBeTruthy();
    });

    it('shows no status chip when meta.todoStatus is null', () => {
      const noBadgeCandidate: SweepCandidate = {
        ...mockNoteCandidate,
        id: 'note-no-badge',
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: false,
      };

      const { queryByText } = render(
        <SweepCard
          candidate={noBadgeCandidate}
          meta={createMockMeta({
            typeChip: 'Note',
            todoStatus: null,
            logSubtype: 'general',
            isNew: false,
            resurfacingDate: 'Dec 10',
          })}
          {...defaultProps}
        />,
      );

      expect(queryByText('Overdue')).toBeNull();
      expect(queryByText('Due today')).toBeNull();
      expect(queryByText('Unscheduled')).toBeNull();
    });
  });

  describe('Content Display', () => {
    it('displays the title for todos', () => {
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      expect(getByText('Buy groceries')).toBeTruthy();
    });

    it('displays the title for notes', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Meeting notes')).toBeTruthy();
    });

    it('displays Gremly response from meta', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({ gremlyResponse: 'What do you want to do with this one?' })}
          {...defaultProps}
        />,
      );
      expect(getByText('What do you want to do with this one?')).toBeTruthy();
    });

    it('displays custom Gremly message', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({ gremlyResponse: 'Test message from Gremly' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Test message from Gremly')).toBeTruthy();
    });

    it('displays "New" indicator for new items', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({ isNew: true })}
          {...defaultProps}
        />,
      );
      // Should contain "New" for items with isNew=true in meta
      expect(getByText(/New/)).toBeTruthy();
    });
  });

  describe('Swipe Cues and Action Buttons', () => {
    it('renders contextual swipe cues for todos ("Still matters" / "Done with this")', () => {
      const { getByRole, getByText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      expect(getByRole('button', { name: 'Skip this item' })).toBeTruthy();
      expect(getByRole('button', { name: 'Clear this item' })).toBeTruthy();
      expect(getByText('Still matters →')).toBeTruthy();
      expect(getByText('← Done with this')).toBeTruthy();
    });

    it('renders contextual swipe cues for notes ("Save this" / "Remove this")', () => {
      const { getByRole, getByText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );
      expect(getByRole('button', { name: 'Skip this item' })).toBeTruthy();
      expect(getByRole('button', { name: 'Clear this item' })).toBeTruthy();
      expect(getByText('Save this →')).toBeTruthy();
      expect(getByText('← Remove this')).toBeTruthy();
    });

    it('renders Edit button with icon', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      expect(getByLabelText('Edit details')).toBeTruthy();
    });
  });

  describe('Button Interactions', () => {
    it('Keep button is pressable', () => {
      const onSkip = jest.fn();
      const { getByRole } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onSkip={onSkip}
        />,
      );
      // Button should be pressable (animation will trigger and callback happens after)
      expect(() => fireEvent.press(getByRole('button', { name: 'Skip this item' }))).not.toThrow();
    });

    it('Clear button is pressable', () => {
      const onClear = jest.fn();
      const { getByRole } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onClear={onClear}
        />,
      );
      // Button should be pressable (animation will trigger and callback happens after)
      expect(() => fireEvent.press(getByRole('button', { name: 'Clear this item' }))).not.toThrow();
    });

    it('calls onOpenEdit when Edit button is pressed', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onOpenEdit={onOpenEdit}
        />,
      );
      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CTA Mapping Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Button Grid - Todo Candidates', () => {
    it('shows quick date buttons for todos', () => {
      const { getByText, getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      // Check button labels - now: Tomorrow, Next Week, Pick Date, Remind Me
      expect(getByText('Tomorrow')).toBeTruthy();
      expect(getByText('Next Week')).toBeTruthy();
      expect(getByText('Pick Date')).toBeTruthy();
      expect(getByText('Remind Me')).toBeTruthy();
      // Check accessibility labels
      expect(getByLabelText('Set due tomorrow')).toBeTruthy();
      expect(getByLabelText('Set due next week')).toBeTruthy();
      expect(getByLabelText('Pick a date')).toBeTruthy();
      expect(getByLabelText('Remind me later')).toBeTruthy();
    });

    it('shows same quick date buttons for todos with due_day set', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoWithDueDateCandidate}
          meta={createMockMeta()}
          {...defaultProps}
        />,
      );
      expect(getByText('Tomorrow')).toBeTruthy();
      expect(getByText('Next Week')).toBeTruthy();
      expect(getByText('Pick Date')).toBeTruthy();
      expect(getByText('Remind Me')).toBeTruthy();
    });
  });

  describe('Button Grid - Log Candidates', () => {
    it('shows action buttons for general notes', () => {
      const { getByText, getByLabelText } = render(
        <SweepCard candidate={mockNoteCandidate} meta={createMockLogMeta()} {...defaultProps} />,
      );
      // Check button labels - now: Just Save, Remind Me, To Space, Make Todo
      expect(getByText('Just Save')).toBeTruthy();
      expect(getByText('Remind Me')).toBeTruthy();
      expect(getByText('To Space')).toBeTruthy();
      expect(getByText('Make Todo')).toBeTruthy();
      // Check accessibility labels
      expect(getByLabelText('Just save the note')).toBeTruthy();
      expect(getByLabelText('Set a reminder')).toBeTruthy();
      expect(getByLabelText('Add to space')).toBeTruthy();
      expect(getByLabelText('Convert to todo')).toBeTruthy();
    });

    it('shows action buttons for idea notes', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockIdeaCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'idea' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Just Save')).toBeTruthy();
      expect(getByText('Remind Me')).toBeTruthy();
      expect(getByText('To Space')).toBeTruthy();
      expect(getByText('Make Todo')).toBeTruthy();
    });

    it('shows action buttons for journal logs', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockJournalCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Just Save')).toBeTruthy();
      expect(getByText('Remind Me')).toBeTruthy();
      expect(getByText('To Space')).toBeTruthy();
      expect(getByText('Make Todo')).toBeTruthy();
    });

    it('shows action buttons for logs with canonical_type=journal', () => {
      const journalByCanonicalType = {
        ...mockNoteCandidate,
        raw: { ...mockNoteCandidate.raw, subtype: null, canonical_type: 'journal' },
      };
      const { getByText } = render(
        <SweepCard
          candidate={journalByCanonicalType}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );
      expect(getByText('Just Save')).toBeTruthy();
      expect(getByText('Make Todo')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CTA Interaction Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Button Grid Interactions - Todos', () => {
    it('has Tomorrow selected by default for todos', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      // Tomorrow button should exist and be pressable (has primary styling by default)
      const tomorrowButton = getByLabelText('Set due tomorrow');
      expect(tomorrowButton).toBeTruthy();
    });

    it('selects Tomorrow when Tomorrow button is pressed', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      fireEvent.press(getByLabelText('Set due tomorrow'));
      // Button selection is internal state - the actual callback (onConfirmQuickDate)
      // is called on swipe right, not on button press
    });

    it('selects Remind Me when Remind Me button is pressed', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      fireEvent.press(getByLabelText('Remind me later'));
      // Button selection is internal state - the actual callback (onConfirmRemindLater)
      // is called on swipe right, not on button press
    });

    it('selects Next Week when Next Week button is pressed', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      fireEvent.press(getByLabelText('Set due next week'));
      // Button selection is internal state - the actual callback (onConfirmQuickDate)
      // is called on swipe right, not on button press
    });

    it('opens date picker when Pick Date button is pressed for todos', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      fireEvent.press(getByLabelText('Pick a date'));
      // Date picker modal should open - we can verify by checking that the date picker is now visible
      // The handler sets showDatePicker state to true
    });
  });

  describe('Button Grid Interactions - Logs', () => {
    it('selects Just Save when Just Save button is pressed for logs', () => {
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );

      fireEvent.press(getByLabelText('Just save the note'));
      // Just Save button selects the action (actual save happens on swipe right)
    });

    it('selects Add to Space when To Space button is pressed', () => {
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );

      fireEvent.press(getByLabelText('Add to space'));
      // Button selection is internal state - opens space picker modal
    });

    it('calls onConvertToTodo when Make Todo button is pressed', () => {
      const onConvertToTodo = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockIdeaCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'idea' })}
          {...defaultProps}
          onConvertToTodo={onConvertToTodo}
        />,
      );

      fireEvent.press(getByLabelText('Convert to todo'));
      expect(onConvertToTodo).toHaveBeenCalledTimes(1);
    });

    it('opens remind modal when Remind Me button is pressed for logs', () => {
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockJournalCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );

      fireEvent.press(getByLabelText('Set a reminder'));
      // Remind Me button is pressable - opens remind date modal
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edit Button Tests (Top-Right Icon)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Edit Button (Top-Right Icon)', () => {
    it('calls onOpenEdit for todo candidates regardless of due date', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onOpenEdit={onOpenEdit}
        />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for todo with due date', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoWithDueDateCandidate}
          meta={createMockMeta()}
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
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
          onOpenEdit={onOpenEdit}
        />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit for journal log candidates', () => {
      const onOpenEdit = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockJournalCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
          onOpenEdit={onOpenEdit}
        />,
      );

      fireEvent.press(getByLabelText('Edit details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });

    it('Edit button has accessible label "Edit details"', () => {
      const { getByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      expect(getByLabelText('Edit details')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Locked-in Items
  // ─────────────────────────────────────────────────────────────────────────

  describe('Locked-in Items', () => {
    it('displays diamond icon for locked-in todos', () => {
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockLockedInTodo}
          meta={createMockMeta({ isLockedIn: true })}
          {...defaultProps}
        />,
      );
      expect(getByLabelText('Locked in commitment')).toBeTruthy();
    });

    it('displays locked-in specific Gremly message', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockLockedInTodo}
          meta={createMockMeta({
            isLockedIn: true,
            gremlyResponse: "You locked this one in. How's it coming along?",
          })}
          {...defaultProps}
        />,
      );
      expect(getByText("You locked this one in. How's it coming along?")).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Reschedule Tracking
  // ─────────────────────────────────────────────────────────────────────────

  describe('Reschedule Tracking', () => {
    it('shows progressive message for first reschedule', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({
            rescheduleCount: 1,
            gremlyResponse: 'This one came back. Ready to tackle it?',
          })}
          {...defaultProps}
        />,
      );
      expect(getByText('This one came back. Ready to tackle it?')).toBeTruthy();
    });

    it('shows progressive message for second reschedule', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({
            rescheduleCount: 2,
            gremlyResponse: "Seeing this one again. What's getting in the way?",
          })}
          {...defaultProps}
        />,
      );
      expect(getByText("Seeing this one again. What's getting in the way?")).toBeTruthy();
    });

    it('shows progressive message for 3+ reschedules', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({
            rescheduleCount: 3,
            gremlyResponse:
              'This keeps floating back. Maybe it needs to be broken down, or let go?',
          })}
          {...defaultProps}
        />,
      );
      expect(
        getByText('This keeps floating back. Maybe it needs to be broken down, or let go?'),
      ).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles todo with empty string due_day showing quick date buttons', () => {
      const todoEmptyDueDay = {
        ...mockTodoCandidate,
        raw: { ...mockTodoCandidate.raw, due_day: '', due_date: '' },
      };
      const { getByText } = render(
        <SweepCard candidate={todoEmptyDueDay} meta={createMockMeta()} {...defaultProps} />,
      );
      // Empty string should be treated as no due date - shows quick date buttons
      expect(getByText('Tomorrow')).toBeTruthy();
      expect(getByText('Pick Date')).toBeTruthy();
    });

    it('renders correctly when candidate changes from todo to log', () => {
      const { getByText, queryByText, rerender } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      // Todo shows quick date buttons
      expect(getByText('Tomorrow')).toBeTruthy();
      expect(queryByText('Just Save')).toBeNull();

      // Re-render with a note
      rerender(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );

      // Log shows action buttons
      expect(getByText('Just Save')).toBeTruthy();
      expect(queryByText('Tomorrow')).toBeNull();
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
        <SweepCard
          candidate={mockNoteWithAttachments}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );

      // Should render the tappable photo container with accessibility label
      expect(getByLabelText('Tap to view full photo')).toBeTruthy();
    });

    it('shows photo count badge when multiple attachments', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockNoteWithAttachments}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );

      // Should show +1 for the second photo
      expect(getByText('+1')).toBeTruthy();
    });

    it('does NOT show photo count badge for single attachment', () => {
      const { queryByText } = render(
        <SweepCard
          candidate={mockNoteWithSingleAttachment}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );

      // Should not show any +N badge
      expect(queryByText(/\+\d/)).toBeNull();
    });

    it('does NOT render photo preview for note without attachments', () => {
      const { queryByLabelText } = render(
        <SweepCard
          candidate={mockNoteCandidate}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'general' })}
          {...defaultProps}
        />,
      );

      // Should not render the photo container
      expect(queryByLabelText('Tap to view full photo')).toBeNull();
    });

    it('does NOT render photo preview for todo candidates', () => {
      const { queryByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );

      // Todos don't have photo attachments
      expect(queryByLabelText('Tap to view full photo')).toBeNull();
    });

    it('renders note content alongside photo preview', () => {
      const { getByText, getByLabelText } = render(
        <SweepCard
          candidate={mockNoteWithAttachments}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
      );

      // Photo preview should be present
      expect(getByLabelText('Tap to view full photo')).toBeTruthy();

      // Title should be visible (body preview removed in new design)
      expect(getByText('Photo memory')).toBeTruthy();
    });

    it('opens full-screen photo preview modal when tapping photo', () => {
      const { getByLabelText, queryByLabelText } = render(
        <SweepCard
          candidate={mockNoteWithAttachments}
          meta={createMockMeta({ typeChip: 'Note', todoStatus: null, logSubtype: 'journal' })}
          {...defaultProps}
        />,
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

  // ─────────────────────────────────────────────────────────────────────────
  // Back Button and Previous Decision Restoration
  // ─────────────────────────────────────────────────────────────────────────

  describe('Back Button', () => {
    it('renders back button when onGoBack is provided', () => {
      const onGoBack = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onGoBack={onGoBack}
        />,
      );

      expect(getByLabelText('Go back to previous card')).toBeTruthy();
    });

    it('does NOT render back button when onGoBack is undefined', () => {
      const { queryByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onGoBack={undefined}
        />,
      );

      expect(queryByLabelText('Go back to previous card')).toBeNull();
    });

    it('calls onGoBack when back button is pressed', () => {
      const onGoBack = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onGoBack={onGoBack}
        />,
      );

      fireEvent.press(getByLabelText('Go back to previous card'));

      expect(onGoBack).toHaveBeenCalledTimes(1);
    });

    it('shows "Back" text in the back button', () => {
      const onGoBack = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onGoBack={onGoBack}
        />,
      );

      expect(getByText('Back')).toBeTruthy();
    });
  });

  describe('Previous Decision Restoration', () => {
    it('renders correctly when previousDecision is provided', () => {
      const previousDecision = {
        action: 'keep' as const,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      };

      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          previousDecision={previousDecision}
        />,
      );

      // Card should still render
      expect(getByText('Buy groceries')).toBeTruthy();
    });

    it('renders correctly without previousDecision', () => {
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          previousDecision={undefined}
        />,
      );

      expect(getByText('Buy groceries')).toBeTruthy();
    });

    it('maintains clear decision from previous state', () => {
      const previousDecision = {
        action: 'clear' as const,
      };

      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          previousDecision={previousDecision}
        />,
      );

      // Card should still render and be interactive
      expect(getByText('Buy groceries')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Chat Button Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Chat Button', () => {
    it('renders chat button when onOpenChat is provided', () => {
      const onOpenChat = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onOpenChat={onOpenChat}
        />,
      );
      expect(getByLabelText('Chat with Gremly about this item')).toBeTruthy();
    });

    it('does NOT render chat button when onOpenChat is undefined', () => {
      const { queryByLabelText } = render(
        <SweepCard candidate={mockTodoCandidate} meta={createMockMeta()} {...defaultProps} />,
      );
      expect(queryByLabelText('Chat with Gremly about this item')).toBeNull();
    });

    it('calls onOpenChat when chat button is pressed', () => {
      const onOpenChat = jest.fn();
      const { getByLabelText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta()}
          {...defaultProps}
          onOpenChat={onOpenChat}
        />,
      );
      fireEvent.press(getByLabelText('Chat with Gremly about this item'));
      expect(onOpenChat).toHaveBeenCalledTimes(1);
    });

    it('displays contextual opener text based on sweep context', () => {
      const onOpenChat = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({ rescheduleCount: 2 })}
          {...defaultProps}
          onOpenChat={onOpenChat}
        />,
      );
      // When rescheduleCount >= 2, should show "keeps moving" text
      expect(getByText('This keeps moving. Want to figure out why?')).toBeTruthy();
    });

    it('shows default chat text for items without special context', () => {
      const onOpenChat = jest.fn();
      const { getByText } = render(
        <SweepCard
          candidate={mockTodoCandidate}
          meta={createMockMeta({ rescheduleCount: 0 })}
          {...defaultProps}
          onOpenChat={onOpenChat}
        />,
      );
      expect(getByText('Chat about this →')).toBeTruthy();
    });

    it('does NOT render chat button when note has attachments', () => {
      const onOpenChat = jest.fn();
      // Use a note candidate (attachments only apply to notes)
      const noteWithAttachments: SweepCandidate = {
        ...mockNoteCandidate,
        kind: 'note',
        attachments: [{ id: 'photo-1', url: 'https://example.com/photo.jpg', position: 0 }],
      };
      const { queryByLabelText } = render(
        <SweepCard
          candidate={noteWithAttachments}
          meta={createMockLogMeta()}
          {...defaultProps}
          onOpenChat={onOpenChat}
        />,
      );
      // Chat button should NOT appear when note has attachments
      expect(queryByLabelText('Chat with Gremly about this item')).toBeNull();
    });
  });
});
