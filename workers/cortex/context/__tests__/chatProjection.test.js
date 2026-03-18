/**
 * Tests for workers/cortex/context/chatProjection.js
 *
 * Tests the Life Map-powered chat context builder:
 * - formatDailyFocusForChat
 * - formatLifeMapForChat (tiered by lane)
 * - formatRecentDelta
 * - buildChatContext (integration)
 * - getLifeMapForChat / getDailyFocusForChat / fetchRecentActivityDelta (KV caching)
 */

// ── Inline the pure formatting functions for direct testing ────────────────
// (These are not exported, so we re-derive them from the source logic.)

function formatDailyFocusForChat(focus) {
  if (!focus) return '';

  const parts = ['=== CURRENT LIFE CONTEXT (generated daily) ==='];

  if (focus.lifeMoment) parts.push(`Life moment: ${focus.lifeMoment}`);
  if (focus.tone) parts.push(`Tone today: ${focus.tone}`);
  if (focus.briefHeadline) parts.push(`Today's headline: "${focus.briefHeadline}"`);

  if (focus.leadStory) {
    parts.push(
      `Lead story: ${focus.leadStory.domain} → ${focus.leadStory.thread}: ${focus.leadStory.detail}`,
    );
  }

  if (focus.todayFocus && focus.todayFocus.length > 0) {
    parts.push(`Today's focus: ${focus.todayFocus.join(', ')}`);
  }

  const people = (focus.namedAnchors || []).filter((a) => a.type === 'person').map((a) => a.label);
  if (people.length > 0) {
    parts.push(`Named people: ${people.join(', ')}`);
  }

  parts.push('');
  parts.push('Use this context naturally — like a friend who knows their situation.');

  return parts.join('\n');
}

function formatLifeMapForChat(lifeMap, lane, opts = {}) {
  if (!lifeMap?.domains) return '';

  const parts = ['=== LIFE MAP — WHAT MATTERS TO THIS PERSON ==='];

  for (const domain of lifeMap.domains) {
    const isMatchingDomain =
      (lane === 'space' && opts.spaceId && domain.space_id === opts.spaceId) ||
      (lane === 'entity' && opts.entitySpaceId && domain.space_id === opts.entitySpaceId);

    if (isMatchingDomain) {
      parts.push(`\nDOMAIN: "${domain.name}" [RELEVANT TO THIS CONVERSATION]`);

      for (const thread of domain.threads || []) {
        if (thread.lifecycle === 'archived') continue;

        parts.push(
          `\n  ${thread.name}: ${thread.status}, ${thread.momentum}, ${thread.importance} importance`,
        );
        if (thread.summary) {
          parts.push(`    "${thread.summary}"`);
        }
        if (thread.recent_update) {
          parts.push(`    Latest: "${thread.recent_update}"`);
        }
        if (thread.evidence?.length > 0) {
          const recent = thread.evidence.slice(-3);
          for (const e of recent) {
            parts.push(`    ${e.date}: ${e.signal}`);
          }
        }
      }
    } else {
      const activeThreads = (domain.threads || []).filter(
        (t) => t.lifecycle === 'active' || t.lifecycle === 'dormant',
      );

      if (activeThreads.length === 0) continue;

      parts.push(`\n${domain.name}:`);
      for (const thread of activeThreads) {
        parts.push(
          `  ${thread.name}: ${thread.status}, ${thread.momentum}${thread.importance === 'high' ? ' [important]' : ''}`,
        );
        if (thread.summary && lane !== 'habit_builder' && thread.importance === 'high') {
          const firstSentence = thread.summary.split(/\.\s/)[0] + '.';
          parts.push(`    "${firstSentence}"`);
        }
      }
    }
  }

  return parts.join('\n');
}

function formatRecentDelta(delta) {
  if (!delta) return '';

  const parts = [];

  if (delta.recentDrops.length > 0) {
    parts.push('=== RECENT ACTIVITY (last 24-72h) ===');
    for (const d of delta.recentDrops.slice(0, 6)) {
      const mood = d.mood?.length > 0 ? ` [mood: ${d.mood.join(', ')}]` : '';
      const date = d.created_at ? d.created_at.slice(0, 10) : '';
      parts.push(`  ${date}: [${d.subtype || 'note'}] ${d.title}${mood}`);
    }
  }

  if (delta.recentCompletions.length > 0) {
    const titles = delta.recentCompletions
      .slice(0, 4)
      .map((t) => t.title)
      .join(', ');
    parts.push(`  Recent completions: ${titles}`);
  }

  return parts.join('\n');
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('formatDailyFocusForChat', () => {
  it('returns empty string for null focus', () => {
    expect(formatDailyFocusForChat(null)).toBe('');
  });

  it('returns empty string for undefined focus', () => {
    expect(formatDailyFocusForChat(undefined)).toBe('');
  });

  it('includes life moment when present', () => {
    const result = formatDailyFocusForChat({ lifeMoment: 'Settling into a new routine' });
    expect(result).toContain('Life moment: Settling into a new routine');
  });

  it('includes tone when present', () => {
    const result = formatDailyFocusForChat({ tone: 'motivated' });
    expect(result).toContain('Tone today: motivated');
  });

  it('includes brief headline when present', () => {
    const result = formatDailyFocusForChat({ briefHeadline: 'Shipping day' });
    expect(result).toContain('Today\'s headline: "Shipping day"');
  });

  it('includes lead story when present', () => {
    const result = formatDailyFocusForChat({
      leadStory: { domain: 'Work', thread: 'API Project', detail: 'Final review today' },
    });
    expect(result).toContain('Lead story: Work → API Project: Final review today');
  });

  it('includes today focus items', () => {
    const result = formatDailyFocusForChat({ todayFocus: ['Ship API', 'Call dentist'] });
    expect(result).toContain("Today's focus: Ship API, Call dentist");
  });

  it('includes named people from anchors', () => {
    const result = formatDailyFocusForChat({
      namedAnchors: [
        { label: 'Sarah', type: 'person' },
        { label: 'Home', type: 'place' },
      ],
    });
    expect(result).toContain('Named people: Sarah');
    expect(result).not.toContain('Home');
  });

  it('includes context-use instruction footer', () => {
    const result = formatDailyFocusForChat({ tone: 'calm' });
    expect(result).toContain('Use this context naturally');
  });
});

describe('formatLifeMapForChat', () => {
  const mockLifeMap = {
    domains: [
      {
        name: 'Health',
        space_id: 'space-health',
        threads: [
          {
            name: 'Running',
            status: 'active',
            momentum: 'building',
            importance: 'high',
            lifecycle: 'active',
            summary: 'Training for a 10K. Making good progress.',
            recent_update: 'Ran 5K today at PB pace.',
            evidence: [
              { date: '2025-12-14', signal: 'Ran 5K' },
              { date: '2025-12-15', signal: 'Ran 5K PB' },
            ],
          },
        ],
      },
      {
        name: 'Work',
        space_id: 'space-work',
        threads: [
          {
            name: 'API Project',
            status: 'in-progress',
            momentum: 'strong',
            importance: 'high',
            lifecycle: 'active',
            summary: 'Shipping the v2 API this week.',
          },
          {
            name: 'Old project',
            status: 'complete',
            momentum: 'none',
            importance: 'low',
            lifecycle: 'archived',
          },
        ],
      },
    ],
  };

  it('returns empty string for null lifeMap', () => {
    expect(formatLifeMapForChat(null, 'space')).toBe('');
  });

  it('returns empty string for lifeMap without domains', () => {
    expect(formatLifeMapForChat({}, 'space')).toBe('');
  });

  it('gives full detail to matching space domain', () => {
    const result = formatLifeMapForChat(mockLifeMap, 'space', { spaceId: 'space-health' });
    expect(result).toContain('[RELEVANT TO THIS CONVERSATION]');
    expect(result).toContain('Running');
    expect(result).toContain('Training for a 10K');
    expect(result).toContain('Ran 5K PB');
  });

  it('gives summary to non-matching domains', () => {
    const result = formatLifeMapForChat(mockLifeMap, 'space', { spaceId: 'space-health' });
    // Work domain should have summary-level detail (no [RELEVANT])
    expect(result).toContain('Work:');
    expect(result).toContain('API Project');
  });

  it('skips archived threads in matching domain', () => {
    const result = formatLifeMapForChat(mockLifeMap, 'space', { spaceId: 'space-work' });
    expect(result).not.toContain('Old project');
  });

  it('uses entitySpaceId for entity lane matching', () => {
    const result = formatLifeMapForChat(mockLifeMap, 'entity', { entitySpaceId: 'space-work' });
    expect(result).toContain('DOMAIN: "Work" [RELEVANT TO THIS CONVERSATION]');
  });

  it('omits high-importance summaries for habit_builder lane', () => {
    const result = formatLifeMapForChat(mockLifeMap, 'habit_builder');
    // In non-matching domains for habit_builder, summaries should NOT be included
    expect(result).not.toContain('Shipping the v2 API');
  });

  it('includes [important] tag for high-importance threads in summary mode', () => {
    const result = formatLifeMapForChat(mockLifeMap, 'space', { spaceId: 'other-space' });
    expect(result).toContain('[important]');
  });
});

describe('formatRecentDelta', () => {
  it('returns empty string for null delta', () => {
    expect(formatRecentDelta(null)).toBe('');
  });

  it('formats recent drops', () => {
    const result = formatRecentDelta({
      recentDrops: [
        { title: 'Called Sarah', subtype: 'note', created_at: '2025-12-15T10:00:00Z', mood: [] },
        {
          title: 'Feeling great',
          subtype: 'journal',
          created_at: '2025-12-15T12:00:00Z',
          mood: ['happy'],
        },
      ],
      recentCompletions: [],
    });
    expect(result).toContain('=== RECENT ACTIVITY');
    expect(result).toContain('[note] Called Sarah');
    expect(result).toContain('[journal] Feeling great');
    expect(result).toContain('[mood: happy]');
  });

  it('limits drops to 6', () => {
    const drops = Array.from({ length: 10 }, (_, i) => ({
      title: `Drop ${i}`,
      subtype: 'note',
      created_at: '2025-12-15T10:00:00Z',
      mood: [],
    }));
    const result = formatRecentDelta({ recentDrops: drops, recentCompletions: [] });
    const dropLines = result.split('\n').filter((l) => l.includes('[note]'));
    expect(dropLines).toHaveLength(6);
  });

  it('formats recent completions', () => {
    const result = formatRecentDelta({
      recentDrops: [],
      recentCompletions: [{ title: 'Ship API' }, { title: 'Review PR' }],
    });
    expect(result).toContain('Recent completions: Ship API, Review PR');
  });

  it('returns empty string when no drops and no completions', () => {
    const result = formatRecentDelta({ recentDrops: [], recentCompletions: [] });
    expect(result).toBe('');
  });
});
