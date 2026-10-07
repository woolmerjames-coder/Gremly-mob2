/**
 * How a chat thread follows what is added to it (lib/chat/follow.ts).
 */
import { addedBy, followOffset, nearBottom } from '../follow';

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

  it('knows whether they added something or Gremly did', () => {
    const rows = [{ role: 'assistant' }, { role: 'user' }, { role: 'assistant' }];
    expect(addedBy(rows, 3)).toBeNull();
    expect(addedBy(rows, 2)).toBe('gremly');
    expect(addedBy(rows, 1)).toBe('them');
  });
});
