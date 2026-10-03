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

describe('the card in the thread', () => {
  // the thread's rows are memoized (BriefMessage), so a card drawn while its
  // changes were saving must be drawn again once saving ends, or Undo is dead
  const { act } = require('@testing-library/react-native');
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
    let setState: (s: { busy: boolean; undoable: string[] }) => void = () => {};
    function Thread() {
      const [state, set] = React.useState({ busy: true, undoable: [] as string[] });
      setState = set;
      const canUndo = React.useCallback(
        (id: string) => state.undoable.includes(id),
        [state.undoable],
      );
      const renderChanges = useRenderChanges({
        busy: state.busy,
        apply: jest.fn(),
        dismiss: jest.fn(),
        undo,
        canUndo,
      });
      return <BriefMessage message={message} renderChanges={renderChanges} />;
    }
    const r = render(<Thread />);
    // drawn while the changes were still being saved
    expect(r.queryByTestId('changes-undo')).toBeNull();
    act(() => setState({ busy: false, undoable: ['m1'] }));
    fireEvent.press(r.getByTestId('changes-undo'));
    expect(undo).toHaveBeenCalledWith(message);
  });
});
