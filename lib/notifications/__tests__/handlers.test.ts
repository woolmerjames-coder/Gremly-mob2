/**
 * Taps and buttons: where a tap goes (old payloads too), Done and Snooze, and
 * one response handled once.
 */
jest.mock('../../supabase/client', () => ({
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() },
}));
jest.mock('../actions', () => ({
  doneFromNotification: jest.fn(),
  snoozeFromNotification: jest.fn(),
}));
jest.mock('../device', () => ({ isExpoGo: false }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { routeFromData, handleResponse } from '../handlers';
import { useNotificationUi } from '../store';
import { doneFromNotification, snoozeFromNotification } from '../actions';
import { ACTION } from '../constants';
import { supabase } from '../../supabase/client';

const response = (id: string, action: string, data: Record<string, unknown>) =>
  ({
    actionIdentifier: action,
    notification: { request: { identifier: id, content: { data } } },
  }) as any;
const TAP = 'expo.modules.notifications.actions.DEFAULT';

// the phone's storage, which outlives a launch
let stored: Record<string, string> = {};

function useStoredPhone(storage: typeof AsyncStorage): void {
  (storage.getItem as jest.Mock).mockImplementation(async (k: string) => stored[k] ?? null);
  (storage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    stored[k] = v;
  });
}

/** The app launched again: new module state, the same phone storage. */
function freshLaunch(): typeof import('../handlers') {
  let fresh!: typeof import('../handlers');
  jest.isolateModules(() => {
    useStoredPhone(require('@react-native-async-storage/async-storage'));
    fresh = require('../handlers');
  });
  // a new copy, so this launch has not seen anything yet
  expect(fresh.handleResponse).not.toBe(handleResponse);
  return fresh;
}

beforeEach(() => {
  stored = {};
  useStoredPhone(AsyncStorage);
  (Notifications.clearLastNotificationResponseAsync as jest.Mock).mockResolvedValue(undefined);
  useNotificationUi.setState({ pendingRoute: null, ask: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
  (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
});

describe('routeFromData', () => {
  it('uses the route the server sent', () => {
    expect(routeFromData({ route: 'sweep' })).toBe('sweep');
    expect(routeFromData({ route: 'item/todo/t1' })).toBe('item/todo/t1');
  });
  it('understands the old system’s notifications still in Notification Center', () => {
    expect(routeFromData({ action: 'open_flow', type: 'morning' })).toBe('brief');
    expect(routeFromData({ action: 'open_flow', type: 'evening' })).toBe('sweep');
    expect(routeFromData({ action: 'open_flow', type: 'weekly_summary' })).toBe('summary');
    expect(routeFromData({ action: 'open_item', entityType: 'todo', entityId: 'x' })).toBe(
      'item/todo/x',
    );
  });
  it('has nowhere to go without a payload', () => {
    expect(routeFromData(null)).toBeNull();
  });
});

describe('handleResponse', () => {
  it('a tap marks it opened and queues its route', async () => {
    await handleResponse(response('n1', TAP, { route: 'brief', logId: 'log-1', moment: 'brief' }));
    expect(useNotificationUi.getState().pendingRoute).toBe('brief');
    await new Promise((r) => setTimeout(r, 0));
    expect(supabase.rpc).toHaveBeenCalledWith('mark_notification_opened', {
      p_log_id: 'log-1',
      p_action: null,
    });
  });

  it('Done and Snooze run their action and open nothing', async () => {
    await handleResponse(
      response('n2', ACTION.done, {
        moment: 'reminder',
        subject: 'todo:t1:r1',
        route: 'item/todo/t1',
      }),
    );
    expect(doneFromNotification).toHaveBeenCalledWith('reminder', 'todo:t1:r1');
    await handleResponse(
      response('n3', ACTION.snooze, { moment: 'reminder', subject: 'todo:t1:r1' }),
    );
    expect(snoozeFromNotification).toHaveBeenCalledWith('todo:t1:r1');
    expect(useNotificationUi.getState().pendingRoute).toBeNull();
  });

  it('handles the same response once', async () => {
    await handleResponse(response('n4', TAP, { route: 'sweep' }));
    useNotificationUi.setState({ pendingRoute: null });
    await handleResponse(response('n4', TAP, { route: 'sweep' }));
    expect(useNotificationUi.getState().pendingRoute).toBeNull();
  });

  it('the silent canary opens nothing', async () => {
    await handleResponse(response('n5', TAP, { moment: 'canary', silent: true }));
    expect(useNotificationUi.getState().pendingRoute).toBeNull();
  });

  it('clears the response from the phone before Done runs', async () => {
    const order: string[] = [];
    (Notifications.clearLastNotificationResponseAsync as jest.Mock).mockImplementation(async () => {
      order.push('cleared');
    });
    (doneFromNotification as jest.Mock).mockImplementation(async () => {
      order.push('done');
    });
    await handleResponse(
      response('n6', ACTION.done, { moment: 'reminder', subject: 'todo:t1:r1' }),
    );
    expect(order).toEqual(['cleared', 'done']);
  });

  it('a cold launch never runs Snooze again for the same notification', async () => {
    const snooze = response('n7', ACTION.snooze, { moment: 'reminder', subject: 'todo:t1:r1' });
    await handleResponse(snooze);
    expect(snoozeFromNotification).toHaveBeenCalledTimes(1);

    const fresh = freshLaunch();
    await fresh.handleResponse(snooze);
    expect(snoozeFromNotification).toHaveBeenCalledTimes(1);
  });

  it('a different notification on a later launch still runs', async () => {
    await handleResponse(
      response('n8', ACTION.snooze, { moment: 'reminder', subject: 'todo:t1:r1' }),
    );
    const fresh = freshLaunch();
    await fresh.handleResponse(
      response('n9', ACTION.snooze, { moment: 'reminder', subject: 'todo:t2:r1' }),
    );
    expect(snoozeFromNotification).toHaveBeenLastCalledWith('todo:t2:r1');
  });

  it('two responses arriving together are both remembered', async () => {
    await Promise.all([
      handleResponse(response('n10', TAP, { route: 'sweep' })),
      handleResponse(response('n11', TAP, { route: 'brief' })),
    ]);
    const handled = JSON.parse(stored['gremly.notifications.handled']);
    expect(handled).toEqual(expect.arrayContaining([`n10:${TAP}`, `n11:${TAP}`]));
  });
});
