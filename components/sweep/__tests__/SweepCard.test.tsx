/**
 * SweepCard Component Tests
 *
 * Tests the SweepCard component rendering and interactions.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SweepCard, SweepCardProps } from '../SweepCard';
import type { SweepCandidate } from '../../../lib/sweep/types';

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
};

describe('SweepCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Type Chip', () => {
    it('shows "To-Do" chip for todo candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('To-Do')).toBeTruthy();
    });

    it('shows "Habit" chip for habit candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockHabitCandidate} {...defaultProps} />);
      expect(getByText('Habit')).toBeTruthy();
    });

    it('shows "Note" chip for note candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText('Note')).toBeTruthy();
    });

    it('shows "Log" chip for journal/log candidates', () => {
      const { getByText } = render(<SweepCard candidate={mockLogCandidate} {...defaultProps} />);
      expect(getByText('Log')).toBeTruthy();
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

  describe('Action Buttons', () => {
    it('renders Keep button', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Keep')).toBeTruthy();
    });

    it('renders Clear button', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Clear')).toBeTruthy();
    });

    it('renders Skip button', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Skip until next Sweep')).toBeTruthy();
    });

    it('renders Fix button', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText(/Fix/)).toBeTruthy();
    });
  });

  describe('Button Interactions', () => {
    it('calls onKeep when Keep button is pressed', () => {
      const onKeep = jest.fn();
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onKeep={onKeep} />,
      );
      fireEvent.press(getByText('Keep'));
      expect(onKeep).toHaveBeenCalledTimes(1);
    });

    it('calls onClear when Clear button is pressed', () => {
      const onClear = jest.fn();
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onClear={onClear} />,
      );
      fireEvent.press(getByText('Clear'));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('calls onSkip when Skip button is pressed', () => {
      const onSkip = jest.fn();
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onSkip={onSkip} />,
      );
      fireEvent.press(getByText('Skip until next Sweep'));
      expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenEdit when Fix button is pressed', () => {
      const onOpenEdit = jest.fn();
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );
      fireEvent.press(getByText(/Fix/));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Primary Button Labels', () => {
    it('shows "Review to-do details" for todos', () => {
      const { getByText } = render(<SweepCard candidate={mockTodoCandidate} {...defaultProps} />);
      expect(getByText('Review to-do details')).toBeTruthy();
    });

    it('shows "Review habit settings" for habits', () => {
      const { getByText } = render(<SweepCard candidate={mockHabitCandidate} {...defaultProps} />);
      expect(getByText('Review habit settings')).toBeTruthy();
    });

    it('shows "Review note details" for notes', () => {
      const { getByText } = render(<SweepCard candidate={mockNoteCandidate} {...defaultProps} />);
      expect(getByText('Review note details')).toBeTruthy();
    });

    it('calls onOpenEdit when primary button is pressed', () => {
      const onOpenEdit = jest.fn();
      const { getByText } = render(
        <SweepCard candidate={mockTodoCandidate} {...defaultProps} onOpenEdit={onOpenEdit} />,
      );
      fireEvent.press(getByText('Review to-do details'));
      expect(onOpenEdit).toHaveBeenCalledTimes(1);
    });
  });
});
