/**
 * Tests for SwipeHintText Component
 *
 * Tests the animated hint text displayed on sweep cards.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SwipeHintText } from '../SwipeHintText';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

describe('SwipeHintText', () => {
  describe('todo hints', () => {
    it('shows "Set due tomorrow" for tomorrow action', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction="tomorrow" />);

      expect(screen.getByText('Set due tomorrow')).toBeTruthy();
    });

    it('shows "Set due next week" for nextweek action', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction="nextweek" />);

      expect(screen.getByText('Set due next week')).toBeTruthy();
    });

    it('shows "Pick a due date" for pickdate without confirmed date', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction="pickdate" />);

      expect(screen.getByText('Pick a due date')).toBeTruthy();
    });

    it('shows formatted date for pickdate with confirmed date', () => {
      const customDate = new Date('2025-12-20');
      render(
        <SwipeHintText
          candidateKind="todo"
          selectedQuickAction="pickdate"
          confirmedCustomDate={customDate}
        />,
      );

      // Should format as "MMM d" - Dec 20
      expect(screen.getByText(/Set due Dec/)).toBeTruthy();
    });

    it('shows "Pick a reminder date" for remindlater without confirmed date', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction="remindlater" />);

      expect(screen.getByText('Pick a reminder date')).toBeTruthy();
    });

    it('shows formatted reminder date when confirmed', () => {
      const remindDate = new Date('2025-12-25');
      render(
        <SwipeHintText
          candidateKind="todo"
          selectedQuickAction="remindlater"
          confirmedRemindDate={remindDate}
        />,
      );

      // Should format as "MMM d" - Dec 25
      expect(screen.getByText(/Set reminder for Dec/)).toBeTruthy();
    });

    it('defaults to "Set due tomorrow" for null action', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction={null} />);

      expect(screen.getByText('Set due tomorrow')).toBeTruthy();
    });
  });

  describe('habit hints', () => {
    it('shows "Decide tomorrow" for asktomorrow action', () => {
      render(<SwipeHintText candidateKind="habit" selectedHabitAction="asktomorrow" />);

      expect(screen.getByText('Decide tomorrow')).toBeTruthy();
    });

    it('shows "Start tomorrow" for starttomorrow action', () => {
      render(<SwipeHintText candidateKind="habit" selectedHabitAction="starttomorrow" />);

      expect(screen.getByText('Start tomorrow')).toBeTruthy();
    });

    it('shows "Start Monday" for startmonday action', () => {
      render(<SwipeHintText candidateKind="habit" selectedHabitAction="startmonday" />);

      expect(screen.getByText('Start Monday')).toBeTruthy();
    });

    it('shows "Pick a start date" for pickdate without confirmed date', () => {
      render(<SwipeHintText candidateKind="habit" selectedHabitAction="pickdate" />);

      expect(screen.getByText('Pick a start date')).toBeTruthy();
    });

    it('shows formatted start date for pickdate with confirmed date', () => {
      const customDate = new Date('2025-12-30');
      render(
        <SwipeHintText
          candidateKind="habit"
          selectedHabitAction="pickdate"
          confirmedCustomDate={customDate}
        />,
      );

      // Should format as "MMM d" - Dec 30
      expect(screen.getByText(/Start Dec/)).toBeTruthy();
    });

    it('defaults to "Decide tomorrow" for null action', () => {
      render(<SwipeHintText candidateKind="habit" selectedHabitAction={null} />);

      expect(screen.getByText('Decide tomorrow')).toBeTruthy();
    });
  });

  describe('note/log hints', () => {
    it('shows "Keep as note" for justsave action', () => {
      render(<SwipeHintText candidateKind="note" selectedQuickAction="justsave" />);

      expect(screen.getByText('Keep as note')).toBeTruthy();
    });

    it('shows "Pick a reminder date" for remindlater without confirmed date', () => {
      render(<SwipeHintText candidateKind="note" selectedQuickAction="remindlater" />);

      expect(screen.getByText('Pick a reminder date')).toBeTruthy();
    });

    it('shows "Add to a space" for addtospace action', () => {
      render(<SwipeHintText candidateKind="note" selectedQuickAction="addtospace" />);

      expect(screen.getByText('Add to a space')).toBeTruthy();
    });

    it('shows "Convert to todo" for maketodo action', () => {
      render(<SwipeHintText candidateKind="note" selectedQuickAction="maketodo" />);

      expect(screen.getByText('Convert to todo')).toBeTruthy();
    });

    it('defaults to "Keep as note" for null action', () => {
      render(<SwipeHintText candidateKind="note" selectedQuickAction={null} />);

      expect(screen.getByText('Keep as note')).toBeTruthy();
    });
  });

  describe('left hint text', () => {
    it('shows "swipe left to archive" for todos', () => {
      render(<SwipeHintText candidateKind="todo" />);

      expect(screen.getByText(' swipe left to archive')).toBeTruthy();
    });

    it('shows "swipe left to remove" for habits', () => {
      render(<SwipeHintText candidateKind="habit" />);

      expect(screen.getByText(' swipe left to remove')).toBeTruthy();
    });

    it('shows "swipe left to archive" for notes', () => {
      render(<SwipeHintText candidateKind="note" />);

      expect(screen.getByText(' swipe left to archive')).toBeTruthy();
    });
  });

  describe('swipe instruction text', () => {
    it('shows "then swipe right" when action needs confirmation', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction="pickdate" />);

      expect(screen.getByText(' · then swipe right ')).toBeTruthy();
    });

    it('shows "swipe right to confirm" when action is ready', () => {
      render(<SwipeHintText candidateKind="todo" selectedQuickAction="tomorrow" />);

      expect(screen.getByText(' · swipe right to confirm ')).toBeTruthy();
    });
  });

  describe('animated arrows', () => {
    it('renders right arrow', () => {
      render(<SwipeHintText candidateKind="todo" />);

      expect(screen.getByText('→')).toBeTruthy();
    });

    it('renders left arrow', () => {
      render(<SwipeHintText candidateKind="todo" />);

      expect(screen.getByText('←')).toBeTruthy();
    });
  });
});
