/**
 * @jest-environment node
 *
 * The notifications policy: states, the daily limit, spacing, quiet hours, the
 * return ladder, miss streaks, the last check before sending, angles and learning.
 */
import {
  POLICY,
  engagementState,
  dailyLimit,
  returnNoteDay,
  missAction,
  inQuietHours,
  momentEnabled,
  clock,
  dedupeKey,
  planDay,
  decideAtSend,
  interruptionFor,
  chooseAngle,
  bestMinutes,
  suggestBriefTime,
  outcomeOf,
  nextStreak,
  mayAskPermission,
} from '../policy';

const prefs = {
  morning_enabled: true,
  morning_time: '08:00:00',
  evening_enabled: true,
  evening_time: '20:00:00',
  habit_checkins_enabled: true,
  good_news_enabled: true,
  reminders_enabled: true,
  checkins_enabled: true,
  quiet_start: '21:30:00',
  quiet_end: '07:30:00',
};

describe('engagement', () => {
  test('states by days away', () => {
    expect([0, 1, 2, 4, 5, 20, 21, 60].map(engagementState)).toEqual([
      'engaged',
      'engaged',
      'drifting',
      'drifting',
      'lapsed',
      'lapsed',
      'resting',
      'resting',
    ]);
  });
  test('daily limit', () => {
    expect(dailyLimit('engaged')).toBe(3);
    expect(dailyLimit('drifting')).toBe(1);
    expect(dailyLimit('engaged', { firstDayBack: true })).toBe(1);
  });
  test('return note days: 5, 9, 14 and the last on 21', () => {
    expect([4, 5, 6, 9, 14, 20, 21, 22].map(returnNoteDay)).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
      false,
    ]);
  });
  test('miss streaks', () => {
    expect([0, 2, 3, 4, 5, 7, 8, 12].map(missAction)).toEqual([
      'normal',
      'normal',
      'change_angle',
      'change_angle',
      'every_other_day',
      'every_other_day',
      'paused',
      'paused',
    ]);
    expect(nextStreak(4, 'succeeded')).toBe(0);
    expect(nextStreak(4, 'missed')).toBe(5);
    expect(nextStreak(4, null)).toBe(4);
  });
});

describe('helpers', () => {
  test('quiet hours across midnight', () => {
    expect(inQuietHours(22 * 60, '21:30', '07:30')).toBe(true);
    expect(inQuietHours(3 * 60, '21:30', '07:30')).toBe(true);
    expect(inQuietHours(7 * 60 + 30, '21:30', '07:30')).toBe(false);
    expect(inQuietHours(12 * 60, '21:30', '07:30')).toBe(false);
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
  });
  test('check ins need their opt in', () => {
    expect(momentEnabled('nudge', { ...prefs, checkins_enabled: false })).toBe(false);
    expect(momentEnabled('nudge', {})).toBe(false);
    expect(momentEnabled('brief', {})).toBe(true);
  });
  test('clock words', () => {
    expect(clock(19 * 60 + 12)).toBe('7:12pm');
    expect(clock(0)).toBe('12:00am');
    expect(clock(12 * 60)).toBe('12:00pm');
  });
  test('dedupe key', () => {
    expect(dedupeKey({ userId: 'u', moment: 'brief', localDate: '2026-10-02' })).toBe(
      'u:brief:-:2026-10-02:-',
    );
  });
});

describe('planDay', () => {
  const facts = {
    briefExpected: true,
    habits: [{ id: 'h1', title: 'Run', usualMinutes: 7 * 60, loggedToday: false }],
    goodNews: [],
    nudgeReasons: [{ kind: 'unfed', weight: 2 }],
  };

  test('an engaged day keeps the 3 most important, spaced out', () => {
    const r = planDay({ prefs, daysAway: 0, facts, bestMinutes: [12 * 60] });
    expect(r.state).toBe('engaged');
    expect(r.plan.map((c) => c.moment)).toEqual(['brief', 'habit_checkin', 'sweep']);
    expect(r.skipped.find((s) => s.moment === 'nudge').reason).toBe('Daily limit reached');
  });

  test('chosen times never move, Gremly timed ones move later to keep the gap', () => {
    const r = planDay({
      prefs,
      daysAway: 0,
      facts: { briefExpected: true, habits: [{ id: 'h1', usualMinutes: 7 * 60 }] },
    });
    const brief = r.plan.find((c) => c.moment === 'brief');
    const habit = r.plan.find((c) => c.moment === 'habit_checkin');
    expect(brief.atMinutes).toBe(8 * 60);
    expect(habit.atMinutes - brief.atMinutes).toBeGreaterThanOrEqual(POLICY.minGapMinutes);
  });

  test('drifting: one notification, delivered quietly', () => {
    const r = planDay({ prefs, daysAway: 3, facts });
    expect(r.plan).toHaveLength(1);
    expect(r.plan[0].moment).toBe('brief');
    expect(r.plan[0].interruption).toBe('passive');
  });

  test('drifting: a reason that asks to go first is the one note of the day', () => {
    // what came back from Later while they were away (planner.js cameBackReason)
    const cameBack = { kind: 'came_back', weight: 3, priority: 1.5, angles: ['something_waiting'] };
    const r = planDay({
      prefs,
      daysAway: 3,
      facts: { ...facts, nudgeReasons: [{ kind: 'unfed', weight: 1 }, cameBack] },
    });
    expect(r.plan.map((c) => [c.moment, c.subject])).toEqual([['nudge', 'came_back']]);
    expect(r.plan[0].reason).toBe(cameBack);
    expect(r.skipped.find((s) => s.moment === 'brief').reason).toBe('Daily limit reached');
    // an everyday reason never jumps the queue
    const plain = planDay({ prefs, daysAway: 3, facts });
    expect(plain.plan.map((c) => c.moment)).toEqual(['brief']);
  });

  test('lapsed: only a return note, and only on ladder days', () => {
    expect(planDay({ prefs, daysAway: 5, facts }).plan.map((c) => c.moment)).toEqual([
      'return_note',
    ]);
    expect(planDay({ prefs, daysAway: 6, facts }).plan).toEqual([]);
    const last = planDay({ prefs, daysAway: 21, facts }).plan[0];
    expect(last.moment).toBe('return_note');
    expect(last.lastNote).toBe(true);
    expect(planDay({ prefs, daysAway: 30, facts }).plan).toEqual([]);
  });

  test('return notes need the check ins opt in', () => {
    const r = planDay({ prefs: { ...prefs, checkins_enabled: false }, daysAway: 5, facts });
    expect(r.plan).toEqual([]);
    expect(r.skipped[0].reason).toBe('Switched off in Settings');
  });

  test('the first day back allows only one', () => {
    const r = planDay({ prefs, daysAway: 0, firstDayBack: true, facts });
    expect(r.plan.filter((c) => c.counts)).toHaveLength(1);
  });

  test('a moment that keeps missing goes every other day, then pauses', () => {
    const odd = planDay({
      prefs,
      daysAway: 0,
      dayIndex: 1,
      missStreaks: { sweep: 5 },
      facts: { briefExpected: false },
    });
    expect(odd.plan.find((c) => c.moment === 'sweep')).toBeUndefined();
    const even = planDay({
      prefs,
      daysAway: 0,
      dayIndex: 2,
      missStreaks: { sweep: 5 },
      facts: { briefExpected: false },
    });
    expect(even.plan.find((c) => c.moment === 'sweep')).toBeDefined();
    const paused = planDay({
      prefs,
      daysAway: 0,
      dayIndex: 2,
      missStreaks: { sweep: 8 },
      facts: { briefExpected: false },
    });
    expect(paused.plan.find((c) => c.moment === 'sweep')).toBeUndefined();
    const angle = planDay({
      prefs,
      daysAway: 0,
      missStreaks: { sweep: 3 },
      facts: { briefExpected: false },
    });
    expect(angle.plan.find((c) => c.moment === 'sweep').changeAngle).toBe(true);
  });

  test('Gremly never times something into quiet hours', () => {
    const r = planDay({
      prefs,
      daysAway: 0,
      facts: { habits: [{ id: 'late', usualMinutes: 21 * 60 }] },
    });
    expect(r.plan.find((c) => c.moment === 'habit_checkin')).toBeUndefined();
    expect(r.skipped.find((s) => s.moment === 'habit_checkin').reason).toBe(
      'Would land in quiet hours',
    );
  });

  test('a brief is only planned when one will be written', () => {
    const r = planDay({ prefs, daysAway: 0, facts: { briefExpected: false } });
    expect(r.plan.find((c) => c.moment === 'brief')).toBeUndefined();
  });

  test('never more than the limit, whatever qualifies', () => {
    for (let d = 0; d < 30; d++) {
      const r = planDay({
        prefs,
        daysAway: d,
        dayIndex: d,
        facts: {
          ...facts,
          goodNews: [{ kind: 'age_up', id: 1 }],
          habits: [
            { id: 'a', usualMinutes: 600 },
            { id: 'b', usualMinutes: 900 },
          ],
        },
        bestMinutes: [9 * 60, 13 * 60],
      });
      expect(r.plan.filter((c) => c.counts).length).toBeLessThanOrEqual(r.limit);
    }
  });
});

describe('decideAtSend', () => {
  const base = { prefs, healthyDevices: 1, nowMinutes: 15 * 60, stillTrue: { ok: true } };

  test('sends when nothing is in the way', () => {
    expect(decideAtSend({ ...base, moment: 'nudge' })).toEqual({ action: 'send' });
  });
  test('no phone, no send, and it says so', () => {
    expect(decideAtSend({ ...base, moment: 'brief', healthyDevices: 0 })).toEqual({
      action: 'drop',
      reason: 'No phone can receive notifications',
    });
  });
  test('already done', () => {
    expect(
      decideAtSend({
        ...base,
        moment: 'sweep',
        stillTrue: { ok: false, reason: 'You swept at 7:12pm' },
      }),
    ).toEqual({ action: 'drop', reason: 'You swept at 7:12pm' });
  });
  test('paused, but reminders still arrive', () => {
    expect(decideAtSend({ ...base, moment: 'nudge', pausedUntilLabel: 'Friday' }).reason).toBe(
      'Paused until Friday',
    );
    expect(decideAtSend({ ...base, moment: 'reminder', pausedUntilLabel: 'Friday' })).toEqual({
      action: 'send',
    });
  });
  test('quiet hours apply to Gremly timed moments only', () => {
    expect(decideAtSend({ ...base, moment: 'nudge', nowMinutes: 22 * 60 }).reason).toBe(
      'Quiet hours',
    );
    expect(decideAtSend({ ...base, moment: 'reminder', nowMinutes: 23 * 60 })).toEqual({
      action: 'send',
    });
  });
  test('holds while they are in the app, then lets the brief wait in Chat', () => {
    expect(decideAtSend({ ...base, moment: 'brief', minutesSinceOpen: 5 }).action).toBe('hold');
    const later = decideAtSend({ ...base, moment: 'brief', minutesSinceOpen: 5, heldSoFar: 60 });
    expect(later).toEqual({
      action: 'drop',
      reason: 'They were in the app, so the brief waited in Chat',
    });
  });
  test('waits for a meeting to end, within reason', () => {
    expect(decideAtSend({ ...base, moment: 'habit_checkin', meetingEndsInMinutes: 25 })).toEqual({
      action: 'hold',
      minutes: 27,
      reason: 'In a meeting',
    });
    expect(
      decideAtSend({ ...base, moment: 'habit_checkin', meetingEndsInMinutes: 120 }).action,
    ).toBe('drop');
  });
  test('switched off', () => {
    expect(
      decideAtSend({ ...base, moment: 'sweep', prefs: { ...prefs, evening_enabled: false } })
        .reason,
    ).toBe('Switched off in Settings');
  });
});

describe('delivery level', () => {
  test('time sensitive only for reminders, quiet when drifting', () => {
    expect(interruptionFor('reminder', 'engaged')).toBe('time-sensitive');
    expect(interruptionFor('reminder', 'engaged', { timeSensitiveAllowed: false })).toBe('active');
    expect(interruptionFor('brief', 'engaged')).toBe('active');
    expect(interruptionFor('brief', 'drifting')).toBe('passive');
    expect(interruptionFor('nudge', 'engaged')).toBe('passive');
  });
});

describe('angles', () => {
  test('never yesterday’s angle for the same moment', () => {
    const a = chooseAngle({ moment: 'sweep', yesterday: 'tiny_invite' });
    expect(a).not.toBe('tiny_invite');
  });
  test('only angles whose facts exist today', () => {
    expect(chooseAngle({ moment: 'nudge', eligible: ['callback'] })).toBe('callback');
  });
  test('the one angle today’s facts can be said with is used again the day after', () => {
    // what came back can only be said as something waiting, whatever was used yesterday
    expect(
      chooseAngle({
        moment: 'nudge',
        eligible: ['something_waiting'],
        yesterday: 'something_waiting',
      }),
    ).toBe('something_waiting');
    // with another the facts allow, yesterday's still rests
    expect(
      chooseAngle({
        moment: 'nudge',
        eligible: ['something_waiting', 'callback'],
        yesterday: 'something_waiting',
      }),
    ).toBe('callback');
  });
  test('a recently used angle loses to an equally good rested one', () => {
    const stats = { tiny_invite: { s: 5, n: 10 }, gremly_state: { s: 5, n: 10 } };
    const a = chooseAngle({
      moment: 'sweep',
      eligible: ['tiny_invite', 'gremly_state'],
      stats,
      daysSinceUsed: { tiny_invite: 2, gremly_state: 40 },
    });
    expect(a).toBe('gremly_state');
  });
  test('a clearly better angle still wins', () => {
    const stats = { tiny_invite: { s: 18, n: 20 }, gremly_state: { s: 2, n: 20 } };
    const a = chooseAngle({
      moment: 'sweep',
      eligible: ['tiny_invite', 'gremly_state'],
      stats,
      daysSinceUsed: { tiny_invite: 3, gremly_state: 30 },
    });
    expect(a).toBe('tiny_invite');
  });
  test('the same inputs always give the same angle', () => {
    const p = { moment: 'brief', stats: { callback: { s: 1, n: 3 } } };
    expect(chooseAngle(p)).toBe(chooseAngle(p));
  });
});

describe('learning', () => {
  test('best hours need a week of opens', () => {
    const few = [{ date: '2026-10-01', minutes: 7 * 60 + 10 }];
    expect(bestMinutes(few)).toBeNull();
    const opens = [];
    for (let i = 1; i <= 10; i++) {
      const date = `2026-09-${String(i).padStart(2, '0')}`;
      opens.push({ date, minutes: 7 * 60 + 15 }, { date, minutes: 12 * 60 + 40 });
      if (i % 3 === 0) opens.push({ date, minutes: 21 * 60 });
    }
    expect(bestMinutes(opens)).toEqual([7 * 60, 12 * 60, 21 * 60]);
  });
  test('offer a later brief only when it is opened late on most days', () => {
    const late = Array.from({ length: 10 }, (_, i) => ({
      arrived: 480,
      opened: i < 7 ? 535 : 490,
    }));
    expect(suggestBriefTime(late, '08:00')).toBe('09:00');
    const fine = Array.from({ length: 10 }, () => ({ arrived: 480, opened: 490 }));
    expect(suggestBriefTime(fine, '08:00')).toBeNull();
  });
  test('outcome: opened, did it anyway, or missed', () => {
    const sentAt = '2026-10-02T03:00:00Z';
    expect(
      outcomeOf({ moment: 'sweep', sentAt, openedAt: '2026-10-02T03:10:00Z', now: sentAt }),
    ).toBe('succeeded');
    expect(
      outcomeOf({
        moment: 'sweep',
        sentAt,
        activities: [{ kind: 'sweep', at: '2026-10-02T04:30:00Z' }],
        now: '2026-10-02T06:00:00Z',
      }),
    ).toBe('succeeded');
    expect(
      outcomeOf({
        moment: 'sweep',
        sentAt,
        activities: [{ kind: 'sweep', at: '2026-10-02T06:00:00Z' }],
        now: '2026-10-02T06:00:00Z',
      }),
    ).toBe('missed');
    expect(outcomeOf({ moment: 'sweep', sentAt, now: '2026-10-02T04:00:00Z' })).toBeNull();
  });
  test('a habit check in only counts the same habit', () => {
    const sentAt = '2026-10-02T15:00:00Z';
    const acts = [{ kind: 'habit_logged', subject: 'other', at: '2026-10-02T15:20:00Z' }];
    expect(
      outcomeOf({
        moment: 'habit_checkin',
        subject: 'run',
        sentAt,
        activities: acts,
        now: '2026-10-02T18:00:00Z',
      }),
    ).toBe('missed');
  });
  test('permission asks are 14 days apart', () => {
    expect(mayAskPermission(null, '2026-10-02T00:00:00Z')).toBe(true);
    expect(mayAskPermission('2026-09-25T00:00:00Z', '2026-10-02T00:00:00Z')).toBe(false);
    expect(mayAskPermission('2026-09-17T00:00:00Z', '2026-10-02T00:00:00Z')).toBe(true);
  });
});
