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
import { PrivateImage } from '../../PrivateImage';
import { useEntryPhotosStore } from '../../../lib/journal/photos';
import { useEntryFactsStore } from '../../../lib/journal/took';
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

  it('shows an entry written on the journal page by its first answer, and how many more', () => {
    const page = {
      ...saved,
      text: 'What am I proud of today?\nThe deck.\n\nWhat am I grateful for?\nThe run.\n\nTired.',
      parts: [
        { q: 'What am I proud of today?', text: 'The deck.' },
        { q: 'What am I grateful for?', text: 'The run.' },
        { q: null, text: 'Tired.' },
      ],
    };
    const r = render(<WrapJournalCard meta={page} />);
    expect(r.getByText('What am I proud of today?')).toBeTruthy();
    expect(r.getByText('The deck.')).toBeTruthy();
    expect(r.getByText('and two more answers')).toBeTruthy();
    expect(r.queryByText('The run.')).toBeNull();
    // one answer has nothing more to count
    const one = render(<WrapJournalCard meta={{ ...page, parts: [page.parts[2]] }} />);
    expect(one.getByText('Tired.')).toBeTruthy();
    expect(one.queryByText(/more answer/)).toBeNull();
  });

  it('opens the entry on the journal page', () => {
    const onOpen = jest.fn();
    const r = render(<WrapJournalCard meta={saved} onOpen={onOpen} />);
    fireEvent.press(r.getByTestId('wrap-journal-open'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(render(<WrapJournalCard meta={saved} />).queryByTestId('wrap-journal-open')).toBeNull();
  });

  it('shows the first three photos saved with the entry, and how many more there are', () => {
    const photo = (id: string, position: number) => ({
      id,
      url: `file:///${id}.jpg`,
      position,
    });
    useEntryPhotosStore.setState({
      byEntry: { [saved.note_id]: ['a', 'b', 'c', 'd', 'e'].map(photo) },
    });
    const r = render(<WrapJournalCard meta={saved} />);
    expect(r.getByTestId('wrap-journal-photos').findAllByType(PrivateImage)).toHaveLength(3);
    expect(r.getByText('+2')).toBeTruthy();
    useEntryPhotosStore.setState({ byEntry: {} });
  });

  it('says what Gremly took from the entry once he has read it, with the list behind it', () => {
    useEntryFactsStore.setState({
      byEntry: {
        [saved.note_id]: [
          {
            id: 'f1',
            statement: 'Ran eleven miles.',
            quote: null,
            private: false,
            standing: 'held',
          },
          {
            id: 'f2',
            statement: 'Is training for a 10k.',
            quote: null,
            private: false,
            standing: 'held',
          },
        ],
      },
    });
    const r = render(<WrapJournalCard meta={saved} />);
    expect(r.getByText('Gremly took two things from this')).toBeTruthy();
    expect(r.queryByTestId('journal-took-sheet')).toBeNull();
    fireEvent.press(r.getByTestId('journal-took-line'));
    expect(r.getByTestId('journal-took-sheet')).toBeTruthy();
    expect(r.getByText('Is training for a 10k.')).toBeTruthy();
    fireEvent.press(r.getByTestId('journal-took-close'));
    expect(r.queryByTestId('journal-took-sheet')).toBeNull();
    useEntryFactsStore.setState({ byEntry: {} });
  });

  it('says nothing about Gremly for an entry he has not read, or took nothing from', () => {
    useEntryFactsStore.setState({ byEntry: {} });
    const r = render(<WrapJournalCard meta={saved} />);
    expect(r.queryByTestId('journal-took-line')).toBeNull();
    expect(r.queryByText(/Gremly took/)).toBeNull();
  });

  it('has no row of photos for an entry without any', () => {
    useEntryPhotosStore.setState({ byEntry: {} });
    expect(
      render(<WrapJournalCard meta={saved} />).queryByTestId('wrap-journal-photos'),
    ).toBeNull();
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
    // with nothing more to offer, it has no way to the journal page
    expect(r.queryByTestId('reply-tag-expand')).toBeNull();
  });

  it('the journal pill opens the full page, by its arrows', () => {
    const onExpand = jest.fn();
    const r = render(
      <ReplyTag
        label="Saving to your journal"
        kind="journal"
        onCancel={jest.fn()}
        onExpand={onExpand}
        expandHint="Open the full journal page"
      />,
    );
    fireEvent.press(r.getByLabelText('Open the full journal page'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('with a page half written, the pill says so and offers to open it', () => {
    const onExpand = jest.fn();
    const r = render(
      <ReplyTag
        label="Draft in your journal"
        kind="journal"
        onExpand={onExpand}
        expandLabel="Open"
      />,
    );
    expect(r.getByText('Draft in your journal')).toBeTruthy();
    fireEvent.press(r.getByText('Open'));
    expect(onExpand).toHaveBeenCalledTimes(1);
    // the next message can only join the draft, so there is no X
    expect(r.queryByTestId('reply-tag-cancel')).toBeNull();
  });
});
