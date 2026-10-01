import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DayCard } from '../DayCard';
import type { DayCardData } from '../../../lib/brief/useDayCard';

function data(over: Partial<DayCardData> = {}): DayCardData {
  return {
    date: '2026-09-30',
    now: 465,
    meetings: [{ id: 'm', title: 'Standup', start: 480, end: 510 }],
    planned: [],
    todosDue: [],
    habitsToday: [],
    habitWeeks: [],
    behind: [],
    sweepWaiting: 7,
    overdue: 3,
    chip: 'Anniversary in 13 days',
    returnDay: false,
    lines: {
      meetings: '8 today, first at 8:00',
      todos: '1 due, Buy Oat Milk',
      habits: { text: '8 today, 1 behind this week', warn: true },
      sweep: { text: '7 waiting, 3 past their dates', warn: true },
    },
    ...over,
  };
}

describe('DayCard', () => {
  it('shows the date, the countdown and every row', () => {
    const r = render(<DayCard data={data()} onRow={jest.fn()} />);
    expect(r.getByText('WED 30 SEP')).toBeTruthy();
    expect(r.getByText('Anniversary in 13 days')).toBeTruthy();
    expect(r.getByText('8 today, first at 8:00')).toBeTruthy();
    expect(r.getByText('1 due, Buy Oat Milk')).toBeTruthy();
    expect(r.getByText('8 today, 1 behind this week')).toBeTruthy();
    expect(r.getByText('7 waiting, 3 past their dates')).toBeTruthy();
    expect(r.getByTestId('day-strip')).toBeTruthy();
  });

  it('leaves the chip off when the context has no dated anchor', () => {
    const r = render(<DayCard data={data({ chip: null })} onRow={jest.fn()} />);
    expect(r.queryByTestId('brief-countdown-chip')).toBeNull();
  });

  it('reports which row was tapped', () => {
    const onRow = jest.fn();
    const r = render(<DayCard data={data()} onRow={onRow} />);
    fireEvent.press(r.getByTestId('day-card-meetings'));
    fireEvent.press(r.getByTestId('day-card-habits'));
    fireEvent.press(r.getByTestId('day-card-sweep'));
    expect(onRow.mock.calls.map((c) => c[0])).toEqual(['meetings', 'habits', 'sweep']);
  });

  it('keeps the warning colour off on a return day', () => {
    const warnColor = '#9A6B12';
    const flat = (el: any) =>
      []
        .concat(el.props.style)
        .filter(Boolean)
        .reduce((a: any, s: any) => ({ ...a, ...s }), {});
    const normal = render(<DayCard data={data()} onRow={jest.fn()} />);
    expect(flat(normal.getByText('8 today, 1 behind this week')).color).toBe(warnColor);
    const calm = render(<DayCard data={data({ returnDay: true })} onRow={jest.fn()} />);
    expect(flat(calm.getByText('8 today, 1 behind this week')).color).not.toBe(warnColor);
  });
});
