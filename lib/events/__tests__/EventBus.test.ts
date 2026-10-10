/**
 * EventBus Tests
 *
 * Tests for the lightweight pub/sub event bus used across the app.
 * Covers subscription, emission and unsubscription.
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
  // drop:reaction_ready event (speech bubble)
  // ─────────────────────────────────────────────────────────────────────────

  describe('drop:reaction_ready event', () => {
    it('fires with full payload including rawReaction', () => {
      const handler = jest.fn();
      eventBus.on('drop:reaction_ready', handler);

      eventBus.emit('drop:reaction_ready', {
        localId: 'drop-1',
        message: 'Nice one! Pepper time!',
        rawReaction: 'Pepper time!',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        localId: 'drop-1',
        message: 'Nice one! Pepper time!',
        rawReaction: 'Pepper time!',
      });
    });

    it('fires with a null message when the title call gave no reaction', () => {
      const handler = jest.fn();
      eventBus.on('drop:reaction_ready', handler);

      eventBus.emit('drop:reaction_ready', { localId: 'drop-2', message: null, rawReaction: null });

      expect(handler).toHaveBeenCalledWith({ localId: 'drop-2', message: null, rawReaction: null });
    });

    it('unsubscribe stops delivery', () => {
      const handler = jest.fn();
      const unsub = eventBus.on('drop:reaction_ready', handler);

      unsub();
      eventBus.emit('drop:reaction_ready', {
        localId: 'drop-4',
        message: 'test',
        rawReaction: 'test',
      });

      expect(handler).not.toHaveBeenCalled();
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
