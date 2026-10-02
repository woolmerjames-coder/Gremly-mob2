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

beforeEach(() => {
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
});
