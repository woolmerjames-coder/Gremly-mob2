/**
 * The evening wrap up's cards in the thread: what each shows, and what its
 * buttons hand back. They are drawn from what was saved with the message.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { WrapRecapCard } from '../WrapRecapCard';
import { WrapReceiptCard } from '../WrapReceiptCard';
import { WrapHabitsCard } from '../WrapHabitsCard';
import { WrapJournalCard } from '../WrapJournalCard';
import { WrapItemCard } from '../WrapItemCard';
import { WrapEndMark } from '../WrapEndMark';
import { ReplyTag } from '../ReplyTag';
import type { SweepRecord } from '../../../lib/changes/sweep';

const DAY = '2026-09-30';

function rec(id: string, more: Partial<SweepRecord> = {}): SweepRecord {
  return {
    cid: `c-${id}`,
    op: 'change',
    type: 'todo',
    id,
    title: `Todo ${id}`,
    out: 'kept',
    label: 'Tomorrow',
    at: '2026-09-30T20:41:00.000Z',
    ...more,
  };
}

describe('the recap card', () => {
  const meta = {
    type: 'sweep-recap' as const,
    date: DAY,
    counts: { todos: 2, habits: 1, meetings: 8, drops: 3 },
    done: [
      { title: 'Buy Oat Milk', kind: 'todo' as const },
      { title: 'Run', kind: 'habit' as const },
    ],
    missed: [{ id: 't9', title: 'Book the car service' }],
    planned: { done: 4, total: 5 },
  };

  it('shows the day in counts and how the plan went', () => {
    const r = render(<WrapRecapCard meta={meta} />);
    expect(r.getByText('Wed 30 Sep')).toBeTruthy();
    expect(r.getByText('4 of 5 planned')).toBeTruthy();
    expect(r.getByText('todos done')).toBeTruthy();
    expect(r.getByText('habit')).toBeTruthy();
    expect(r.getByText('8')).toBeTruthy();
    // the list is behind one tap
    expect(r.queryByText('Buy Oat Milk')).toBeNull();
    fireEvent.press(r.getByTestId('wrap-recap-more'));
    expect(r.getByText('Buy Oat Milk')).toBeTruthy();
    expect(r.getByText('Book the car service')).toBeTruthy();
    expect(r.getByText('Not today')).toBeTruthy();
  });

  it('has no plan tag on a day with no plan, and no list when nothing was finished', () => {
    const r = render(<WrapRecapCard meta={{ ...meta, planned: null, done: [], missed: [] }} />);
    expect(r.queryByText(/planned/)).toBeNull();
    expect(r.queryByTestId('wrap-recap-more')).toBeNull();
  });
});

describe('the receipt', () => {
  const decisions = [
    rec('a'),
    rec('b', { op: 'archive', out: 'let_go', label: 'Let go' }),
    rec('c', { undone_at: '2026-09-30T21:00:00.000Z' }),
    rec('d', { op: 'keep', out: 'left', label: 'Left for next time' }),
  ];

  it('counts what stands, and lists each decision with its Undo while it is held', () => {
    const onUndo = jest.fn();
    const r = render(
      <WrapReceiptCard
        decisions={decisions}
        toSort={0}
        undoable={{ 'c-a': true, 'c-d': true }}
        onUndo={onUndo}
      />,
    );
    expect(r.getByText('Swept 2 things')).toBeTruthy();
    expect(r.getByText('1 kept, 1 let go, 1 put back, 1 left for next time')).toBeTruthy();
    fireEvent.press(r.getByTestId('wrap-receipt-toggle'));
    expect(r.getByText('Put back')).toBeTruthy();
    // Undo only where it is still held, and never for one left for next time
    expect(r.getByTestId('wrap-receipt-undo-a')).toBeTruthy();
    expect(r.queryByTestId('wrap-receipt-undo-b')).toBeNull();
    expect(r.queryByTestId('wrap-receipt-undo-c')).toBeNull();
    expect(r.queryByTestId('wrap-receipt-undo-d')).toBeNull();
    fireEvent.press(r.getByTestId('wrap-receipt-undo-a'));
    expect(onUndo).toHaveBeenCalledWith('c-a');
  });

  it('says how many are still to sort when the cards were closed part way', () => {
    const r = render(
      <WrapReceiptCard decisions={[rec('a')]} toSort={2} undoable={{}} onUndo={jest.fn()} />,
    );
    expect(r.getByText('1 kept, 2 still to sort')).toBeTruthy();
  });
});

describe('the habits card', () => {
  const meta = {
    type: 'sweep-habits' as const,
    date: DAY,
    habits: [
      { id: 'h1', title: 'Blinkist', kind: 'build' as const, note: 'Daily, 4 days running' },
      { id: 'h2', title: 'Stretch', kind: 'build' as const, note: 'Daily' },
      { id: 'h3', title: 'No coffee', kind: 'break' as const },
    ],
    already: ['Run'],
    status: 'open' as const,
  };

  it('saves what was tapped, in one go', () => {
    const onSave = jest.fn();
    const r = render(<WrapHabitsCard meta={meta} onSave={onSave} onAll={jest.fn()} />);
    expect(r.getByText('Nothing tonight')).toBeTruthy();
    expect(r.getByText('Already logged today: Run')).toBeTruthy();
    fireEvent.press(r.getByTestId('wrap-habit-h1'));
    fireEvent.press(r.getByTestId('wrap-habit-h3-held'));
    expect(r.getByText('Save check in')).toBeTruthy();
    fireEvent.press(r.getByTestId('wrap-habits-save'));
    expect(onSave).toHaveBeenCalledWith(['h1'], { h3: 'held' });
  });

  it('shows what was saved, with no buttons', () => {
    const saved = { ...meta, status: 'saved' as const, done: ['h1'], held: { h3: 'not' as const } };
    const r = render(<WrapHabitsCard meta={saved} />);
    expect(r.getByText("Tonight's check in")).toBeTruthy();
    expect(r.getByText('Logged')).toBeTruthy();
    expect(r.getByText('Not today, and that is okay')).toBeTruthy();
    expect(r.queryByTestId('wrap-habits-save')).toBeNull();
  });
});

describe('cards asked before the evening', () => {
  it('do not say tonight', () => {
    const habits = {
      type: 'sweep-habits' as const,
      date: DAY,
      habits: [{ id: 'h3', title: 'No coffee', kind: 'break' as const }],
      already: [],
      status: 'open' as const,
      early: true,
    };
    const open = render(<WrapHabitsCard meta={habits} onSave={jest.fn()} />);
    expect(open.getByText('None yet')).toBeTruthy();
    const saved = render(<WrapHabitsCard meta={{ ...habits, status: 'saved', held: {} }} />);
    expect(saved.getByText("Today's check in")).toBeTruthy();
    expect(saved.getByText('No answer yet')).toBeTruthy();
    const journal = render(
      <WrapJournalCard
        meta={{ type: 'sweep-journal', date: DAY, status: 'skipped', early: true }}
      />,
    );
    expect(journal.getByText('No journal yet')).toBeTruthy();
    // and in the evening they do
    const evening = render(
      <WrapJournalCard meta={{ type: 'sweep-journal', date: DAY, status: 'skipped' }} />,
    );
    expect(evening.getByText('No journal tonight')).toBeTruthy();
  });
});

describe('the journal card', () => {
  const saved = {
    type: 'sweep-journal' as const,
    date: DAY,
    status: 'saved' as const,
    note_id: 'n1',
    title: 'Wednesday evening',
    text: 'Tired but pleased.',
    moods: ['good', 'tired'],
  };

  it('shows the entry, its moods and Undo', () => {
    const onUndo = jest.fn();
    const r = render(<WrapJournalCard meta={saved} onEditMoods={jest.fn()} onUndo={onUndo} />);
    expect(r.getByText('Journal, Wed 30 Sep')).toBeTruthy();
    expect(r.getByText('Tired but pleased.')).toBeTruthy();
    expect(r.getByText('Good')).toBeTruthy();
    fireEvent.press(r.getByTestId('wrap-journal-undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('changes the moods on a saved entry', () => {
    const onEditMoods = jest.fn();
    const r = render(<WrapJournalCard meta={saved} onEditMoods={onEditMoods} />);
    fireEvent.press(r.getByTestId('wrap-journal-moods'));
    fireEvent.press(r.getByTestId('wrap-mood-calm'));
    fireEvent.press(r.getByTestId('wrap-mood-tired'));
    fireEvent.press(r.getByTestId('wrap-journal-done'));
    expect(onEditMoods).toHaveBeenCalledWith(['good', 'calm']);
  });

  it('just pick a mood: Save needs at least one', () => {
    const onSaveMoods = jest.fn();
    const onSkipMoods = jest.fn();
    const picking = { type: 'sweep-journal' as const, date: DAY, status: 'mood' as const };
    const r = render(
      <WrapJournalCard meta={picking} onSaveMoods={onSaveMoods} onSkipMoods={onSkipMoods} />,
    );
    fireEvent.press(r.getByTestId('wrap-journal-save'));
    expect(onSaveMoods).not.toHaveBeenCalled();
    fireEvent.press(r.getByTestId('wrap-mood-okay'));
    fireEvent.press(r.getByTestId('wrap-journal-save'));
    expect(onSaveMoods).toHaveBeenCalledWith(['okay']);
    fireEvent.press(r.getByTestId('wrap-journal-skip'));
    expect(onSkipMoods).toHaveBeenCalledTimes(1);
  });

  it('folds to one line once taken back out, or skipped', () => {
    expect(
      render(<WrapJournalCard meta={{ ...saved, status: 'removed' }} />).getByText(
        'Taken back out of your journal',
      ),
    ).toBeTruthy();
    expect(
      render(<WrapJournalCard meta={{ ...saved, status: 'skipped' }} />).getByText(
        'No journal tonight',
      ),
    ).toBeTruthy();
  });
});

describe('the item, the end and the pill', () => {
  it('shows the item an answer was about, to open', () => {
    const onOpen = jest.fn();
    const item = { id: 'n1', kind: 'note' as const, title: 'Dentist', when: 'Fri, Oct 2' };
    const r = render(<WrapItemCard meta={{ type: 'sweep-item', item }} onOpen={onOpen} />);
    expect(r.getByText('Note, Fri, Oct 2')).toBeTruthy();
    fireEvent.press(r.getByTestId('wrap-item-open'));
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('marks the day wrapped up', () => {
    const r = render(<WrapEndMark meta={{ type: 'sweep-end', date: DAY }} />);
    expect(r.getByText('Wednesday, wrapped up')).toBeTruthy();
    expect(r.getByText(/This thread moves to your history when the day ends at/)).toBeTruthy();
  });

  it('the pill says what the next message is, and its X hands it to Gremly', () => {
    const onCancel = jest.fn();
    const r = render(
      <ReplyTag label="Saving to your journal" kind="journal" onCancel={onCancel} />,
    );
    expect(r.getByText('Saving to your journal')).toBeTruthy();
    fireEvent.press(r.getByTestId('reply-tag-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
