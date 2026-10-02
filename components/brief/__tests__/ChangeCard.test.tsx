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
