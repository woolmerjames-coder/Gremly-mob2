/**
 * Tests for pure helper functions in workers/inngest-jobs/index.js
 *
 * These are all non-exported pure functions re-derived for direct testing.
 * They cover snapshot computation, date helpers, Life Map merge, and JSON parsing.
 */

// ── Re-derive pure functions ────────────────────────────────────────────────

function formatDateOnly(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (current <= end) {
    dates.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function getExpectedCompletionsForDays(frequency, days) {
  switch (frequency) {
    case 'daily':
      return days;
    case 'weekly':
      return Math.ceil(days / 7);
    case '2x/week':
      return Math.ceil((days / 7) * 2);
    case '3x/week':
      return Math.ceil((days / 7) * 3);
    case '4x/week':
      return Math.ceil((days / 7) * 4);
    case '5x/week':
      return Math.ceil((days / 7) * 5);
    case '6x/week':
      return Math.ceil((days / 7) * 6);
    case '5x/month':
      return Math.ceil((days / 30) * 5);
    case 'monthly':
      return days >= 30 ? 1 : 0;
    default:
      return days;
  }
}

function eventActiveOnDate(evt, date) {
  const start = evt.target_date;
  const end = evt.end_date || evt.target_date;
  return start <= date && end >= date;
}

function snapshotDeduplicateEvents(events) {
  const seenExternalIds = new Map();
  const seenKeyDates = new Set();
  const deduped = [];

  for (const evt of events) {
    if (
      evt.title &&
      (evt.title.toLowerCase().startsWith('canceled:') ||
        evt.title.toLowerCase().startsWith('cancelled:'))
    )
      continue;

    if (evt.external_source && evt.external_source.externalId) {
      const extId = evt.external_source.externalId;
      if (!seenExternalIds.has(extId)) {
        seenExternalIds.set(extId, evt);
        deduped.push(evt);
      }
    } else {
      const key = `${(evt.title || '').trim().toLowerCase()}|${evt.target_date}|${evt.space_id || ''}`;
      if (!seenKeyDates.has(key)) {
        seenKeyDates.add(key);
        deduped.push(evt);
      }
    }
  }

  return deduped;
}

function snapshotComputeTodoStats(todos, targetDate) {
  const overdue = todos.filter(
    (t) => t.target_date && t.target_date < targetDate && t.status !== 'completed' && !t.archived,
  ).length;
  const active = todos.filter((t) => t.status === 'active' && !t.archived).length;
  const completedRecently = todos.filter((t) => t.completed_at).length;

  return { overdue, active, completedRecently };
}

function snapshotComputeHabitHealth(habits, habitProgress, windowDays) {
  const completionMap = {};
  for (const hp of habitProgress) {
    completionMap[hp.habit_id] = (completionMap[hp.habit_id] || 0) + 1;
  }

  return habits.map((h) => {
    const done = completionMap[h.id] || 0;
    const expected = getExpectedCompletionsForDays(h.frequency, windowDays);
    const score = expected > 0 ? Math.round((done / expected) * 100) : 0;
    return {
      id: h.id,
      name: h.name,
      frequency: h.frequency,
      space_id: h.space_id || null,
      completions: done,
      expected,
      score_pct: score,
    };
  });
}

function snapshotComputeDropVelocity(drops, targetDate) {
  const target = new Date(targetDate + 'T00:00:00Z');

  const threeBefore = new Date(target);
  threeBefore.setUTCDate(threeBefore.getUTCDate() - 3);
  const threeBeforeStr = formatDateOnly(threeBefore);

  const sixBefore = new Date(target);
  sixBefore.setUTCDate(sixBefore.getUTCDate() - 6);
  const sixBeforeStr = formatDateOnly(sixBefore);

  const dropsLast3 = drops.filter((n) => {
    const d = n.created_at ? n.created_at.slice(0, 10) : null;
    return d && d >= threeBeforeStr && d <= targetDate;
  }).length;

  const dropsPrev3 = drops.filter((n) => {
    const d = n.created_at ? n.created_at.slice(0, 10) : null;
    return d && d >= sixBeforeStr && d < threeBeforeStr;
  }).length;

  let velocity = 'steady';
  if (dropsLast3 > dropsPrev3 * 1.5) velocity = 'increasing';
  else if (dropsLast3 < dropsPrev3 * 0.5) velocity = 'decreasing';

  return { velocity, dropsLast3, dropsPrev3 };
}

function snapshotComputeMoodSignal(journals) {
  const moodCounts = {};
  let totalMoodTags = 0;

  for (const j of journals) {
    if (j.mood && Array.isArray(j.mood)) {
      for (const m of j.mood) {
        moodCounts[m] = (moodCounts[m] || 0) + 1;
        totalMoodTags++;
      }
    }
  }

  const topMoods =
    totalMoodTags > 0
      ? Object.entries(moodCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([mood, count]) => ({ mood, count, pct: Math.round((count / totalMoodTags) * 100) }))
      : [];

  return {
    topMoods,
    allTags: moodCounts,
    totalTags: totalMoodTags,
    journalCount: journals.length,
  };
}

function snapshotComputeSpaceActivity(drops, todos, spaceMap) {
  const activity = {};

  for (const spaceId of Object.keys(spaceMap)) {
    const dropCount = drops.filter((n) => n.space_id === spaceId).length;
    const todoCount = todos.filter((t) => t.space_id === spaceId && !t.archived).length;
    activity[spaceId] = {
      name: spaceMap[spaceId],
      recentDrops: dropCount,
      recentTodos: todoCount,
      totalRecent: dropCount + todoCount,
    };
  }

  return activity;
}

function safeParseJSON(raw, _label) {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  try {
    return JSON.parse(jsonStr);
  } catch {
    // In production, fallbacks to jsonrepair — for this test we just return null
    return null;
  }
}

function mergeWeeklyLifeMapUpdates(lifeMap, delta) {
  if (!lifeMap?.domains || !delta) return lifeMap;

  const now = new Date().toISOString();

  for (const update of delta.thread_updates || []) {
    const domain = lifeMap.domains.find((d) => d.name === update.domain_name);
    if (!domain) continue;

    const thread = (domain.threads || []).find((t) => t.name === update.thread_name);
    if (!thread) continue;

    if (update.summary) thread.summary = update.summary;
    if (update.recent_update) thread.recent_update = update.recent_update;
    if (update.status) thread.status = update.status;
    if (update.momentum) thread.momentum = update.momentum;

    if (update.new_evidence && Array.isArray(update.new_evidence)) {
      if (!thread.evidence) thread.evidence = [];
      for (const e of update.new_evidence) {
        const exactDuplicate = thread.evidence.some(
          (existing) => existing.date === e.date && existing.signal === e.signal,
        );
        if (!exactDuplicate) {
          thread.evidence.push(e);
        }
      }
    }
  }

  for (const [domainName, attention] of Object.entries(delta.domain_attention_updates || {})) {
    const domain = lifeMap.domains.find((d) => d.name === domainName);
    if (domain) {
      domain.attention = attention;
    }
  }

  lifeMap.version = (lifeMap.version || 1) + 1;
  lifeMap.rebuilt_at = now;
  lifeMap.updated_at = now;

  return lifeMap;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('eventActiveOnDate', () => {
  it('returns true for single-day event on matching date', () => {
    expect(eventActiveOnDate({ target_date: '2025-12-15' }, '2025-12-15')).toBe(true);
  });

  it('returns false for single-day event on different date', () => {
    expect(eventActiveOnDate({ target_date: '2025-12-15' }, '2025-12-16')).toBe(false);
  });

  it('returns true for multi-day event on intermediate date', () => {
    expect(
      eventActiveOnDate({ target_date: '2025-12-10', end_date: '2025-12-20' }, '2025-12-15'),
    ).toBe(true);
  });

  it('returns true for multi-day event on start date', () => {
    expect(
      eventActiveOnDate({ target_date: '2025-12-10', end_date: '2025-12-20' }, '2025-12-10'),
    ).toBe(true);
  });

  it('returns true for multi-day event on end date', () => {
    expect(
      eventActiveOnDate({ target_date: '2025-12-10', end_date: '2025-12-20' }, '2025-12-20'),
    ).toBe(true);
  });

  it('returns false for multi-day event after end date', () => {
    expect(
      eventActiveOnDate({ target_date: '2025-12-10', end_date: '2025-12-15' }, '2025-12-16'),
    ).toBe(false);
  });

  it('returns false for multi-day event before start date', () => {
    expect(
      eventActiveOnDate({ target_date: '2025-12-10', end_date: '2025-12-15' }, '2025-12-09'),
    ).toBe(false);
  });
});

describe('snapshotDeduplicateEvents', () => {
  it('deduplicates by external source ID', () => {
    const events = [
      { title: 'Meeting', target_date: '2025-12-15', external_source: { externalId: 'ext-1' } },
      { title: 'Meeting', target_date: '2025-12-15', external_source: { externalId: 'ext-1' } },
    ];
    expect(snapshotDeduplicateEvents(events)).toHaveLength(1);
  });

  it('keeps events with different external IDs', () => {
    const events = [
      { title: 'Meeting', target_date: '2025-12-15', external_source: { externalId: 'ext-1' } },
      { title: 'Lunch', target_date: '2025-12-15', external_source: { externalId: 'ext-2' } },
    ];
    expect(snapshotDeduplicateEvents(events)).toHaveLength(2);
  });

  it('deduplicates local events by title+date+space key', () => {
    const events = [
      { title: 'Standup', target_date: '2025-12-15', space_id: 's1' },
      { title: 'Standup', target_date: '2025-12-15', space_id: 's1' },
    ];
    expect(snapshotDeduplicateEvents(events)).toHaveLength(1);
  });

  it('preserves local events with different dates', () => {
    const events = [
      { title: 'Standup', target_date: '2025-12-15', space_id: 's1' },
      { title: 'Standup', target_date: '2025-12-16', space_id: 's1' },
    ];
    expect(snapshotDeduplicateEvents(events)).toHaveLength(2);
  });

  it('removes cancelled events (Canceled: prefix)', () => {
    const events = [
      { title: 'Canceled: Old Meeting', target_date: '2025-12-15' },
      { title: 'Real Meeting', target_date: '2025-12-15' },
    ];
    expect(snapshotDeduplicateEvents(events)).toHaveLength(1);
    expect(snapshotDeduplicateEvents(events)[0].title).toBe('Real Meeting');
  });

  it('removes cancelled events (Cancelled: prefix)', () => {
    const events = [{ title: 'Cancelled: Old Meeting', target_date: '2025-12-15' }];
    expect(snapshotDeduplicateEvents(events)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(snapshotDeduplicateEvents([])).toEqual([]);
  });
});

describe('snapshotComputeTodoStats', () => {
  it('counts overdue, active, and completed todos', () => {
    const todos = [
      { target_date: '2025-12-10', status: 'active', archived: false, completed_at: null },
      {
        target_date: '2025-12-10',
        status: 'completed',
        archived: false,
        completed_at: '2025-12-10T10:00:00Z',
      },
      { target_date: '2025-12-20', status: 'active', archived: false, completed_at: null },
      { target_date: null, status: 'active', archived: false, completed_at: null },
    ];
    const result = snapshotComputeTodoStats(todos, '2025-12-15');
    expect(result.overdue).toBe(1);
    expect(result.active).toBe(3);
    expect(result.completedRecently).toBe(1);
  });

  it('excludes archived from overdue', () => {
    const todos = [
      { target_date: '2025-12-10', status: 'active', archived: true, completed_at: null },
    ];
    const result = snapshotComputeTodoStats(todos, '2025-12-15');
    expect(result.overdue).toBe(0);
  });

  it('handles empty todos', () => {
    const result = snapshotComputeTodoStats([], '2025-12-15');
    expect(result).toEqual({ overdue: 0, active: 0, completedRecently: 0 });
  });
});

describe('snapshotComputeHabitHealth', () => {
  it('computes score for daily habit over 7 days', () => {
    const habits = [{ id: 'h1', name: 'Run', frequency: 'daily', space_id: null }];
    const progress = [
      { habit_id: 'h1' },
      { habit_id: 'h1' },
      { habit_id: 'h1' },
      { habit_id: 'h1' },
      { habit_id: 'h1' },
    ];
    const result = snapshotComputeHabitHealth(habits, progress, 7);
    expect(result).toHaveLength(1);
    expect(result[0].completions).toBe(5);
    expect(result[0].expected).toBe(7);
    expect(result[0].score_pct).toBe(71); // round(5/7*100)
  });

  it('returns 0 score for habit with no completions', () => {
    const habits = [{ id: 'h1', name: 'Run', frequency: 'daily', space_id: null }];
    const result = snapshotComputeHabitHealth(habits, [], 7);
    expect(result[0].score_pct).toBe(0);
  });

  it('handles multiple habits', () => {
    const habits = [
      { id: 'h1', name: 'Run', frequency: 'daily' },
      { id: 'h2', name: 'Read', frequency: 'weekly' },
    ];
    const progress = [{ habit_id: 'h1' }, { habit_id: 'h1' }, { habit_id: 'h2' }];
    const result = snapshotComputeHabitHealth(habits, progress, 7);
    expect(result).toHaveLength(2);
    expect(result[0].completions).toBe(2);
    expect(result[1].completions).toBe(1);
  });
});

describe('snapshotComputeDropVelocity', () => {
  it('returns steady when drops are similar across periods', () => {
    const drops = [
      { created_at: '2025-12-13T10:00:00Z' },
      { created_at: '2025-12-14T10:00:00Z' },
      { created_at: '2025-12-10T10:00:00Z' },
      { created_at: '2025-12-11T10:00:00Z' },
    ];
    const result = snapshotComputeDropVelocity(drops, '2025-12-15');
    expect(result.velocity).toBe('steady');
  });

  it('returns increasing when recent drops outpace previous', () => {
    const drops = [
      { created_at: '2025-12-13T10:00:00Z' },
      { created_at: '2025-12-14T10:00:00Z' },
      { created_at: '2025-12-15T10:00:00Z' },
      { created_at: '2025-12-14T12:00:00Z' },
      // Previous period: only 1
      { created_at: '2025-12-10T10:00:00Z' },
    ];
    const result = snapshotComputeDropVelocity(drops, '2025-12-15');
    expect(result.velocity).toBe('increasing');
    expect(result.dropsLast3).toBe(4);
  });

  it('returns decreasing when recent drops are much lower', () => {
    const drops = [
      // Previous period: 4 drops
      { created_at: '2025-12-09T10:00:00Z' },
      { created_at: '2025-12-10T10:00:00Z' },
      { created_at: '2025-12-11T10:00:00Z' },
      { created_at: '2025-12-10T12:00:00Z' },
      // Recent period: 1 drop
      { created_at: '2025-12-14T10:00:00Z' },
    ];
    const result = snapshotComputeDropVelocity(drops, '2025-12-15');
    expect(result.velocity).toBe('decreasing');
  });

  it('handles empty drops', () => {
    const result = snapshotComputeDropVelocity([], '2025-12-15');
    expect(result).toEqual({ velocity: 'steady', dropsLast3: 0, dropsPrev3: 0 });
  });
});

describe('snapshotComputeMoodSignal', () => {
  it('returns top moods sorted by frequency', () => {
    const journals = [{ mood: ['happy', 'calm'] }, { mood: ['happy'] }, { mood: ['anxious'] }];
    const result = snapshotComputeMoodSignal(journals);
    expect(result.topMoods[0].mood).toBe('happy');
    expect(result.topMoods[0].count).toBe(2);
    expect(result.totalTags).toBe(4);
    expect(result.journalCount).toBe(3);
  });

  it('returns empty topMoods for no mood data', () => {
    const journals = [{ mood: [] }, { mood: null }];
    const result = snapshotComputeMoodSignal(journals);
    expect(result.topMoods).toEqual([]);
    expect(result.totalTags).toBe(0);
  });

  it('limits to top 3 moods', () => {
    const journals = [{ mood: ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'a'] }];
    const result = snapshotComputeMoodSignal(journals);
    expect(result.topMoods).toHaveLength(3);
  });

  it('handles empty journals array', () => {
    const result = snapshotComputeMoodSignal([]);
    expect(result.journalCount).toBe(0);
    expect(result.topMoods).toEqual([]);
  });
});

describe('snapshotComputeSpaceActivity', () => {
  it('groups drops and todos by space', () => {
    const drops = [{ space_id: 's1' }, { space_id: 's1' }, { space_id: 's2' }];
    const todos = [
      { space_id: 's1', archived: false },
      { space_id: 's2', archived: true },
    ];
    const spaceMap = { s1: 'Health', s2: 'Work' };

    const result = snapshotComputeSpaceActivity(drops, todos, spaceMap);
    expect(result.s1.recentDrops).toBe(2);
    expect(result.s1.recentTodos).toBe(1);
    expect(result.s1.totalRecent).toBe(3);
    expect(result.s2.recentTodos).toBe(0); // archived excluded
  });

  it('returns empty for empty inputs', () => {
    const result = snapshotComputeSpaceActivity([], [], {});
    expect(result).toEqual({});
  });
});

describe('getExpectedCompletionsForDays', () => {
  it('daily: returns number of days', () => {
    expect(getExpectedCompletionsForDays('daily', 7)).toBe(7);
  });

  it('weekly: returns ceil(days/7)', () => {
    expect(getExpectedCompletionsForDays('weekly', 7)).toBe(1);
    expect(getExpectedCompletionsForDays('weekly', 10)).toBe(2);
  });

  it('2x/week', () => {
    expect(getExpectedCompletionsForDays('2x/week', 7)).toBe(2);
  });

  it('3x/week', () => {
    expect(getExpectedCompletionsForDays('3x/week', 7)).toBe(3);
  });

  it('5x/month', () => {
    expect(getExpectedCompletionsForDays('5x/month', 30)).toBe(5);
  });

  it('monthly: returns 1 for 30+ days, 0 for less', () => {
    expect(getExpectedCompletionsForDays('monthly', 30)).toBe(1);
    expect(getExpectedCompletionsForDays('monthly', 15)).toBe(0);
  });

  it('unknown frequency defaults to days', () => {
    expect(getExpectedCompletionsForDays('custom', 7)).toBe(7);
  });
});

describe('getDateRange', () => {
  it('returns array of dates from start to end (inclusive)', () => {
    const result = getDateRange('2025-12-15', '2025-12-18');
    expect(result).toEqual(['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18']);
  });

  it('returns single date when start equals end', () => {
    const result = getDateRange('2025-12-15', '2025-12-15');
    expect(result).toEqual(['2025-12-15']);
  });

  it('returns empty array when start is after end', () => {
    const result = getDateRange('2025-12-20', '2025-12-15');
    expect(result).toEqual([]);
  });

  it('crosses month boundary', () => {
    const result = getDateRange('2025-12-30', '2026-01-02');
    expect(result).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
});

describe('safeParseJSON', () => {
  it('parses valid JSON', () => {
    const result = safeParseJSON('{"key": "value"}', 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips markdown code fences before parsing', () => {
    const result = safeParseJSON('```json\n{"key": "value"}\n```', 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null for invalid JSON (in test env without jsonrepair)', () => {
    const result = safeParseJSON('not json at all', 'test');
    expect(result).toBeNull();
  });

  it('handles empty JSON object', () => {
    const result = safeParseJSON('{}', 'test');
    expect(result).toEqual({});
  });

  it('handles JSON array', () => {
    const result = safeParseJSON('[1, 2, 3]', 'test');
    expect(result).toEqual([1, 2, 3]);
  });
});

describe('mergeWeeklyLifeMapUpdates', () => {
  function makeLifeMap() {
    return {
      version: 1,
      domains: [
        {
          name: 'Health',
          attention: 'active',
          threads: [
            {
              name: 'Running',
              status: 'building',
              momentum: 'upward',
              summary: 'Started C25K',
              recent_update: null,
              evidence: [{ date: '2025-12-10', signal: 'First run' }],
            },
          ],
        },
      ],
    };
  }

  it('returns lifeMap unchanged when delta is null', () => {
    const lm = makeLifeMap();
    expect(mergeWeeklyLifeMapUpdates(lm, null)).toBe(lm);
  });

  it('returns lifeMap unchanged when lifeMap has no domains', () => {
    expect(mergeWeeklyLifeMapUpdates({}, { thread_updates: [] })).toEqual({});
  });

  it('updates thread summary from delta', () => {
    const lm = makeLifeMap();
    const delta = {
      thread_updates: [
        {
          domain_name: 'Health',
          thread_name: 'Running',
          summary: 'Completed week 3 of C25K',
        },
      ],
    };
    const result = mergeWeeklyLifeMapUpdates(lm, delta);
    expect(result.domains[0].threads[0].summary).toBe('Completed week 3 of C25K');
  });

  it('appends new evidence without duplicates', () => {
    const lm = makeLifeMap();
    const delta = {
      thread_updates: [
        {
          domain_name: 'Health',
          thread_name: 'Running',
          new_evidence: [
            { date: '2025-12-10', signal: 'First run' }, // duplicate — skip
            { date: '2025-12-15', signal: 'Ran 5K' }, // new — append
          ],
        },
      ],
    };
    const result = mergeWeeklyLifeMapUpdates(lm, delta);
    expect(result.domains[0].threads[0].evidence).toHaveLength(2);
    expect(result.domains[0].threads[0].evidence[1].signal).toBe('Ran 5K');
  });

  it('updates domain attention', () => {
    const lm = makeLifeMap();
    const delta = {
      thread_updates: [],
      domain_attention_updates: { Health: 'fading' },
    };
    const result = mergeWeeklyLifeMapUpdates(lm, delta);
    expect(result.domains[0].attention).toBe('fading');
  });

  it('increments version', () => {
    const lm = makeLifeMap();
    const result = mergeWeeklyLifeMapUpdates(lm, { thread_updates: [] });
    expect(result.version).toBe(2);
  });

  it('sets rebuilt_at and updated_at timestamps', () => {
    const lm = makeLifeMap();
    const result = mergeWeeklyLifeMapUpdates(lm, { thread_updates: [] });
    expect(result.rebuilt_at).toBeTruthy();
    expect(result.updated_at).toBeTruthy();
  });

  it('gracefully skips updates for non-existent domains', () => {
    const lm = makeLifeMap();
    const delta = {
      thread_updates: [{ domain_name: 'NoSuchDomain', thread_name: 'Thing', summary: 'New' }],
    };
    // Should not throw
    const result = mergeWeeklyLifeMapUpdates(lm, delta);
    expect(result.domains[0].threads[0].summary).toBe('Started C25K'); // unchanged
  });

  it('gracefully skips updates for non-existent threads', () => {
    const lm = makeLifeMap();
    const delta = {
      thread_updates: [{ domain_name: 'Health', thread_name: 'Swimming', summary: 'New thread' }],
    };
    const result = mergeWeeklyLifeMapUpdates(lm, delta);
    expect(result.domains[0].threads).toHaveLength(1); // only Running
  });
});
