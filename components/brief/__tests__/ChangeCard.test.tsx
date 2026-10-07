import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChangeCard } from '../ChangeCard';
import type { BriefChangesMeta } from '../../../lib/brief/types';

const META: BriefChangesMeta = {
  type: 'brief-changes',
  status: 'open',
  changes: [
    {
      cid: 'c1',
      kind: 'retime',
      label: 'Call Mum at 12pm',
      id: 'mum',
      item: 'todo',
      title: 'Call Mum',
      start: 720,
    },
    {
      cid: 'c2',
      kind: 'add_block',
      label: 'Leave for the airport at 12:30pm',
      title: 'Leave for the airport',
      start: 750,
      travel: true,
    },
  ],
};

describe('the change card', () => {
  it('lists every change, ticked, and applies what stays ticked', () => {
    const onApply = jest.fn();
    const r = render(<ChangeCard meta={META} onApply={onApply} />);
    expect(r.getByText("Here's what I'll change")).toBeTruthy();
    expect(r.getByText('Call Mum at 12pm')).toBeTruthy();
    fireEvent.press(r.getByTestId('change-c2'));
    fireEvent.press(r.getByTestId('changes-apply'));
    expect(onApply).toHaveBeenCalledWith(['c2']);
  });

  it('says it is saving as soon as Accept is tapped, and goes back if the card stays open', () => {
    const onApply = jest.fn();
    const r = render(<ChangeCard meta={META} onApply={onApply} />);
    fireEvent.press(r.getByTestId('changes-apply'));
    expect(r.getByText('Saving…')).toBeTruthy();
    // a second tap does nothing while it saves
    fireEvent.press(r.getByTestId('changes-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    r.rerender(<ChangeCard meta={META} onApply={onApply} interactive={false} />);
    r.rerender(<ChangeCard meta={META} onApply={onApply} interactive />);
    expect(r.getByText('Accept all')).toBeTruthy();
  });

  it('says Accept for one row', () => {
    const one = { ...META, changes: [META.changes[0]] };
    expect(render(<ChangeCard meta={one} onApply={jest.fn()} />).getByText('Accept')).toBeTruthy();
  });

  it('says Accept all while every row is ticked, and how many otherwise', () => {
    const r = render(<ChangeCard meta={META} onApply={jest.fn()} />);
    expect(r.getByText('Accept all')).toBeTruthy();
    fireEvent.press(r.getByTestId('change-c1'));
    expect(r.getByText('Apply 1')).toBeTruthy();
  });

  it('after Apply, one Undo puts it all back while it can', () => {
    const onUndo = jest.fn();
    const applied = { ...META, status: 'applied' as const, applied: ['c1', 'c2'] };
    const r = render(<ChangeCard meta={applied} onUndo={onUndo} />);
    fireEvent.press(r.getByTestId('changes-undo'));
    expect(onUndo).toHaveBeenCalled();
    expect(render(<ChangeCard meta={applied} />).queryByTestId('changes-undo')).toBeNull();
    expect(
      render(<ChangeCard meta={{ ...META, status: 'undone' }} />).getByText('Put back as it was'),
    ).toBeTruthy();
  });

  it('Not now leaves everything as it is', () => {
    const onDismiss = jest.fn();
    const r = render(<ChangeCard meta={META} onDismiss={onDismiss} />);
    fireEvent.press(r.getByTestId('changes-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
    expect(
      render(<ChangeCard meta={{ ...META, status: 'dismissed' }} />).getByText('Left as it is'),
    ).toBeTruthy();
  });

  it('after Apply, shows what was changed and what could not be', () => {
    const r = render(
      <ChangeCard meta={{ ...META, status: 'applied', applied: ['c1'], failed: ['c2'] }} />,
    );
    expect(r.getByText('Changed')).toBeTruthy();
    expect(r.getByText('Call Mum at 12pm')).toBeTruthy();
    expect(r.getByText('Leave for the airport at 12:30pm (could not be saved)')).toBeTruthy();
  });
});

describe("the agent's card", () => {
  it("draws each row from the change model's own words", () => {
    const meta: BriefChangesMeta = {
      type: 'brief-changes',
      status: 'open',
      changes: [],
      card: [
        {
          cid: 'c1',
          op: 'plan',
          type: null,
          id: null,
          title: 'Leave for the airport',
          plan: {
            kind: 'add_block',
            start: 750,
            end: null,
            travel: true,
            title: 'Leave for the airport',
          },
        },
        { cid: 'c2', op: 'skip_today', type: 'habit', id: 'run', title: 'Run' },
      ],
    } as BriefChangesMeta;
    const onApply = jest.fn();
    const r = render(<ChangeCard meta={meta} onApply={onApply} />);
    expect(r.getByText('Leave for the airport at 12:30pm')).toBeTruthy();
    expect(r.getByText('Skip Run today')).toBeTruthy();
    fireEvent.press(r.getByTestId('changes-apply'));
    expect(onApply).toHaveBeenCalledWith([]);
  });
});

describe('a row opens the item it is about', () => {
  const { useGremlyStore } = require('../../../lib/store/useGremlyStore');
  const card = (extra: Partial<BriefChangesMeta> = {}): BriefChangesMeta =>
    ({
      type: 'brief-changes',
      status: 'open',
      changes: [],
      card: [
        { cid: 'c1', op: 'change', type: 'todo', id: 'vet', title: 'Vet visit', fields: {} },
        { cid: 'c2', op: 'add', type: 'todo', id: null, title: 'Buy cat food', fields: {} },
        {
          cid: 'c3',
          op: 'plan',
          type: null,
          id: null,
          title: 'Leave for the airport',
          plan: { kind: 'add_block', start: 750, end: null, title: 'Leave for the airport' },
        },
        { cid: 'c4', op: 'skip_today', type: 'habit', id: 'run', title: 'Run' },
      ],
      ...extra,
    }) as BriefChangesMeta;

  beforeEach(() => {
    useGremlyStore.setState({
      todos: [
        { id: 'vet', name: 'Vet visit' },
        { id: 'food', name: 'Buy cat food' },
      ],
      habits: [{ id: 'run', name: 'Run' }],
      notes: [],
    });
  });
  afterEach(() => useGremlyStore.setState({ todos: [], habits: [], notes: [] }));

  it('opens the item when its words are tapped, and leaves the tick alone', () => {
    const onOpenItem = jest.fn();
    const onApply = jest.fn();
    const r = render(<ChangeCard meta={card()} onApply={onApply} onOpenItem={onOpenItem} />);
    fireEvent.press(r.getByTestId('change-open-c1'));
    expect(onOpenItem).toHaveBeenCalledWith({ id: 'vet', type: 'todo', title: 'Vet visit' });
    fireEvent.press(r.getByTestId('change-open-c4'));
    expect(onOpenItem).toHaveBeenLastCalledWith({ id: 'run', type: 'habit', title: 'Run' });
    // nothing was unticked by opening
    fireEvent.press(r.getByTestId('changes-apply'));
    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('keeps the tick on the box of a row that opens', () => {
    const onApply = jest.fn();
    const r = render(<ChangeCard meta={card()} onApply={onApply} onOpenItem={jest.fn()} />);
    expect(r.getByTestId('change-c1').props.accessibilityState.checked).toBe(true);
    fireEvent.press(r.getByTestId('change-c1'));
    expect(r.getByTestId('change-c1').props.accessibilityState.checked).toBe(false);
    fireEvent.press(r.getByTestId('changes-apply'));
    expect(onApply).toHaveBeenCalledWith(['c1']);
  });

  it('leaves a row with no item to open as one tick, words and all', () => {
    const onOpenItem = jest.fn();
    const r = render(<ChangeCard meta={card()} onApply={jest.fn()} onOpenItem={onOpenItem} />);
    // an item not made yet, and a set time
    expect(r.queryByTestId('change-open-c2')).toBeNull();
    expect(r.queryByTestId('change-open-c3')).toBeNull();
    fireEvent.press(r.getByText('Leave for the airport at 12:30pm'));
    expect(r.getByTestId('change-c3').props.accessibilityState.checked).toBe(false);
    expect(onOpenItem).not.toHaveBeenCalled();
  });

  it('after Apply, opens what was changed and what was made', () => {
    const onOpenItem = jest.fn();
    const r = render(
      <ChangeCard
        meta={card({ status: 'applied', applied: ['c1', 'c2', 'c3'], created: { c2: 'food' } })}
        onOpenItem={onOpenItem}
      />,
    );
    fireEvent.press(r.getByTestId('change-open-c1'));
    expect(onOpenItem).toHaveBeenLastCalledWith({ id: 'vet', type: 'todo', title: 'Vet visit' });
    fireEvent.press(r.getByTestId('change-open-c2'));
    expect(onOpenItem).toHaveBeenLastCalledWith({
      id: 'food',
      type: 'todo',
      title: 'Buy cat food',
    });
    expect(r.queryByTestId('change-open-c3')).toBeNull();
  });

  it('opens the item an item became, once that is done', () => {
    useGremlyStore.setState({ notes: [{ id: 'n1', title: 'Vet visit' }] });
    const meta = {
      type: 'brief-changes',
      status: 'applied',
      changes: [],
      applied: ['c1'],
      created: { c1: 'n1' },
      card: [{ cid: 'c1', op: 'convert', type: 'todo', id: 'vet', to: 'note', title: 'Vet visit' }],
    } as BriefChangesMeta;
    const onOpenItem = jest.fn();
    const r = render(<ChangeCard meta={meta} onOpenItem={onOpenItem} />);
    fireEvent.press(r.getByTestId('change-open-c1'));
    expect(onOpenItem).toHaveBeenCalledWith({ id: 'n1', type: 'note', title: 'Vet visit' });
  });

  it('looks the item up again when the row is tapped: one deleted since opens nothing', () => {
    const onOpenItem = jest.fn();
    const r = render(<ChangeCard meta={card()} onApply={jest.fn()} onOpenItem={onOpenItem} />);
    // the card is drawn once and kept, and the todo is deleted after that
    useGremlyStore.setState({ todos: [] });
    fireEvent.press(r.getByTestId('change-open-c1'));
    expect(onOpenItem).not.toHaveBeenCalled();
  });

  it('does not open an item that was put away', () => {
    useGremlyStore.setState({ todos: [{ id: 'vet', name: 'Vet visit', archived: true }] });
    const r = render(
      <ChangeCard meta={card({ status: 'applied', applied: ['c1'] })} onOpenItem={jest.fn()} />,
    );
    expect(r.queryByTestId('change-open-c1')).toBeNull();
    // the row is still there, as plain words
    expect(r.getByTestId('changes-applied')).toBeTruthy();
  });

  it('reads a row that could not be saved as it is shown', () => {
    const r = render(
      <ChangeCard
        meta={card({ status: 'applied', applied: [], failed: ['c1'] })}
        onOpenItem={jest.fn()}
      />,
    );
    expect(r.getByTestId('change-open-c1').props.accessibilityLabel).toMatch(
      /\(could not be saved\)$/,
    );
  });

  it('is a plain row when the item is no longer there, or nothing opens items', () => {
    useGremlyStore.setState({ todos: [] });
    const gone = render(<ChangeCard meta={card()} onApply={jest.fn()} onOpenItem={jest.fn()} />);
    expect(gone.queryByTestId('change-open-c1')).toBeNull();
    useGremlyStore.setState({ todos: [{ id: 'vet', name: 'Vet visit' }] });
    const plain = render(<ChangeCard meta={card()} onApply={jest.fn()} />);
    expect(plain.queryByTestId('change-open-c1')).toBeNull();
  });
});

describe('the card in the thread', () => {
  // the thread's rows are memoized (BriefMessage), so a card drawn while its
  // changes were saving must be drawn again once saving ends, or Undo is dead
  const { BriefMessage } = require('../BriefMessage');
  const { useRenderChanges } = require('../ChangeCard');

  const message = {
    id: 'm1',
    chat_id: 't1',
    role: 'system',
    content: '',
    created_at: '2026-10-03T08:49:20Z',
    metadata_json: { ...META, status: 'applied', applied: ['c1', 'c2'] },
  };

  it('answers Undo once saving has finished', () => {
    const undo = jest.fn(async () => {});
    function Thread({ busy, undoable }: { busy: boolean; undoable: string[] }) {
      const canUndo = React.useCallback((id: string) => undoable.includes(id), [undoable]);
      const renderChanges = useRenderChanges({
        busy,
        apply: jest.fn(),
        dismiss: jest.fn(),
        undo,
        canUndo,
      });
      return <BriefMessage message={message} renderChanges={renderChanges} />;
    }
    const r = render(<Thread busy={true} undoable={[]} />);
    // drawn while the changes were still being saved
    expect(r.queryByTestId('changes-undo')).toBeNull();
    r.rerender(<Thread busy={false} undoable={['m1']} />);
    fireEvent.press(r.getByTestId('changes-undo'));
    expect(undo).toHaveBeenCalledWith(message);
  });
});
