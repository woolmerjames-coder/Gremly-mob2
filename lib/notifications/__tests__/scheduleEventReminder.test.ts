import { scheduleEventReminder, cancelEventReminder } from '../scheduleEventReminder';

// Uses the global expo-notifications mock from jest-setup.ts
// (which includes SchedulableTriggerInputTypes)
import * as Notifications from 'expo-notifications';

/** Access the live mock reference each time (survives resetMocks) */
const sched = () => Notifications.scheduleNotificationAsync as jest.Mock;
const cancelMock = () => Notifications.cancelScheduledNotificationAsync as jest.Mock;

// ═══════════════════════════════════════════════════════════════════════════════
// scheduleEventReminder
// ═══════════════════════════════════════════════════════════════════════════════

describe('scheduleEventReminder', () => {
  it('returns null for all-day event with non-day-before reminder', async () => {
    const result = await scheduleEventReminder(
      'evt-1',
      'Birthday Party',
      '2099-06-15',
      null, // all-day → no event_time
      30, // 30 min before (< 1440)
    );
    expect(result).toBeNull();
    expect(sched()).not.toHaveBeenCalled();
  });

  it('schedules day-before reminder at 6 PM day before', async () => {
    sched().mockResolvedValueOnce('notif-123');

    const result = await scheduleEventReminder(
      'evt-1',
      'Conference',
      '2099-06-15',
      null,
      1440, // day-before
    );

    expect(result).toBe('notif-123');
    expect(sched()).toHaveBeenCalledTimes(1);

    const call = sched().mock.calls[0][0];
    expect(call.content.title).toBe('Tomorrow: Conference');

    // Trigger date should be 2099-06-14 at 18:00
    const triggerDate = (call.trigger as any).date as Date;
    expect(triggerDate.getDate()).toBe(14);
    expect(triggerDate.getHours()).toBe(18);
    expect(triggerDate.getMinutes()).toBe(0);
  });

  it('schedules timed event reminder at correct offset', async () => {
    sched().mockResolvedValueOnce('notif-456');

    const result = await scheduleEventReminder(
      'evt-2',
      'Team Standup',
      '2099-06-15',
      '10:00', // 10 AM
      15, // 15 min before
    );

    expect(result).toBe('notif-456');
    const call = sched().mock.calls[0][0];
    expect(call.content.title).toBe('In 15 min: Team Standup');

    const triggerDate = (call.trigger as any).date as Date;
    expect(triggerDate.getHours()).toBe(9);
    expect(triggerDate.getMinutes()).toBe(45);
  });

  it('formats title for 60-minute reminder (singular hour)', async () => {
    sched().mockResolvedValueOnce('notif-60');
    await scheduleEventReminder('evt-3', 'Lunch', '2099-06-15', '12:00', 60);

    const call = sched().mock.calls[0][0];
    expect(call.content.title).toBe('In 1 hour: Lunch');
  });

  it('formats title for 120-minute reminder (plural hours)', async () => {
    sched().mockResolvedValueOnce('notif-120');
    await scheduleEventReminder('evt-4', 'Flight', '2099-06-15', '14:00', 120);

    const call = sched().mock.calls[0][0];
    expect(call.content.title).toBe('In 2 hours: Flight');
  });

  it('returns null when trigger is in the past', async () => {
    const result = await scheduleEventReminder(
      'evt-5',
      'Already Happened',
      '2020-01-01', // past date
      '10:00',
      15,
    );
    expect(result).toBeNull();
    expect(sched()).not.toHaveBeenCalled();
  });

  it('returns null and logs error on schedule failure', async () => {
    sched().mockRejectedValueOnce(new Error('Permission denied'));
    const spy = jest.spyOn(console, 'error').mockImplementation();

    const result = await scheduleEventReminder('evt-6', 'Meeting', '2099-06-15', '10:00', 15);

    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledWith('[scheduleEventReminder] Failed:', expect.any(Error));
    spy.mockRestore();
  });

  it('includes enriched notification data payload', async () => {
    sched().mockResolvedValueOnce('notif-data');
    await scheduleEventReminder('evt-7', 'Standup', '2099-06-15', '10:00', 15);

    const call = sched().mock.calls[0][0];
    expect(call.content.data).toEqual({
      type: 'event_reminder',
      notificationType: 'entity_reminder',
      entityId: 'evt-7',
      entityType: 'event',
      action: 'open_item',
      dueDate: '2099-06-15',
      dueTime: '10:00',
    });
    expect(call.content.body).toBe('Tap to view in Gremly');
    expect(call.content.sound).toBe('default');
  });

  it('sets categoryIdentifier to ENTITY_REMINDER', async () => {
    sched().mockResolvedValueOnce('notif-cat');
    await scheduleEventReminder('evt-8', 'Meeting', '2099-06-15', '10:00', 15);

    const call = sched().mock.calls[0][0];
    expect(call.content.categoryIdentifier).toBe('ENTITY_REMINDER');
  });

  it('sets trigger type to DATE', async () => {
    sched().mockResolvedValueOnce('notif-trigger');
    await scheduleEventReminder('evt-9', 'Sync', '2099-06-15', '10:00', 15);

    const call = sched().mock.calls[0][0];
    expect(call.trigger.type).toBe('date');
  });

  it('includes dueTime as null for all-day day-before reminder', async () => {
    sched().mockResolvedValueOnce('notif-allday');
    await scheduleEventReminder('evt-10', 'Holiday', '2099-06-15', null, 1440);

    const call = sched().mock.calls[0][0];
    expect(call.content.data.dueTime).toBeNull();
    expect(call.content.data.dueDate).toBe('2099-06-15');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// cancelEventReminder
// ═══════════════════════════════════════════════════════════════════════════════

describe('cancelEventReminder', () => {
  it('cancels a scheduled notification by ID', async () => {
    await cancelEventReminder('notif-123');
    expect(cancelMock()).toHaveBeenCalledWith('notif-123');
  });

  it('swallows errors and logs them', async () => {
    cancelMock().mockRejectedValueOnce(new Error('Not found'));
    const spy = jest.spyOn(console, 'error').mockImplementation();

    await cancelEventReminder('notif-missing');

    expect(spy).toHaveBeenCalledWith('[cancelEventReminder] Failed:', expect.any(Error));
    spy.mockRestore();
  });
});
