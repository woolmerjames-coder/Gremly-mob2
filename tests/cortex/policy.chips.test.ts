const ORIGINAL_CANONICAL_FLAG = process.env.EXPO_PUBLIC_CANONICAL_TYPES;

type BuildMindDropAskChips = typeof import('../../lib/cortex/policy/chips').buildMindDropAskChips;

const restoreCanonicalFlag = () => {
  if (ORIGINAL_CANONICAL_FLAG === undefined) {
    delete process.env.EXPO_PUBLIC_CANONICAL_TYPES;
  } else {
    process.env.EXPO_PUBLIC_CANONICAL_TYPES = ORIGINAL_CANONICAL_FLAG;
  }
};

const loadChips = (flag: 'on' | 'off'): BuildMindDropAskChips => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_CANONICAL_TYPES = flag;

  let module: { buildMindDropAskChips: BuildMindDropAskChips } | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    module = require('../../lib/cortex/policy/chips');
  });

  if (!module) {
    throw new Error('Failed to load buildMindDropAskChips');
  }

  return module.buildMindDropAskChips;
};

describe('buildMindDropAskChips (canonical flag on)', () => {
  let buildMindDropAskChips: BuildMindDropAskChips;
  const LOG_LABEL = 'Save as log';

  beforeAll(() => {
    buildMindDropAskChips = loadChips('on');
  });

  afterAll(() => {
    restoreCanonicalFlag();
    jest.resetModules();
  });

  describe('core suggestions', () => {
    it('returns empty array for blank text', () => {
      const chips = buildMindDropAskChips({ text: '   ', probable: 'unknown', confidence: 0.5 });
      expect(chips).toEqual([]);
    });

    it('includes todo suggestion for unknown probable intent', () => {
      const chips = buildMindDropAskChips({
        text: 'Book dentist appointment',
        probable: 'unknown',
        confidence: 0.42,
      });

      expect(chips.find((chip) => chip.type === 'create.todo')).toMatchObject({
        label: 'Create todo',
        payload: { name: 'Book dentist appointment', undefined_due: true, due: null },
      });
    });

    it('adds habit suggestion when cadence keywords present', () => {
      const chips = buildMindDropAskChips({
        text: 'Run 3 times a week',
        probable: 'unknown',
        confidence: 0.55,
      });

      expect(chips.find((chip) => chip.type === 'create.habit')).toMatchObject({
        payload: { name: 'Run 3 times a week', freq: 'weekly' },
      });
    });

    it('prefers list note when list keywords detected', () => {
      const chips = buildMindDropAskChips({
        text: 'Ideas for weekend trip',
        probable: 'log',
        confidence: 0.2,
      });

      expect(chips.find((chip) => chip.type === 'create.note')).toMatchObject({
        label: 'Save as list',
        payload: { subtype: 'list' },
      });
    });

    it('falls back to journal note when no list cues', () => {
      const chips = buildMindDropAskChips({
        text: 'Thought about focus and deep work',
        probable: 'log',
        confidence: 0.2,
      });

      expect(chips.find((chip) => chip.type === 'create.note')).toMatchObject({
        label: LOG_LABEL,
        payload: { subtype: 'journal' },
      });
    });

    it('deduplicates chips with identical type and label', () => {
      const chips = buildMindDropAskChips({
        text: 'Daily meditation',
        probable: 'habit',
        confidence: 0.8,
      });

      const todoChips = chips.filter((chip) => chip.type === 'create.todo');
      const habitChips = chips.filter((chip) => chip.type === 'create.habit');

      expect(todoChips.length).toBeLessThanOrEqual(1);
      expect(habitChips.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Mid-confidence chips policy', () => {
    it('offers todo + note.list for ambiguous ideas input', () => {
      const chips = buildMindDropAskChips({
        text: 'Ideas for weekend trip',
        probable: 'unknown',
        confidence: 0.6,
      });
      const labels = chips.map((c) => c.label).join('|');
      expect(labels).toMatch(/Create todo/);
      expect(labels).toMatch(/Save as list/);
    });

    it('offers habit chip when cadence present', () => {
      const chips = buildMindDropAskChips({
        text: 'Run 3 times a week',
        probable: 'habit',
        confidence: 0.7,
      });
      const hasHabit = chips.some((c) => c.type === 'create.habit' && c.payload.freq === 'weekly');
      expect(hasHabit).toBe(true);
    });

    it('produces a minimal todo payload for action-like text', () => {
      const chips = buildMindDropAskChips({
        text: 'Book dentist appointment',
        probable: 'todo',
        confidence: 0.7,
      });
      const todo = chips.find((c) => c.type === 'create.todo');
      expect(todo).toBeTruthy();
      if (todo && todo.type === 'create.todo') {
        expect(todo.payload.name).toBe('Book dentist appointment');
        expect(todo.payload.undefined_due).toBe(true);
        expect(todo.payload.due).toBeNull();
      }
    });
  });

  describe('Mid-confidence chips normalization', () => {
    it('strips leading date phrasing from todo chip name and sets due', () => {
      const chips = buildMindDropAskChips({
        text: 'For today, find best mezcal marg in CDMX',
        probable: 'todo',
        confidence: 0.7,
      });
      const todo = chips.find((c) => c.type === 'create.todo');
      expect(todo).toBeTruthy();
      if (todo && todo.type === 'create.todo') {
        expect(todo.payload.name).toBe('Find best mezcal marg in CDMX');
        expect(todo.payload.undefined_due).toBe(false);
        expect(todo.payload.due).toEqual(expect.any(String));
      }
    });

    it('removes daily phrasing from habit chip name and keeps cadence', () => {
      const chips = buildMindDropAskChips({
        text: 'Drink 2 liters of water a day',
        probable: 'habit',
        confidence: 0.8,
      });
      const habit = chips.find((c) => c.type === 'create.habit');
      expect(habit).toBeTruthy();
      if (habit && habit.type === 'create.habit') {
        expect(habit.payload.name).toBe('Drink 2 liters of water');
        expect(habit.payload.freq).toBe('daily');
      }
    });
  });

  describe('Mid-confidence chip regression guards', () => {
    it('offers todo + journal when no list cues present', () => {
      const chips = buildMindDropAskChips({
        text: 'Plan something for the team',
        probable: 'unknown',
        confidence: 0.6,
      });
      const labels = chips.map((c) => c.label);
      expect(labels).toContain('Create todo');
      expect(labels).toContain(LOG_LABEL);
    });

    it('offers weekly habit when cadence present', () => {
      const chips = buildMindDropAskChips({
        text: 'Run 3 times a week',
        probable: 'habit',
        confidence: 0.7,
      });
      const hasWeeklyHabit = chips.some(
        (c) => c.type === 'create.habit' && (c as any).payload.freq === 'weekly',
      );
      expect(hasWeeklyHabit).toBe(true);
      const labels = chips.map((c) => c.label);
      expect(labels).toContain(LOG_LABEL);
      expect(labels).not.toContain('Save as list');
    });

    it('offers list when list-like phrasing present', () => {
      const chips = buildMindDropAskChips({
        text: 'Ideas for weekend trip',
        probable: 'unknown',
        confidence: 0.65,
      });
      const labels = chips.map((c) => c.label);
      expect(labels).toContain('Save as list');
    });
  });

  describe('Mid-confidence chips policy (polish)', () => {
    it('Plan something for the team → includes Create todo and Save as Log', () => {
      const chips = buildMindDropAskChips({
        text: 'Plan something for the team',
        probable: 'unknown',
        confidence: 0.7,
      });
      const labels = chips.map((c) => c.label);
      expect(labels).toContain('Create todo');
      expect(labels).toContain(LOG_LABEL);
    });

    it('Run 3 times a week → Create habit only (no note chip)', () => {
      const chips = buildMindDropAskChips({
        text: 'Run 3 times a week',
        probable: 'habit',
        confidence: 0.7,
      });
      const labels = chips.map((c) => c.label);
      expect(labels).toContain('Create habit');
      expect(labels).toContain(LOG_LABEL);
      expect(labels).not.toContain('Save as list');
    });

    it('Ideas for weekend trip → includes Save as list', () => {
      const chips = buildMindDropAskChips({
        text: 'Ideas for weekend trip',
        probable: 'unknown',
        confidence: 0.6,
      });
      const labels = chips.map((c) => c.label);
      expect(labels).toContain('Save as list');
    });
  });
});

describe('buildMindDropAskChips (canonical flag off)', () => {
  const LEGACY_LOG_LABEL = 'Save as note';

  afterAll(() => {
    restoreCanonicalFlag();
    jest.resetModules();
  });

  it('uses legacy note label when canonical types disabled', () => {
    const buildMindDropAskChips = loadChips('off');
    const chips = buildMindDropAskChips({
      text: 'Plan something for the team',
      probable: 'unknown',
      confidence: 0.6,
    });
    const labels = chips.map((c) => c.label);
    expect(labels).toContain(LEGACY_LOG_LABEL);
    expect(labels).not.toContain('Save as log');
  });
});
