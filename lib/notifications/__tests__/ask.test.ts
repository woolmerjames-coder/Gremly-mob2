/**
 * The one ask: who sees which sheet, and when it waits.
 */
jest.mock('../../supabase/client', () => ({ supabase: {} }));
jest.mock('../device', () => ({
  readPermission: jest.fn(),
  requestPermission: jest.fn(),
  syncDevice: jest.fn(),
  isExpoGo: false,
}));

import { chooseAskVariant } from '../ask';
import { ASK_COPY } from '../constants';

const now = new Date('2026-10-01T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

describe('chooseAskVariant', () => {
  it('a new person who was never asked gets the new sheet', () => {
    expect(
      chooseAskVariant({ permission: 'undetermined', prefs: null, source: 'onboarding', now }),
    ).toBe('new');
  });

  it('someone already allowing notifications, who never said yes to Gremly notes, sees it once', () => {
    expect(
      chooseAskVariant({
        permission: 'granted',
        prefs: { checkins_opted_in_at: null, last_permission_ask_at: null },
        source: 'open',
        now,
      }),
    ).toBe('existing');
    expect(
      chooseAskVariant({
        permission: 'granted',
        prefs: { checkins_opted_in_at: daysAgo(1), last_permission_ask_at: daysAgo(1) },
        source: 'open',
        now,
      }),
    ).toBeNull();
  });

  it('someone who said no to the iPhone prompt gets the Settings sheet', () => {
    expect(chooseAskVariant({ permission: 'denied', prefs: null, source: 'open', now })).toBe(
      'denied',
    );
  });

  it('Not now waits two weeks, but the bell can ask after a day', () => {
    const prefs = { checkins_opted_in_at: null, last_permission_ask_at: daysAgo(3) };
    expect(chooseAskVariant({ permission: 'undetermined', prefs, source: 'open', now })).toBeNull();
    expect(chooseAskVariant({ permission: 'undetermined', prefs, source: 'bell', now })).toBe(
      'new',
    );
    expect(
      chooseAskVariant({
        permission: 'undetermined',
        prefs: { ...prefs, last_permission_ask_at: daysAgo(15) },
        source: 'open',
        now,
      }),
    ).toBe('new');
    expect(
      chooseAskVariant({
        permission: 'undetermined',
        prefs: { ...prefs, last_permission_ask_at: daysAgo(0.5) },
        source: 'bell',
        now,
      }),
    ).toBeNull();
  });

  it('Settings can always ask', () => {
    expect(
      chooseAskVariant({
        permission: 'undetermined',
        prefs: { checkins_opted_in_at: null, last_permission_ask_at: daysAgo(0) },
        source: 'settings',
        now,
      }),
    ).toBe('new');
  });
});

describe('the words', () => {
  it('name every kind of notification, with no dashes', () => {
    for (const v of Object.values(ASK_COPY)) {
      const all = `${v.title} ${v.body}`;
      expect(all).toMatch(/brief/);
      expect(all).toMatch(/sweep/);
      expect(all).toMatch(/reminders/);
      expect(all).toMatch(/note from me/);
      expect(all).not.toMatch(/[–—]/);
    }
  });
});
