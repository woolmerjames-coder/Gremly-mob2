/**
 * When "Talk it through with Gremly" is offered on a drop.
 */

import { talkItemIdFor, TALK_WINDOW_MS } from '../RecentDrops';

const NOW = new Date('2026-09-30T18:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const base = {
  pendingIds: new Set<string>(),
  nowMs: NOW,
  inTraining: false,
  used: new Set<string>(),
};

const items = [
  { id: 'newest', drop_id: 'd1', created_at: ago(60 * 1000) },
  { id: 'older', drop_id: 'd2', created_at: ago(3 * 60 * 1000) },
];

describe('talkItemIdFor', () => {
  it('offers it on the newest drop only', () => {
    expect(talkItemIdFor(items, base)).toBe('newest');
  });

  it('offers nothing while the newest drop is still being sorted', () => {
    expect(talkItemIdFor(items, { ...base, pendingIds: new Set(['d1']) })).toBeNull();
  });

  it('stops once the window after the drop has passed', () => {
    const late = [{ id: 'newest', created_at: ago(TALK_WINDOW_MS + 1000) }];
    expect(talkItemIdFor(late, base)).toBeNull();
  });

  it('does not show during the first-week training', () => {
    expect(talkItemIdFor(items, { ...base, inTraining: true })).toBeNull();
  });

  it('does not come back once it has been used', () => {
    expect(talkItemIdFor(items, { ...base, used: new Set(['newest']) })).toBeNull();
  });

  it('offers nothing for an empty list', () => {
    expect(talkItemIdFor([], base)).toBeNull();
  });
});
