/**
 * EventBus Tests
 *
 * Tests for the lightweight pub/sub event bus used across the app.
 * Covers subscription, emission, unsubscription, and the new
 * openTomorrowBrief event.
 */

import { eventBus } from '../EventBus';

describe('EventBus', () => {
  afterEach(() => {
    eventBus.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Core pub/sub behavior
  // ─────────────────────────────────────────────────────────────────────────

  describe('on / emit', () => {
    it('fires handler when event is emitted', () => {
      const handler = jest.fn();
      eventBus.on('ItemSaved', handler);

      eventBus.emit('ItemSaved', { id: 'item-1' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ id: 'item-1' });
    });

    it('fires multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      eventBus.on('ItemSaved', handler1);
      eventBus.on('ItemSaved', handler2);

      eventBus.emit('ItemSaved', { id: 'item-1' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('does not fire handlers for different events', () => {
      const handler = jest.fn();
      eventBus.on('ItemSaved', handler);

      eventBus.emit('ItemDeleted', { id: 'item-1', type: 'todo' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('passes correct payload to handler', () => {
      const handler = jest.fn();
      eventBus.on('ItemCompleted', handler);

      eventBus.emit('ItemCompleted', { id: 'item-1', type: 'habit', source: 'sweep' });

      expect(handler).toHaveBeenCalledWith({
        id: 'item-1',
        type: 'habit',
        source: 'sweep',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Unsubscription
  // ─────────────────────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('returns unsubscribe function from on()', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on('ItemSaved', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('unsubscribe prevents future calls', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on('ItemSaved', handler);

      eventBus.emit('ItemSaved', { id: 'item-1' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.emit('ItemSaved', { id: 'item-2' });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('off() removes handler', () => {
      const handler = jest.fn();
      eventBus.on('ItemSaved', handler);

      eventBus.off('ItemSaved', handler);

      eventBus.emit('ItemSaved', { id: 'item-1' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('unsubscribing one handler does not affect others', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const unsub1 = eventBus.on('ItemSaved', handler1);
      eventBus.on('ItemSaved', handler2);

      unsub1();

      eventBus.emit('ItemSaved', { id: 'item-1' });
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // clear()
  // ─────────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      eventBus.on('ItemSaved', handler1);
      eventBus.on('ItemCompleted', handler2);

      eventBus.clear();

      eventBus.emit('ItemSaved', { id: 'item-1' });
      eventBus.emit('ItemCompleted', { id: 'item-2', type: 'todo' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tomorrow Brief event
  // ─────────────────────────────────────────────────────────────────────────

  describe('openTomorrowBrief event', () => {
    it('fires handler with empty payload', () => {
      const handler = jest.fn();
      eventBus.on('openTomorrowBrief', handler);

      eventBus.emit('openTomorrowBrief', {});

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({});
    });

    it('unsubscribe prevents calls', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on('openTomorrowBrief', handler);

      unsubscribe();
      eventBus.emit('openTomorrowBrief', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('multiple handlers can listen', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      eventBus.on('openTomorrowBrief', handler1);
      eventBus.on('openTomorrowBrief', handler2);

      eventBus.emit('openTomorrowBrief', {});

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DailyBrief events
  // ─────────────────────────────────────────────────────────────────────────

  describe('DailyBriefSaved event', () => {
    it('fires with date payload', () => {
      const handler = jest.fn();
      eventBus.on('DailyBriefSaved', handler);

      eventBus.emit('DailyBriefSaved', { date: '2025-12-16' });

      expect(handler).toHaveBeenCalledWith({ date: '2025-12-16' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Notification open flow events (morning, evening, weekly_summary)
  // ─────────────────────────────────────────────────────────────────────────

  describe('notification:open_flow event', () => {
    it('fires with morning type', () => {
      const handler = jest.fn();
      eventBus.on('notification:open_flow', handler);

      eventBus.emit('notification:open_flow', { type: 'morning' });

      expect(handler).toHaveBeenCalledWith({ type: 'morning' });
    });

    it('fires with evening type', () => {
      const handler = jest.fn();
      eventBus.on('notification:open_flow', handler);

      eventBus.emit('notification:open_flow', { type: 'evening' });

      expect(handler).toHaveBeenCalledWith({ type: 'evening' });
    });

    it('fires with weekly_summary type', () => {
      const handler = jest.fn();
      eventBus.on('notification:open_flow', handler);

      eventBus.emit('notification:open_flow', { type: 'weekly_summary' });

      expect(handler).toHaveBeenCalledWith({ type: 'weekly_summary' });
    });

    it('multiple handlers receive the event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      eventBus.on('notification:open_flow', handler1);
      eventBus.on('notification:open_flow', handler2);

      eventBus.emit('notification:open_flow', { type: 'weekly_summary' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops delivery', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on('notification:open_flow', handler);

      unsubscribe();
      eventBus.emit('notification:open_flow', { type: 'morning' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('fires with afternoon_checkin type', () => {
      const handler = jest.fn();
      eventBus.on('notification:open_flow', handler);

      eventBus.emit('notification:open_flow', { type: 'afternoon_checkin' });

      expect(handler).toHaveBeenCalledWith({ type: 'afternoon_checkin' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // New notification event types (branch: app-fixes-2.24)
  // ─────────────────────────────────────────────────────────────────────────

  describe('notification:open_item event', () => {
    it('fires with item payload', () => {
      const handler = jest.fn();
      eventBus.on('notification:open_item', handler);

      eventBus.emit('notification:open_item', { itemId: 'todo-1', itemType: 'todo' });

      expect(handler).toHaveBeenCalledWith({ itemId: 'todo-1', itemType: 'todo' });
    });
  });

  describe('notification:done_action event', () => {
    it('fires with entity payload', () => {
      const handler = jest.fn();
      eventBus.on('notification:done_action', handler);

      eventBus.emit('notification:done_action', { entityId: 'todo-1', entityType: 'todo' });

      expect(handler).toHaveBeenCalledWith({ entityId: 'todo-1', entityType: 'todo' });
    });
  });

  describe('notification:snooze event', () => {
    it('fires with entity and snooze details', () => {
      const handler = jest.fn();
      eventBus.on('notification:snooze', handler);

      eventBus.emit('notification:snooze', {
        entityId: 'todo-1',
        entityType: 'todo',
        seconds: 900,
        label: '15m',
      });

      expect(handler).toHaveBeenCalledWith({
        entityId: 'todo-1',
        entityType: 'todo',
        seconds: 900,
        label: '15m',
      });
    });
  });

  describe('notification:snooze_before_due event', () => {
    it('fires with due date/time payload', () => {
      const handler = jest.fn();
      eventBus.on('notification:snooze_before_due', handler);

      eventBus.emit('notification:snooze_before_due', {
        entityId: 'todo-2',
        entityType: 'todo',
        dueDate: '2025-12-20',
        dueTime: '14:00',
      });

      expect(handler).toHaveBeenCalledWith({
        entityId: 'todo-2',
        entityType: 'todo',
        dueDate: '2025-12-20',
        dueTime: '14:00',
      });
    });

    it('accepts null dueTime', () => {
      const handler = jest.fn();
      eventBus.on('notification:snooze_before_due', handler);

      eventBus.emit('notification:snooze_before_due', {
        entityId: 'todo-3',
        entityType: 'todo',
        dueDate: '2025-12-20',
        dueTime: null,
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ dueTime: null }));
    });
  });

  describe('notification:habit_done event', () => {
    it('fires with entityId', () => {
      const handler = jest.fn();
      eventBus.on('notification:habit_done', handler);

      eventBus.emit('notification:habit_done', { entityId: 'habit-1' });

      expect(handler).toHaveBeenCalledWith({ entityId: 'habit-1' });
    });
  });

  describe('notification:permission_prompt event', () => {
    it('fires with reminder context', () => {
      const handler = jest.fn();
      eventBus.on('notification:permission_prompt', handler);

      eventBus.emit('notification:permission_prompt', { context: 'reminder' });

      expect(handler).toHaveBeenCalledWith({ context: 'reminder' });
    });

    it('fires with sweep context', () => {
      const handler = jest.fn();
      eventBus.on('notification:permission_prompt', handler);

      eventBus.emit('notification:permission_prompt', { context: 'sweep' });

      expect(handler).toHaveBeenCalledWith({ context: 'sweep' });
    });
  });

  describe('overlay:open event', () => {
    it('fires with entity info', () => {
      const handler = jest.fn();
      eventBus.on('overlay:open', handler);

      eventBus.emit('overlay:open', { entityId: 'todo-1', entityType: 'todo' });

      expect(handler).toHaveBeenCalledWith({ entityId: 'todo-1', entityType: 'todo' });
    });
  });

  describe('day:rollover event', () => {
    it('fires with new date', () => {
      const handler = jest.fn();
      eventBus.on('day:rollover', handler);

      eventBus.emit('day:rollover', { date: '2025-12-16' });

      expect(handler).toHaveBeenCalledWith({ date: '2025-12-16' });
    });
  });
});
