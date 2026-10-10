/**
 * SplitBar: under a clear split's pieces (Mind Drop rethink stage 7). Split
 * into 3, and Keep as one: the pieces wait in place while one note is saved,
 * then fold into it, and Gremly's bubble says what it was kept as (One todo it is.).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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
jest.mock('../../../lib/minddrop/splitActions', () => ({
  keepPiecesAsOne: jest.fn(),
  piecesOf: jest.fn(),
}));

import { SplitBar } from '../SplitBar';
import { keepPiecesAsOne, piecesOf } from '../../../lib/minddrop/splitActions';
import { eventBus } from '../../../lib/events/EventBus';
import { DIDNT_GO } from '../../../lib/minddrop/plainError';
import * as Haptics from 'expo-haptics';

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

let said: unknown[] = [];
let offs: Array<() => void> = [];
beforeEach(() => {
  said = [];
  (Haptics.impactAsync as jest.Mock).mockResolvedValue(undefined);
  (piecesOf as jest.Mock).mockReturnValue([
    { kind: 'todo', item: { id: 'p0' } },
    { kind: 'todo', item: { id: 'p1' } },
    { kind: 'habit', item: { id: 'p2' } },
  ]);
  offs = [
    eventBus.on('minddrop:cards_leaving', (p) => said.push(['leaving', p])),
    eventBus.on('minddrop:cards_go', (p) => said.push(['go', p])),
    eventBus.on('minddrop:cards_stay', (p) => said.push(['stay', p])),
    eventBus.on('gremly:speak', (p) => said.push(['speak', p.message])),
  ];
});
afterEach(() => offs.forEach((off) => off()));

describe('the line under a clear split', () => {
  it('says how many it was split into, and offers Keep as one', () => {
    const r = render(<SplitBar groupId="d1" count={3} testID="bar" />);
    expect(r.getByText('Split into 3')).toBeTruthy();
    expect(r.getByText('Keep as one')).toBeTruthy();
  });

  it('Keep as one holds the pieces, saves one note, then folds them into it and Gremly says so', async () => {
    jest.useFakeTimers();
    (keepPiecesAsOne as jest.Mock).mockResolvedValue({
      itemId: 'k1',
      kindWord: 'todo',
      pieceIds: ['p0', 'p1', 'p2'],
      stayed: [],
    });
    const r = render(<SplitBar groupId="d1" count={3} testID="bar" />);
    fireEvent.press(r.getByTestId('bar-keep'));
    await flush();
    expect(keepPiecesAsOne).toHaveBeenCalledWith('d1');
    expect(said[0]).toEqual([
      'leaving',
      { ids: ['p0', 'p1', 'p2'], hold: true, as: 'fold', into: 'p0' },
    ]);
    expect(said[1]).toEqual(['go', { ids: ['p0', 'p1', 'p2'] }]);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    // the kind it was kept as (final check item 2)
    expect(said).toContainEqual(['speak', 'One todo it is.']);
    jest.useRealTimers();
  });

  it('keeps the pieces and says so when the note could not be saved', async () => {
    (keepPiecesAsOne as jest.Mock).mockRejectedValue(new Error('offline'));
    const r = render(<SplitBar groupId="d1" count={3} testID="bar" />);
    fireEvent.press(r.getByTestId('bar-keep'));
    await flush();
    expect(said).toContainEqual(['stay', { ids: ['p0', 'p1', 'p2'] }]);
    expect(said.find((x) => (x as unknown[])[0] === 'go')).toBeUndefined();
    // the error's own words are never shown (final check item 3)
    expect(r.queryByText('offline')).toBeNull();
    expect(r.getByText(DIDNT_GO)).toBeTruthy();
  });

  it('a piece that could not be archived stays, and the rest fold', async () => {
    (keepPiecesAsOne as jest.Mock).mockResolvedValue({
      itemId: 'k1',
      kindWord: 'todo',
      pieceIds: ['p0', 'p2'],
      stayed: ['p1'],
    });
    const r = render(<SplitBar groupId="d1" count={3} testID="bar" />);
    fireEvent.press(r.getByTestId('bar-keep'));
    await flush();
    expect(said).toContainEqual(['stay', { ids: ['p1'] }]);
    expect(said).toContainEqual(['go', { ids: ['p0', 'p2'] }]);
  });

  it('two quick taps keep them as one, once', async () => {
    (keepPiecesAsOne as jest.Mock).mockReturnValue(new Promise(() => {}));
    const r = render(<SplitBar groupId="d1" count={3} testID="bar" />);
    fireEvent.press(r.getByTestId('bar-keep'));
    fireEvent.press(r.getByTestId('bar-keep'));
    expect(keepPiecesAsOne).toHaveBeenCalledTimes(1);
  });
});
