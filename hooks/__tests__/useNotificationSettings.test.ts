jest.mock('../../lib/supabase/client', () => ({ supabase: {} }));
jest.mock('../../lib/notifications/device', () => ({}));
jest.mock('../../lib/store/useGremlyStore', () => ({ useGremlyStore: jest.fn() }));

import { phoneHealth } from '../useNotificationSettings';

describe('phoneHealth', () => {
  const device = { expo_token: 'ExponentPushToken[x]', disabled_at: null, disabled_reason: null };
  it('on, with the last delivery', () => {
    expect(phoneHealth('granted', device, '2026-10-01T08:00:00Z')).toEqual({
      kind: 'on',
      lastDeliveredAt: '2026-10-01T08:00:00Z',
    });
  });
  it('off in iPhone Settings, or never asked', () => {
    expect(phoneHealth('denied', device, null).kind).toBe('off-in-settings');
    expect(phoneHealth('undetermined', null, null).kind).toBe('not-asked');
  });
  it('allowed but not reaching this phone, with the reason', () => {
    expect(
      phoneHealth(
        'granted',
        { ...device, disabled_at: 'x', disabled_reason: 'Expo: DeviceNotRegistered' },
        null,
      ),
    ).toEqual({
      kind: 'not-receiving',
      reason: 'Expo: DeviceNotRegistered',
    });
    expect(phoneHealth('granted', null, null).kind).toBe('not-receiving');
  });
});
