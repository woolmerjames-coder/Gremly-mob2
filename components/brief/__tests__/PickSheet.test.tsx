import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { PickSheet } from '../PickSheet';
import {
  pickButtonWords,
  pickItemsOf,
  roomWords,
  timeLeftWords,
} from '../../../lib/plan/pickItems';

const items = pickItemsOf(
  {
    todosDue: [
      { id: 'taxes', name: 'Do Taxes', time_estimate_minutes: 60 } as any,
      { id: 'tap', name: 'Fix the Tap', time_estimate_minutes: 45 } as any,
      { id: 'logos', name: 'Add Logos' } as any,
    ],
    habitsToday: [{ id: 'run', name: 'Run', time_estimate_minutes: 45 } as any],
    behind: [{ id: 'strength', name: 'Strength', time_estimate_minutes: 45 } as any],
    habitWeeks: [],
  },
  'Due today',
);

function sheet(extra: Partial<React.ComponentProps<typeof PickSheet>> = {}) {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const r = render(
    <PickSheet
      visible
      title="Add to the plan"
      free={120}
      todos={items.todos}
      habits={items.habits}
      confirmWords={(n, m) => pickButtonWords('Add', n, m)}
      onConfirm={onConfirm}
      onClose={onClose}
      {...extra}
    />,
  );
  return { r, onConfirm, onClose };
}

describe('the pick sheet', () => {
  it('lists the day with lengths, behind habits first, and a stand-in length where there is none', () => {
    expect(items.todos.map((t) => t.meta)).toEqual([
      '1h, due today',
      '45m, due today',
      'About 30m, due today',
    ]);
    expect(items.habits.map((h) => [h.id, h.behind])).toEqual([
      ['strength', true],
      ['run', false],
    ]);
  });

  it('never lists a habit they are breaking: there is nothing of it to plan', () => {
    const withBreaking = pickItemsOf(
      {
        todosDue: [],
        habitsToday: [
          { id: 'run', name: 'Run', time_estimate_minutes: 45 } as any,
          { id: 'sugar', name: 'No sugar', subtype: 'break_habit' } as any,
        ],
        behind: [{ id: 'phone', name: 'No phone in bed', subtype: 'break_habit' } as any],
        habitWeeks: [],
      },
      'Due today',
    );
    expect(withBreaking.habits.map((h) => h.id)).toEqual(['run']);
  });

  it('stays open while they pick several, shows the time they take, and adds them all at once', () => {
    const { r, onConfirm, onClose } = sheet();
    fireEvent.press(r.getByTestId('pick-taxes'));
    fireEvent.press(r.getByTestId('pick-tap'));
    expect(r.getByText('1h 45m picked')).toBeTruthy();
    expect(r.getByText('15m left')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-logos'));
    expect(r.getByText('15m over')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-logos'));
    expect(onClose).not.toHaveBeenCalled();
    expect(r.getByText('Add 2, 1h 45m')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].map((x: any) => x.id)).toEqual(['taxes', 'tap']);
  });

  it('counts the gaps the plan keeps when it is told how the picks sit in the day', () => {
    // two hours free. Each pick takes its own time and the 15 minutes after it
    const room = jest.fn((picks: { minutes: number }[]) => {
      const used = picks.reduce((a, p) => a + p.minutes + 15, 0);
      if (used <= 120) return { fit: 'spaced' as const, left: 120 - used, over: 0 };
      const bare = picks.reduce((a, p) => a + p.minutes, 0);
      return bare <= 120
        ? { fit: 'tight' as const, left: 0, over: 0 }
        : { fit: 'over' as const, left: 0, over: picks[picks.length - 1].minutes };
    });
    const { r } = sheet({ room });
    expect(r.getByText('2h left')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-taxes'));
    // an hour picked leaves 45 minutes, not an hour: its gap is counted
    expect(r.getByText('1h picked')).toBeTruthy();
    expect(r.getByText('45m left')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-tap'));
    // 1h 45m of picks in 2h: only with no gaps between them
    expect(r.getByText('1h 45m picked')).toBeTruthy();
    expect(r.getByText('Only fits back to back')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-logos'));
    expect(r.getByText("30m won't fit")).toBeTruthy();
    expect(room).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'logos' })]),
    );
  });

  it('opens on the tab it was last left on', () => {
    const { r } = sheet();
    fireEvent.press(r.getByTestId('pick-tab-habits'));
    expect(r.getByTestId('pick-strength')).toBeTruthy();
    r.unmount();
    const again = sheet();
    expect(again.r.getByTestId('pick-run')).toBeTruthy();
    fireEvent.press(again.r.getByTestId('pick-tab-todos'));
  });

  it("shows what is in the plan already, and can't pick it twice", () => {
    const { r } = sheet({ inPlan: new Set(['taxes']) });
    expect(r.getByText('In the plan')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-taxes'));
    expect(r.getByText('Nothing picked yet')).toBeTruthy();
  });

  it("puts Gremly's suggestions on top, with Pick all, and asks for help when nothing is picked", () => {
    const onAsk = jest.fn();
    const { r, onConfirm } = sheet({
      suggested: [{ ...items.todos[0], reason: 'Due today' }],
      askWords: 'Not sure? Help me choose',
      onAsk,
    });
    expect(r.getByText('Gremly suggests')).toBeTruthy();
    fireEvent.press(r.getByTestId('pick-confirm'));
    expect(onAsk).toHaveBeenCalled();
    fireEvent.press(r.getByTestId('pick-all'));
    fireEvent.press(r.getByTestId('pick-confirm'));
    expect(onConfirm.mock.calls[0][0].map((x: any) => x.id)).toEqual(['taxes']);
  });

  it('says Gremly is looking while its suggestions are on their way', () => {
    const { r } = sheet({ suggested: null });
    expect(r.getByText('Gremly is looking at your day')).toBeTruthy();
  });

  it('words the time left', () => {
    expect(timeLeftWords(90, 0)).toEqual({
      picked: 'Nothing picked yet',
      left: '1h 30m left',
      over: false,
    });
    expect(timeLeftWords(60, 90)).toEqual({
      picked: '1h 30m picked',
      left: '30m over',
      over: true,
    });
  });
  it('words how the picks sit in the day', () => {
    expect(roomWords(0, { fit: 'spaced', left: 90, over: 0 })).toEqual({
      picked: 'Nothing picked yet',
      left: '1h 30m left',
      over: false,
      fill: 0,
    });
    expect(roomWords(60, { fit: 'spaced', left: 60, over: 0 })).toMatchObject({
      picked: '1h picked',
      left: '1h left',
      fill: 0.5,
    });
    expect(roomWords(105, { fit: 'tight', left: 0, over: 0 })).toEqual({
      picked: '1h 45m picked',
      left: 'Only fits back to back',
      over: false,
      fill: 1,
    });
    expect(roomWords(135, { fit: 'over', left: 0, over: 30 })).toEqual({
      picked: '2h 15m picked',
      left: "30m won't fit",
      over: true,
      fill: 1,
    });
  });
});
