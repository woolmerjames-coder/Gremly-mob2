/**
 * DupeLine: the quiet duplicate line (Mind Drop rethink stage 6). You already
 * have this, the item's state in bold, and Keep just one, at least 32 high.
 * Nothing is asked.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    { get: (_t, name) => () => React.createElement(View, { testID: `icon-${String(name)}` }) },
  );
});
jest.mock('../../../design/animations', () => ({ useReducedMotion: () => true }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

import { DupeLine } from '../DupeLine';

describe('DupeLine', () => {
  it('says You already have this, with the state of the one they have', () => {
    const r = render(<DupeLine state="due today" onKeepOne={jest.fn()} testID="dupe" />);
    expect(r.getByText(/^You already have this/)).toBeTruthy();
    expect(r.getByText('due today')).toBeTruthy();
    expect(r.getByTestId('icon-ListChecks')).toBeTruthy();
    // no question anywhere
    expect(r.queryByText(/\?/)).toBeNull();
  });

  it('reads on its own when the state is not known', () => {
    const r = render(<DupeLine state={null} onKeepOne={jest.fn()} testID="dupe" />);
    expect(r.getByText('You already have this')).toBeTruthy();
  });

  it('Keep just one is a button at least 32 high', () => {
    const keep = jest.fn();
    const r = render(<DupeLine state="every morning" onKeepOne={keep} testID="dupe" />);
    const button = r.getByTestId('dupe-keep-one');
    expect(button).toHaveStyle({ minHeight: 32, borderRadius: 9 });
    expect(r.getByText('Keep just one')).toBeTruthy();
    fireEvent.press(button);
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it('cannot be tapped again while it saves, and says so when it did not go through', () => {
    const keep = jest.fn();
    const r = render(<DupeLine state="due Fri" onKeepOne={keep} busy testID="dupe" />);
    fireEvent.press(r.getByTestId('dupe-keep-one'));
    expect(keep).not.toHaveBeenCalled();
    r.rerender(
      <DupeLine
        state="due Fri"
        error="That one is no longer on your list."
        onKeepOne={keep}
        testID="dupe"
      />,
    );
    expect(r.getByText('That one is no longer on your list.')).toBeTruthy();
    expect(r.queryByText(/You already have this/)).toBeNull();
  });
});
