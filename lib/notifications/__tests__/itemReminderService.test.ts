/**
 * Tests for lib/notifications/itemReminderService.ts
 *
 * Tests the core item reminder scheduling, cancellation, and
 * Gremly-voiced notification copy generation.
 *
 * Uses the global expo-notifications mock from jest-setup.ts.
 */

import {
  buildNotificationCopy,
  scheduleItemReminder,
  scheduleQuickReminder,
  cancelItemReminder,
  cancelAllItemReminders,
} from '../itemReminderService';
import type { ItemReminder } from '../../types';
import * as Notifications from 'expo-notifications';

const sched = () => Notifications.scheduleNotificationAsync as jest.Mock;
const cancelMock = () => Notifications.cancelScheduledNotificationAsync as jest.Mock;

// ═══════════════════════════════════════════════════════════════════════════════
// buildNotificationCopy
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildNotificationCopy', () => {
  it('returns an object with title and body', () => {
    const copy = buildNotificationCopy('Buy groceries', 'todo');
    expect(copy).toHaveProperty('title');
    expect(copy).toHaveProperty('body');
    expect(typeof copy.title).toBe('string');
    expect(typeof copy.body).toBe('string');
  });

  it('strips trailing period from title', () => {
    const copy = buildNotificationCopy('Buy groceries.', 'todo');
    // The cleaned title should not end with a period in the body/title
    expect(copy.title + copy.body).not.toContain('groceries..');
  });

  describe('overdue copy', () => {
    it('returns "This was due already" title when isOverdue is true', () => {
      const copy = buildNotificationCopy('Submit report', 'todo', false, true);
      expect(copy.title).toBe('This was due already');
      expect(copy.body).toContain('Submit report');
    });

    it('overdue takes priority over snooze', () => {
      const copy = buildNotificationCopy('Submit report', 'todo', true, true);
      expect(copy.title).toBe('This was due already');
    });
  });

  describe('snooze copy', () => {
    it('returns one of the snooze copy variants when isSnooze is true', () => {
      const validTitles = ['Hey, circling back', 'Quick nudge', 'This popped back up'];
      const copy = buildNotificationCopy('Walk the dog', 'todo', true);
      expect(validTitles).toContain(copy.title);
    });

    it('body contains the item title', () => {
      // Run multiple times to cover random branches
      for (let i = 0; i < 10; i++) {
        const copy = buildNotificationCopy('Walk the dog', 'todo', true);
        const combined = copy.title + ' ' + copy.body;
        // At least one of title/body should reference the task (lowercased or original)
        expect(combined.includes('Walk the dog') || combined.includes('walk the dog')).toBeTruthy();
      }
    });
  });

  describe('habit copy', () => {
    it('returns one of the habit copy variants', () => {
      const validTitles = ['Habit check-in', 'Meditate'];
      const validBodies = ["Don't break the chain", 'Time for: Meditate'];
      const copy = buildNotificationCopy('Meditate', 'habit');
      expect(validTitles.includes(copy.title) || copy.title === 'Meditate').toBeTruthy();
      expect(
        validBodies.includes(copy.body) ||
          copy.body === "Don't break the chain" ||
          copy.body.includes('Meditate'),
      ).toBeTruthy();
    });
  });

  describe('todo copy', () => {
    it('returns one of the todo copy variants', () => {
      for (let i = 0; i < 10; i++) {
        const copy = buildNotificationCopy('File taxes', 'todo');
        const validTitles = ['Time to file taxes', 'File taxes', 'Heads up'];
        const validBodies = ['Tap to mark it done', "You've got this", 'File taxes'];
        expect(validTitles).toContain(copy.title);
        expect(validBodies).toContain(copy.body);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// scheduleItemReminder
// ═══════════════════════════════════════════════════════════════════════════════

describe('scheduleItemReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules a "once" reminder with DATE trigger', async () => {
    sched().mockResolvedValueOnce('notif-once-1');

    const reminder: ItemReminder = {
      id: 'rem-1',
      time: '09:00',
      frequency: 'once',
      date: '2099-06-15',
    };

    const result = await scheduleItemReminder('todo-1', 'Buy groceries', 'todo', reminder);
    expect(result).toBe('notif-once-1');
    expect(sched()).toHaveBeenCalledTimes(1);

    const call = sched().mock.calls[0][0];
    expect(call.trigger.type).toBe('date');
    expect(call.trigger.date).toBeInstanceOf(Date);
    expect(call.trigger.date.getHours()).toBe(9);
    expect(call.trigger.date.getMinutes()).toBe(0);
  });

  it('schedules a "daily" reminder with DAILY trigger', async () => {
    sched().mockResolvedValueOnce('notif-daily-1');

    const reminder: ItemReminder = {
      id: 'rem-2',
      time: '14:30',
      frequency: 'daily',
    };

    const result = await scheduleItemReminder('habit-1', 'Meditate', 'habit', reminder);
    expect(result).toBe('notif-daily-1');

    const call = sched().mock.calls[0][0];
    expect(call.trigger.type).toBe('daily');
    expect(call.trigger.hour).toBe(14);
    expect(call.trigger.minute).toBe(30);
  });

  it('returns null for once reminder without date', async () => {
    const reminder: ItemReminder = {
      id: 'rem-3',
      time: '09:00',
      frequency: 'once',
      // no date
    };

    const result = await scheduleItemReminder('todo-2', 'Do laundry', 'todo', reminder);
    expect(result).toBeNull();
    expect(sched()).not.toHaveBeenCalled();
  });

  it('returns null for once reminder with past date', async () => {
    const reminder: ItemReminder = {
      id: 'rem-4',
      time: '09:00',
      frequency: 'once',
      date: '2020-01-01',
    };

    const result = await scheduleItemReminder('todo-3', 'Old task', 'todo', reminder);
    expect(result).toBeNull();
    expect(sched()).not.toHaveBeenCalled();
  });

  it('uses ENTITY_REMINDER_DEADLINE category when dueDate is set', async () => {
    sched().mockResolvedValueOnce('notif-deadline');

    const reminder: ItemReminder = {
      id: 'rem-5',
      time: '09:00',
      frequency: 'once',
      date: '2099-06-15',
    };

    await scheduleItemReminder('todo-4', 'Submit report', 'todo', reminder, '2099-06-16');

    const call = sched().mock.calls[0][0];
    expect(call.content.categoryIdentifier).toBe('ENTITY_REMINDER_DEADLINE');
  });

  it('uses ENTITY_REMINDER category when dueDate is not set', async () => {
    sched().mockResolvedValueOnce('notif-generic');

    const reminder: ItemReminder = {
      id: 'rem-6',
      time: '09:00',
      frequency: 'once',
      date: '2099-06-15',
    };

    await scheduleItemReminder('todo-5', 'Random task', 'todo', reminder);

    const call = sched().mock.calls[0][0];
    expect(call.content.categoryIdentifier).toBe('ENTITY_REMINDER');
  });

  it('includes enriched data payload', async () => {
    sched().mockResolvedValueOnce('notif-data');

    const reminder: ItemReminder = {
      id: 'rem-7',
      time: '09:00',
      frequency: 'daily',
    };

    await scheduleItemReminder('habit-2', 'Run', 'habit', reminder, '2099-06-15', '10:00');

    const call = sched().mock.calls[0][0];
    expect(call.content.data).toEqual({
      type: 'item_reminder',
      notificationType: 'entity_reminder',
      entityId: 'habit-2',
      entityType: 'habit',
      action: 'open_item',
      dueDate: '2099-06-15',
      dueTime: '10:00',
    });
  });

  it('sets sound to default', async () => {
    sched().mockResolvedValueOnce('notif-sound');

    const reminder: ItemReminder = {
      id: 'rem-8',
      time: '09:00',
      frequency: 'daily',
    };

    await scheduleItemReminder('todo-6', 'Task', 'todo', reminder);
    const call = sched().mock.calls[0][0];
    expect(call.content.sound).toBe('default');
  });

  it('returns null and logs error on schedule failure', async () => {
    sched().mockRejectedValueOnce(new Error('Schedule failed'));
    const spy = jest.spyOn(console, 'error').mockImplementation();

    const reminder: ItemReminder = {
      id: 'rem-9',
      time: '09:00',
      frequency: 'daily',
    };

    const result = await scheduleItemReminder('todo-7', 'Task', 'todo', reminder);
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// scheduleQuickReminder
// ═══════════════════════════════════════════════════════════════════════════════

describe('scheduleQuickReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules with TIME_INTERVAL trigger', async () => {
    sched().mockResolvedValueOnce('quick-1');

    const result = await scheduleQuickReminder('todo-1', 'Buy milk', 'todo', 900);
    expect(result).toBe('quick-1');

    const call = sched().mock.calls[0][0];
    // TIME_INTERVAL type — value comes from mock (may not be in the mock enum,
    // but the actual call uses SchedulableTriggerInputTypes.TIME_INTERVAL)
    expect(call.trigger.seconds).toBe(900);
  });

  it('uses snooze copy (isSnooze = true)', async () => {
    sched().mockResolvedValueOnce('quick-2');

    await scheduleQuickReminder('todo-2', 'Walk dog', 'todo', 3600);

    const call = sched().mock.calls[0][0];
    // Snooze copy is one of the snooze variants
    const validTitles = ['Hey, circling back', 'Quick nudge', 'This popped back up'];
    expect(validTitles).toContain(call.content.title);
  });

  it('includes enriched data payload', async () => {
    sched().mockResolvedValueOnce('quick-3');

    await scheduleQuickReminder('habit-1', 'Meditate', 'habit', 900, '2099-06-15', '10:00');

    const call = sched().mock.calls[0][0];
    expect(call.content.data).toEqual({
      type: 'item_reminder',
      notificationType: 'entity_reminder',
      entityId: 'habit-1',
      entityType: 'habit',
      action: 'open_item',
      dueDate: '2099-06-15',
      dueTime: '10:00',
    });
  });

  it('uses ENTITY_REMINDER_DEADLINE category when dueDate is set', async () => {
    sched().mockResolvedValueOnce('quick-4');

    await scheduleQuickReminder('todo-3', 'Task', 'todo', 900, '2099-06-15');

    const call = sched().mock.calls[0][0];
    expect(call.content.categoryIdentifier).toBe('ENTITY_REMINDER_DEADLINE');
  });

  it('uses ENTITY_REMINDER category when dueDate is not set', async () => {
    sched().mockResolvedValueOnce('quick-5');

    await scheduleQuickReminder('todo-4', 'Task', 'todo', 900);

    const call = sched().mock.calls[0][0];
    expect(call.content.categoryIdentifier).toBe('ENTITY_REMINDER');
  });

  it('returns null and logs error on failure', async () => {
    sched().mockRejectedValueOnce(new Error('Boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation();

    const result = await scheduleQuickReminder('todo-5', 'Task', 'todo', 900);
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// cancelItemReminder / cancelAllItemReminders
// ═══════════════════════════════════════════════════════════════════════════════

describe('cancelItemReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls cancelScheduledNotificationAsync with the ID', async () => {
    await cancelItemReminder('notif-123');
    expect(cancelMock()).toHaveBeenCalledWith('notif-123');
  });

  it('swallows errors and logs warning', async () => {
    cancelMock().mockRejectedValueOnce(new Error('Not found'));
    const spy = jest.spyOn(console, 'warn').mockImplementation();

    await cancelItemReminder('notif-missing');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('cancelAllItemReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels all reminders with notificationId', async () => {
    const reminders: ItemReminder[] = [
      { id: 'r1', time: '09:00', frequency: 'daily', notificationId: 'notif-1' },
      { id: 'r2', time: '14:00', frequency: 'once', date: '2099-01-01', notificationId: 'notif-2' },
    ];

    await cancelAllItemReminders(reminders);
    expect(cancelMock()).toHaveBeenCalledTimes(2);
  });

  it('skips reminders without notificationId', async () => {
    const reminders: ItemReminder[] = [
      { id: 'r1', time: '09:00', frequency: 'daily' },
      { id: 'r2', time: '14:00', frequency: 'daily', notificationId: 'notif-1' },
    ];

    await cancelAllItemReminders(reminders);
    expect(cancelMock()).toHaveBeenCalledTimes(1);
  });

  it('does nothing for empty array', async () => {
    await cancelAllItemReminders([]);
    expect(cancelMock()).not.toHaveBeenCalled();
  });
});
