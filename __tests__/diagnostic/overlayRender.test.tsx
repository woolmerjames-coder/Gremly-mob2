/**
 * DIAGNOSTIC TEST - Overlay Form Rendering
 * Purpose: Identify why forms are not rendering in ManualAddOverlay
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ManualAddOverlay } from '../../components/ManualAddOverlay';

describe('ManualAddOverlay - Diagnostic Render Test', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DIAGNOSTIC: renders overlay and checks tab switching', () => {
    render(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    // Log all testIDs on screen
    console.log('=== ALL ELEMENTS WITH TESTID ===');
    const allElements = screen.UNSAFE_getAllByType(() => true);
    console.log('Total elements:', allElements.length);

    // Check if overlay renders
    const overlay = screen.queryByTestId('manual-overlay');
    console.log('manual-overlay found:', !!overlay);

    // Check if body renders
    const body = screen.queryByTestId('manual-body');
    console.log('manual-body found:', !!body);

    // Check for tab buttons
    const tabHabits = screen.queryByTestId('tab-habits');
    const tabTodos = screen.queryByTestId('tab-todos');
    const tabJournal = screen.queryByTestId('tab-journal');
    const tabCatchall = screen.queryByTestId('tab-catchall');

    console.log('tab-habits found:', !!tabHabits);
    console.log('tab-todos found:', !!tabTodos);
    console.log('tab-journal found:', !!tabJournal);
    console.log('tab-catchall found:', !!tabCatchall);

    // Check for Habits form elements
    const habitToggleStart = screen.queryByTestId('habit-toggle-start');
    const habitToggleBreak = screen.queryByTestId('habit-toggle-break');
    const habitNameInput = screen.queryByTestId('habit-start-name');

    console.log('habit-toggle-start found:', !!habitToggleStart);
    console.log('habit-toggle-break found:', !!habitToggleBreak);
    console.log('habit-start-name found:', !!habitNameInput);

    // Switch to To-Dos tab
    if (tabTodos) {
      console.log('\n=== SWITCHING TO TODOS TAB ===');
      fireEvent.press(tabTodos);

      setTimeout(() => {
        const todoNameInput = screen.queryByTestId('todo-name');
        console.log('After switch - todo-name found:', !!todoNameInput);
      }, 300);
    }

    // Switch to Journal tab
    if (tabJournal) {
      console.log('\n=== SWITCHING TO JOURNAL TAB ===');
      fireEvent.press(tabJournal);

      setTimeout(() => {
        const journalEntry = screen.queryByTestId('journal-entry');
        console.log('After switch - journal-entry found:', !!journalEntry);
      }, 300);
    }

    // Switch to Catch-All tab
    if (tabCatchall) {
      console.log('\n=== SWITCHING TO CATCHALL TAB ===');
      fireEvent.press(tabCatchall);

      setTimeout(() => {
        const catchallEntry = screen.queryByTestId('catchall-entry');
        const reminders = screen.queryByTestId('reminders-pinned');
        console.log('After switch - catchall-entry found:', !!catchallEntry);
        console.log('After switch - reminders-pinned found (should be false):', !!reminders);
      }, 300);
    }
  });

  it('DIAGNOSTIC: checks if forms are in DOM but hidden', () => {
    const { debug } = render(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    console.log('\n=== COMPONENT TREE DEBUG ===');
    debug();
  });
});
