/**
 * How a chat thread follows what is added to it (lib/chat/follow.ts).
 */
import { addedBy, belowFor, followOffset, nearBottom, startsBelow } from '../follow';

describe('following what is added to a thread', () => {
  it('counts the reader at the bottom when the end is close', () => {
    expect(nearBottom({ y: 900, height: 600, content: 1500 })).toBe(true);
    expect(nearBottom({ y: 850, height: 600, content: 1500 })).toBe(true);
    expect(nearBottom({ y: 500, height: 600, content: 1500 })).toBe(false);
  });

  it('goes to the end when it all fits below the first unseen line', () => {
    expect(followOffset({ height: 600, content: 1500 }, null)).toBe(900);
    expect(followOffset({ height: 600, content: 1500 }, 1200)).toBe(900);
  });

  it('stops at the top of a long line, so it is read from its start', () => {
    expect(followOffset({ height: 600, content: 2400 }, 1000)).toBe(992);
    expect(followOffset({ height: 600, content: 400 }, 10)).toBe(0);
  });

  it('knows when what was added starts below the fold', () => {
    const at = { y: 400, height: 600 };
    // well in view, and with only its first few points in view
    expect(startsBelow(700, at)).toBe(false);
    expect(startsBelow(980, at)).toBe(true);
    expect(startsBelow(1200, at)).toBe(true);
  });

  it('says Gremly replied when a reply of his landed below the fold', () => {
    const rows = [
      { role: 'assistant' },
      { role: 'user' },
      { role: 'system' },
      { role: 'assistant' },
      { role: 'system' },
    ];
    // his reply, with the card under it, out of sight
    expect(belowFor(rows, 3, null, true)).toBe('reply');
    // a card or a note of what changed on its own is only the latest
    expect(belowFor(rows, 4, null, true)).toBe('latest');
    // a line still growing, with no row added
    expect(belowFor(rows, 5, null, true)).toBe('latest');
  });

  it('says only Latest when the reply starts in view and runs on below', () => {
    const rows = [{ role: 'user' }, { role: 'assistant' }, { role: 'system' }];
    expect(belowFor(rows, 1, null, false)).toBe('latest');
  });

  it('keeps saying Gremly replied until they reach it', () => {
    const rows = [{ role: 'assistant' }, { role: 'system' }];
    expect(belowFor(rows, 1, 'reply', false)).toBe('reply');
    expect(belowFor(rows, 2, 'reply', true)).toBe('reply');
    // and what was only the latest becomes a reply when one lands out of sight
    expect(belowFor(rows, 0, 'latest', true)).toBe('reply');
  });

  it('knows whether they added something or Gremly did', () => {
    const rows = [{ role: 'assistant' }, { role: 'user' }, { role: 'assistant' }];
    expect(addedBy(rows, 3)).toBeNull();
    expect(addedBy(rows, 2)).toBe('gremly');
    expect(addedBy(rows, 1)).toBe('them');
  });
});
