/**
 * Type Interface Tests
 *
 * Type-level and contract tests for shared interfaces.
 * Ensures that interface changes are backward-compatible and
 * new optional fields don't break existing consumers.
 */

import type { DailyBriefInput } from '../types';

describe('DailyBriefInput interface', () => {
  describe('date field', () => {
    it('accepts date as YYYY-MM-DD string', () => {
      const input: DailyBriefInput = {
        date: '2026-02-10',
        morning_sequence: [],
        day_sequence: [],
        evening_sequence: [],
      };

      expect(input.date).toBe('2026-02-10');
    });

    it('compiles without date field (backward-compatible)', () => {
      const input: DailyBriefInput = {
        morning_sequence: [],
        day_sequence: [],
        evening_sequence: [],
      };

      expect(input.date).toBeUndefined();
    });

    it('works with minimal fields (empty object)', () => {
      const input: DailyBriefInput = {};

      expect(input.date).toBeUndefined();
      expect(input.morning_sequence).toBeUndefined();
    });

    it('works alongside all other fields', () => {
      const input: DailyBriefInput = {
        date: '2025-12-16',
        morning_sequence: [{ id: 'todo-1', type: 'todo' }],
        day_sequence: [{ id: 'habit-1', type: 'habit' }],
        evening_sequence: [],
        dismissed_habit_ids: ['habit-2'],
        completed_at: '2025-12-16T08:00:00Z',
      };

      expect(input.date).toBe('2025-12-16');
      expect(input.morning_sequence).toHaveLength(1);
      expect(input.day_sequence).toHaveLength(1);
      expect(input.dismissed_habit_ids).toEqual(['habit-2']);
      expect(input.completed_at).toBeTruthy();
    });
  });

  describe('deprecated fields still work', () => {
    it('one_thing_id and one_thing_type remain in interface', () => {
      const input: DailyBriefInput = {
        one_thing_id: 'todo-123',
        one_thing_type: 'todo',
      };

      expect(input.one_thing_id).toBe('todo-123');
      expect(input.one_thing_type).toBe('todo');
    });

    it('one_thing fields accept null', () => {
      const input: DailyBriefInput = {
        one_thing_id: null,
        one_thing_type: null,
      };

      expect(input.one_thing_id).toBeNull();
      expect(input.one_thing_type).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ItemReminder interface contract (new on app-fixes-2.24 branch)
// ═══════════════════════════════════════════════════════════════════════════════

import type { ItemReminder, Todo, Habit, Note } from '../types';

describe('ItemReminder interface', () => {
  it('compiles with required fields only', () => {
    const reminder: ItemReminder = {
      id: 'rem-1',
      time: '09:00',
      frequency: 'once',
    };

    expect(reminder.id).toBe('rem-1');
    expect(reminder.time).toBe('09:00');
    expect(reminder.frequency).toBe('once');
  });

  it('accepts optional date field for once-frequency', () => {
    const reminder: ItemReminder = {
      id: 'rem-2',
      time: '14:30',
      frequency: 'once',
      date: '2025-12-20',
    };

    expect(reminder.date).toBe('2025-12-20');
  });

  it('accepts optional notificationId field', () => {
    const reminder: ItemReminder = {
      id: 'rem-3',
      time: '09:00',
      frequency: 'daily',
      notificationId: 'expo-notif-abc123',
    };

    expect(reminder.notificationId).toBe('expo-notif-abc123');
  });

  it('frequency accepts "once" and "daily" as union values', () => {
    const once: ItemReminder = { id: '1', time: '08:00', frequency: 'once' };
    const daily: ItemReminder = { id: '2', time: '08:00', frequency: 'daily' };

    expect(once.frequency).toBe('once');
    expect(daily.frequency).toBe('daily');
  });

  it('time field uses HH:MM format', () => {
    const reminder: ItemReminder = { id: '1', time: '23:59', frequency: 'daily' };
    expect(reminder.time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('reminders field on entity types', () => {
  it('Todo type accepts reminders array', () => {
    const todo = {
      id: 'todo-1',
      type: 'todo',
      reminders: [{ id: 'r1', time: '09:00', frequency: 'once' as const, date: '2025-12-20' }],
    } as Partial<Todo>;

    expect(todo.reminders).toHaveLength(1);
  });

  it('Todo type accepts null reminders', () => {
    const todo = { id: 'todo-1', type: 'todo', reminders: null } as Partial<Todo>;
    expect(todo.reminders).toBeNull();
  });

  it('Habit type accepts reminders array', () => {
    const habit = {
      id: 'habit-1',
      type: 'habit',
      reminders: [{ id: 'r1', time: '08:00', frequency: 'daily' as const }],
    } as Partial<Habit>;

    expect(habit.reminders).toHaveLength(1);
  });

  it('Note type accepts reminders array', () => {
    const note = {
      id: 'note-1',
      type: 'note',
      reminders: [{ id: 'r1', time: '10:00', frequency: 'once' as const, date: '2025-12-25' }],
    } as Partial<Note>;

    expect(note.reminders).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Weekly Summary V2 type contracts (new on app-fixes-3.8 branch)
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  WSV2Card,
  WSV2OpeningCard,
  WSV2RecommendationCard,
  WSV2Metadata,
  WeeklySummaryV2Content,
} from '../types';

describe('WSV2Card union type', () => {
  it('discriminates on type field — gremly_mood', () => {
    const card: WSV2Card = {
      type: 'gremly_mood',
      mood_line: 'Energetic week!',
      hook: "Let's see.",
      week_label: 'Dec 15 – 21',
    };
    expect(card.type).toBe('gremly_mood');
  });

  it('discriminates on type field — opening', () => {
    const card: WSV2Card = {
      type: 'opening',
      headline: 'Great Week',
      subheadline: 'Steady progress',
      body: 'You did well.',
      mood: 'motivated',
      quote: null,
      quote_date: null,
      image_hint: null,
    };
    expect(card.type).toBe('opening');
  });

  it('discriminates on type field — thread_movements', () => {
    const card: WSV2Card = {
      type: 'thread_movements',
      title: 'Life in Motion',
      threads: [],
    };
    expect(card.type).toBe('thread_movements');
    expect(card.threads).toEqual([]);
  });

  it('discriminates on type field — discoveries', () => {
    const card: WSV2Card = {
      type: 'discoveries',
      spotlight: {
        badge: 'discovery',
        title: 'Insight',
        evidence_trail: 'Data shows...',
        takeaway: 'Keep going.',
        research_context: null,
      },
      trends: [],
    };
    expect(card.type).toBe('discoveries');
  });

  it('discriminates on type field — moments', () => {
    const card: WSV2Card = {
      type: 'moments',
      moments: [
        {
          day_label: 'Monday',
          date: '2025-12-15',
          title: 'Big day',
          body: 'Shipped it.',
          quote: null,
          image_hint: null,
          thread_tags: ['Work'],
        },
      ],
    };
    expect(card.moments).toHaveLength(1);
  });

  it('discriminates on type field — stale_triage', () => {
    const card: WSV2Card = {
      type: 'stale_triage',
      headline: 'Cleanup time',
      context: 'Old items.',
      items: [],
    };
    expect(card.type).toBe('stale_triage');
  });

  it('discriminates on type field — week_ahead', () => {
    const card: WSV2Card = {
      type: 'week_ahead',
      intro: 'Busy week coming.',
      highlights: [],
      busy_day_warnings: [],
    };
    expect(card.type).toBe('week_ahead');
  });

  it('discriminates on type field — monthly_retro', () => {
    const card: WSV2Card = {
      type: 'monthly_retro',
      month_name: 'December',
      headline: 'A great month.',
      thread_arcs: [],
    };
    expect(card.type).toBe('monthly_retro');
  });

  it('discriminates on type field — recommendation', () => {
    const card: WSV2Card = {
      type: 'recommendation',
      text: 'Try journaling.',
      action_type: 'tip',
      action_label: 'Start now',
    };
    expect(card.type).toBe('recommendation');
  });

  it('discriminates on type field — recommends', () => {
    const card: WSV2Card = {
      type: 'recommends',
      primary: { title: 'Think', body: 'About it.', type: 'thought' },
      secondary: [],
    };
    expect(card.type).toBe('recommends');
  });
});

describe('WeeklySummaryV2Content interface', () => {
  it('requires cards array and metadata', () => {
    const content: WeeklySummaryV2Content = {
      cards: [],
      metadata: {
        week_type: 'productive',
        mood: 'motivated',
        key_themes: ['shipping'],
        card_count: 0,
        card_types_used: [],
      },
    };

    expect(content.cards).toEqual([]);
    expect(content.metadata.week_type).toBe('productive');
  });

  it('metadata has all required fields', () => {
    const meta: WSV2Metadata = {
      week_type: 'balanced',
      mood: 'calm',
      key_themes: ['health', 'work'],
      card_count: 5,
      card_types_used: ['opening', 'moments'],
    };

    expect(meta.week_type).toBe('balanced');
    expect(meta.mood).toBe('calm');
    expect(meta.key_themes).toHaveLength(2);
    expect(meta.card_count).toBe(5);
    expect(meta.card_types_used).toHaveLength(2);
  });
});

describe('WSV2 optional fields', () => {
  it('WSV2OpeningCard accepts optional engagement and image_url', () => {
    const card: WSV2OpeningCard = {
      type: 'opening',
      headline: 'H',
      subheadline: 'S',
      body: 'B',
      mood: 'M',
      quote: null,
      quote_date: null,
      image_hint: null,
      engagement: { drops: 10, sweeps: 2, journals: 1 },
      image_url: 'https://example.com/img.jpg',
    };

    expect(card.engagement?.drops).toBe(10);
    expect(card.image_url).toBeTruthy();
  });

  it('WSV2RecommendationCard accepts optional prefill', () => {
    const card: WSV2RecommendationCard = {
      type: 'recommendation',
      text: 'Create a habit.',
      action_type: 'create_habit',
      action_label: 'Create',
      prefill: { name: 'Morning run', frequency: 'daily', due_day: null },
    };

    expect(card.prefill?.name).toBe('Morning run');
  });
});
