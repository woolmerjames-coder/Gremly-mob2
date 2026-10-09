/**
 * A Sweep card for a todo with a deadline and no day planned (stage 2c): the
 * header schedules it and says it is due today, then overdue.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ContextHeader } from '../ContextHeader';
import { todoCardStatus } from '../TodoActionZone';
import type { SweepCardMeta } from '../../../lib/sweep/types';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { Calendar: (props: any) => <View {...props} /> };
});

const meta = (o: Partial<SweepCardMeta>) => ({ isNew: false, ...o }) as SweepCardMeta;

describe('the Sweep card header for a todo here by its deadline', () => {
  it('says due today on its deadline, then overdue', () => {
    expect(todoCardStatus(meta({ todoStatus: 'due_today', byDeadline: true }))).toBe(
      'deadline_today',
    );
    expect(todoCardStatus(meta({ todoStatus: 'overdue', byDeadline: true }))).toBe(
      'deadline_passed',
    );
    // a new drop with its deadline today still says so
    expect(todoCardStatus(meta({ todoStatus: 'due_today', byDeadline: true, isNew: true }))).toBe(
      'deadline_today',
    );
    // a planned day keeps its own words
    expect(todoCardStatus(meta({ todoStatus: 'overdue', byDeadline: false }))).toBe('overdue');
  });

  it('schedules it, with the deadline words on the badge', () => {
    const { unmount } = render(<ContextHeader status="deadline_today" />);
    expect(screen.getByText('SCHEDULE FOR')).toBeTruthy();
    expect(screen.getByText('due today')).toBeTruthy();
    unmount();
    render(<ContextHeader status="deadline_passed" />);
    expect(screen.getByText('overdue')).toBeTruthy();
  });
});
