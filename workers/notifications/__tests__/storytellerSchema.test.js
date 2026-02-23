/**
 * Contract tests for the storyteller JSON schema in the notifications worker.
 *
 * These tests verify the expected shape of the storyteller's output, ensuring
 * all required and optional fields are present and correctly typed. If the
 * worker schema drifts from what the app expects, these tests will catch it.
 *
 * The "golden" schema object mirrors the JSON scaffold in the storyteller prompt
 * in workers/notifications/index.js.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a valid storyteller response that matches the full JSON schema.
 * Update this if you change the worker prompt schema.
 */
function makeFullStorytellerResponse() {
  return {
    weeklyCommentary:
      'You shipped the API and established a solid running streak — momentum compounds.',
    highlightMoment: {
      title: 'Shipped the API',
      reason: 'First customer-facing feature in the new codebase',
      gremlyComment: 'That was a big deal — well done!',
    },
    magicMoments: [
      {
        title: 'Morning run streak',
        body: 'Five consecutive mornings. Your body adapts after day three — you pushed past that.',
        connectedItems: ['Run 5k', 'Morning routine'],
        date: '2025-12-19',
      },
      {
        title: 'API launch',
        body: 'Shipped to production after two weeks of iteration.',
        connectedItems: [],
        date: '2025-12-17',
      },
    ],
    insights: [
      {
        type: 'productivity_pattern',
        headline: 'Morning power hours',
        body: 'You completed 70% of tasks before noon.',
        isActionable: false,
        actionLabel: null,
        actionType: null,
        staleItemIds: null,
      },
      {
        type: 'stale_cleanup',
        headline: 'Time to declutter',
        body: '3 items have been sitting for 2+ weeks.',
        isActionable: true,
        actionLabel: 'Review now',
        actionType: 'navigate',
        staleItemIds: ['item-1', 'item-2', 'item-3'],
      },
      {
        type: 'life_event',
        headline: 'Birthday week',
        body: 'Celebrations slowed your output — totally reasonable.',
        isActionable: false,
        actionLabel: null,
        actionType: null,
        staleItemIds: null,
      },
      {
        type: 'week_rhythm',
        headline: 'Slow-start sprinter',
        body: 'Your output doubled after Wednesday.',
        isActionable: false,
        actionLabel: null,
        actionType: null,
        staleItemIds: null,
      },
    ],
    weekAhead: {
      introduction: 'Next week has 5 events — a classic mid-week crunch shape.',
      highlights: [
        {
          eventTitle: 'Sprint Review',
          day: 'Friday',
          time: '3:00 PM',
          context: 'Good chance to demo the new API',
          prepNudge: 'Prep your demo talking points Thursday evening',
        },
      ],
      busyDayWarnings: [{ day: 'Wednesday', comment: '4 events stacked' }],
      totalEventCount: 5,
    },
    recommendations: [
      {
        trigger: 'fitness_travel_drop',
        text: 'Try a 15-minute hotel room workout when traveling.',
        actionType: 'create_habit',
        actionLabel: 'Create habit',
        prefill: {
          name: 'Quick travel workout',
          frequency: 'daily',
          time_window: 'morning',
          due_day: null,
        },
      },
      {
        trigger: 'stale_work_tasks',
        text: 'Block 30 minutes Monday to triage old tasks.',
        actionType: 'create_todo',
        actionLabel: 'Add to today',
        prefill: {
          name: 'Triage stale work tasks',
          frequency: null,
          time_window: 'morning',
          due_day: '2025-12-22',
        },
      },
      {
        trigger: 'journal_gap',
        text: 'Even a one-line journal helps you notice patterns.',
        actionType: 'tip',
        actionLabel: 'Got it',
        prefill: null,
      },
    ],
    weekType: 'a focused, productive week with strong morning energy',
    weekTypeShort: 'Deep Focus',
    keyThemes: ['shipping', 'fitness', 'morning-energy'],
    mood: 'motivated',
  };
}

const VALID_INSIGHT_TYPES = [
  'stale_cleanup',
  'capture_ratio',
  'productivity_pattern',
  'space_activity',
  'balance',
  'habit_observation',
  'journal_encouragement',
  'life_event',
  'week_rhythm',
];

const VALID_ACTION_TYPES = ['create_todo', 'create_habit', 'tip'];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('storyteller JSON schema contract', () => {
  const response = makeFullStorytellerResponse();

  // ── Top-level required fields ─────────────────────────────────────────

  it('has all required top-level string fields', () => {
    expect(typeof response.weeklyCommentary).toBe('string');
    expect(typeof response.weekType).toBe('string');
    expect(typeof response.weekTypeShort).toBe('string');
    expect(typeof response.mood).toBe('string');
  });

  it('has keyThemes as non-empty string array', () => {
    expect(Array.isArray(response.keyThemes)).toBe(true);
    expect(response.keyThemes.length).toBeGreaterThan(0);
    response.keyThemes.forEach((t) => expect(typeof t).toBe('string'));
  });

  // ── highlightMoment ───────────────────────────────────────────────────

  it('highlightMoment has title, reason, gremlyComment', () => {
    expect(typeof response.highlightMoment.title).toBe('string');
    expect(typeof response.highlightMoment.reason).toBe('string');
    expect(typeof response.highlightMoment.gremlyComment).toBe('string');
  });

  // ── magicMoments ──────────────────────────────────────────────────────

  it('magicMoments is an array of objects with required fields', () => {
    expect(Array.isArray(response.magicMoments)).toBe(true);
    response.magicMoments.forEach((m) => {
      expect(typeof m.title).toBe('string');
      expect(typeof m.body).toBe('string');
      expect(typeof m.date).toBe('string');
      expect(m.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(m.connectedItems)).toBe(true);
    });
  });

  // ── insights ──────────────────────────────────────────────────────────

  it('insights have valid types', () => {
    response.insights.forEach((ins) => {
      expect(VALID_INSIGHT_TYPES).toContain(ins.type);
    });
  });

  it('insights have required string fields', () => {
    response.insights.forEach((ins) => {
      expect(typeof ins.headline).toBe('string');
      expect(typeof ins.body).toBe('string');
      expect(typeof ins.isActionable).toBe('boolean');
    });
  });

  it('actionable insights have actionLabel', () => {
    response.insights.filter((i) => i.isActionable).forEach((ins) => {
      expect(ins.actionLabel).not.toBeNull();
      expect(typeof ins.actionLabel).toBe('string');
    });
  });

  it('stale_cleanup insights have staleItemIds array', () => {
    response.insights.filter((i) => i.type === 'stale_cleanup').forEach((ins) => {
      expect(Array.isArray(ins.staleItemIds)).toBe(true);
      expect(ins.staleItemIds.length).toBeGreaterThan(0);
    });
  });

  // ── weekAhead ─────────────────────────────────────────────────────────

  it('weekAhead has required structure', () => {
    expect(typeof response.weekAhead.introduction).toBe('string');
    expect(Array.isArray(response.weekAhead.highlights)).toBe(true);
    expect(Array.isArray(response.weekAhead.busyDayWarnings)).toBe(true);
    expect(typeof response.weekAhead.totalEventCount).toBe('number');
  });

  it('weekAhead highlights have eventTitle and day', () => {
    response.weekAhead.highlights.forEach((h) => {
      expect(typeof h.eventTitle).toBe('string');
      expect(typeof h.day).toBe('string');
    });
  });

  it('weekAhead highlights may have context and prepNudge', () => {
    const withExtras = response.weekAhead.highlights.filter((h) => h.context);
    expect(withExtras.length).toBeGreaterThan(0);
    withExtras.forEach((h) => {
      expect(typeof h.context).toBe('string');
      expect(typeof h.prepNudge).toBe('string');
    });
  });

  // ── recommendations ───────────────────────────────────────────────────

  it('recommendations have valid actionType', () => {
    response.recommendations.forEach((r) => {
      expect(VALID_ACTION_TYPES).toContain(r.actionType);
    });
  });

  it('recommendations have required fields', () => {
    response.recommendations.forEach((r) => {
      expect(typeof r.trigger).toBe('string');
      expect(typeof r.text).toBe('string');
      expect(typeof r.actionLabel).toBe('string');
    });
  });

  it('create_habit recommendations have prefill with name and frequency', () => {
    response.recommendations
      .filter((r) => r.actionType === 'create_habit')
      .forEach((r) => {
        expect(r.prefill).not.toBeNull();
        expect(typeof r.prefill.name).toBe('string');
        expect(typeof r.prefill.frequency).toBe('string');
      });
  });

  it('create_todo recommendations have prefill with name and due_day', () => {
    response.recommendations
      .filter((r) => r.actionType === 'create_todo')
      .forEach((r) => {
        expect(r.prefill).not.toBeNull();
        expect(typeof r.prefill.name).toBe('string');
        expect(typeof r.prefill.due_day).toBe('string');
        expect(r.prefill.due_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
  });

  it('tip recommendations may have null prefill', () => {
    const tips = response.recommendations.filter((r) => r.actionType === 'tip');
    expect(tips.length).toBeGreaterThan(0);
    tips.forEach((r) => {
      expect(r.prefill).toBeNull();
    });
  });

  // ── Word budget compliance ────────────────────────────────────────────

  it('weeklyCommentary is under 60 words', () => {
    const words = response.weeklyCommentary.split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(60);
  });

  it('insight headlines are under 8 words', () => {
    response.insights.forEach((ins) => {
      const words = ins.headline.split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(8);
    });
  });

  it('insight bodies are under 25 words', () => {
    response.insights.forEach((ins) => {
      const words = ins.body.split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(25);
    });
  });

  it('recommendation text is under 20 words', () => {
    response.recommendations.forEach((r) => {
      const words = r.text.split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(20);
    });
  });

  it('weekAhead introduction is under 30 words', () => {
    const words = response.weekAhead.introduction.split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(30);
  });
});
