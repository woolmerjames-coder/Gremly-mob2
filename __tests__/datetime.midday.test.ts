import { parseDue } from '../lib/cortex/entities/datetime';

describe('Datetime parser – midday/noon', () => {
  const now = new Date('2025-11-11T08:00:00Z');

  it('parses "midday tomorrow" as 12:00 tomorrow', () => {
    const res = parseDue('Need to check out at midday tomorrow', now)!;
    expect(res.granularity).toBe('time');
    expect(res.confidence).toBeGreaterThan(0.8);
    const iso = new Date(res.iso);
    expect(iso.getUTCHours()).toBe(12);
  });

  it('parses "meet at noon" as 12:00 today', () => {
    const res = parseDue('Meet at noon', now)!;
    const iso = new Date(res.iso);
    expect(iso.getUTCHours()).toBe(12);
  });
});
