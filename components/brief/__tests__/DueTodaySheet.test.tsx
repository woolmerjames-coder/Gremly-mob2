import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { DueTodaySheet } from '../DueTodaySheet';
import type { DayCardData } from '../../../lib/brief/useDayCard';

const social = {
  id: 'social',
  name: 'Social Media Posts',
  cadence: 'weekly',
  target_per_period: 3,
} as any;
const pushups = { id: 'pushups', name: 'Pushups', cadence: 'weekly', target_per_period: 2 } as any;
const messaging = { id: 'messaging', name: 'Messaging People Back', cadence: 'daily' } as any;

function data(): DayCardData {
  return {
    date: '2026-09-30',
    now: 465,
    meetings: [],
    planned: [{ id: 'oat', title: 'Buy Oat Milk', start: 930, end: 950, kind: 'todo' }],
    todosDue: [
      { id: 'oat', name: 'Buy Oat Milk', time_estimate_minutes: 20 } as any,
      { id: 'plumber', name: 'Call the Plumber' } as any,
    ],
    habitsToday: [pushups, messaging],
    habitWeeks: [
      { habit: social, done: 0, target: 3, behind: true },
      { habit: pushups, done: 0, target: 2, behind: false },
      { habit: messaging, done: 2, target: null, behind: false },
    ],
    behind: [social],
    sweepWaiting: 0,
    overdue: 0,
    chip: null,
    returnDay: false,
    record: {
      date: '2026-09-30',
      travel: null,
      away: null,
      blocks: [],
      busy: [],
      planEnd: 22 * 60,
      duringTravel: [],
      chip: null,
    },
    lines: {
      meetings: '',
      todos: '',
      habits: { text: '', warn: false },
      sweep: { text: '', warn: false },
    },
  };
}

describe('DueTodaySheet, with their week', () => {
  const today = () => {
    const d = data();
    return {
      ...d,
      todosDue: [
        ...d.todosDue,
        {
          id: 'step',
          name: 'Draft the cover letter',
          due_day: d.date,
          time_estimate_minutes: 30,
          views: { milestone: { goal: 'Send the grant application', date: '2026-10-20' } },
        } as any,
        { id: 'back', name: 'Renew the passport', due_day: null, resurface_at: d.date } as any,
      ],
      weekHabits: new Set(['pushups']),
    };
  };

  it('says what a milestone step is a step towards, and when a todo is back from Later', () => {
    const r = render(
      <DueTodaySheet visible onClose={jest.fn()} data={today()} initialTab="todos" />,
    );
    const words = (id: string) =>
      r
        .getByTestId(`due-todo-${id}`)
        .findAll((n: any) => typeof n.props.children === 'string')
        .map((n: any) => n.props.children as string)
        .join(' | ');
    expect(words('step')).toContain('A step towards Send the grant application');
    expect(words('step')).toContain('30m');
    expect(words('back')).toContain('Back from Later');
    expect(words('plumber')).not.toContain('A step towards');
  });

  it('says which habits they planned for the day in their week', () => {
    const r = render(
      <DueTodaySheet visible onClose={jest.fn()} data={today()} initialTab="habits" />,
    );
    expect(r.getByTestId('due-planned-pushups')).toBeTruthy();
    expect(r.queryByTestId('due-planned-messaging')).toBeNull();
    // a sheet with no week to read shows the habits as it always has
    const plain = render(
      <DueTodaySheet visible onClose={jest.fn()} data={data()} initialTab="habits" />,
    );
    expect(plain.queryByTestId('due-planned-pushups')).toBeNull();
  });
});

describe('DueTodaySheet', () => {
  it('for the day being planned, says what is due that day by its name', () => {
    const r = render(
      <DueTodaySheet
        visible
        onClose={jest.fn()}
        data={{ ...data(), todosDue: [] }}
        initialTab="todos"
      />,
    );
    // 30 September 2026 is a Wednesday, and not today
    expect(r.getByText('Nothing due Wednesday')).toBeTruthy();
  });

  it('lists todos due today, with a planned time where the plan placed one', () => {
    const r = render(<DueTodaySheet visible onClose={jest.fn()} data={data()} />);
    expect(r.getByText('Todos (2)')).toBeTruthy();
    expect(r.getByText('3:30 PM')).toBeTruthy();
  });

  it('has no Lock In button on a row', () => {
    const r = render(<DueTodaySheet visible onClose={jest.fn()} data={data()} />);
    expect(r.queryByTestId('due-lock-plumber')).toBeNull();
    expect(r.queryByText(/lock/i)).toBeNull();
  });

  it('shows habits with the week, behind ones first and tagged', () => {
    const r = render(
      <DueTodaySheet visible onClose={jest.fn()} data={data()} initialTab="habits" />,
    );
    expect(r.getByText('Habits (3)')).toBeTruthy();
    expect(r.getByTestId('due-behind-social')).toBeTruthy();
    expect(r.queryByTestId('due-behind-pushups')).toBeNull();
    expect(r.getByText('0 of 3 this week')).toBeTruthy();
    expect(r.getByText('Daily')).toBeTruthy();
  });
});
