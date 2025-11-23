import { buildMindDropAskChips } from '../chips';
import { env } from '../../../env';

describe('buildMindDropAskChips canonical conversions', () => {
  let originalConversions: boolean;

  beforeEach(() => {
    originalConversions = env.feature.canonicalConversions;
  });

  afterEach(() => {
    (env.feature as any).canonicalConversions = originalConversions;
  });

  it('includes conversion chip when checklist text detected and flag enabled', () => {
    (env.feature as any).canonicalConversions = true;
    const chips = buildMindDropAskChips({
      text: '- [ ] Pack passport\n- [x] Charge camera',
      probable: 'log',
      confidence: 0.9,
    });

    expect(chips.some((chip) => chip.type === 'convert.log-list-to-todo')).toBe(true);
  });

  it('omits conversion chip when flag disabled', () => {
    (env.feature as any).canonicalConversions = false;
    const chips = buildMindDropAskChips({
      text: '- [ ] Pack passport\n- [x] Charge camera',
      probable: 'log',
      confidence: 0.9,
    });

    expect(chips.some((chip) => chip.type === 'convert.log-list-to-todo')).toBe(false);
  });
});

describe('buildMindDropAskChips - Smart Chip Selection', () => {
  describe('Proto-tasks (probableKind=todo, reason=proto-task)', () => {
    it('shows only To-Do and Log chips (no Habit)', () => {
      const chips = buildMindDropAskChips({
        text: 'Maybe I should email Sarah',
        probable: 'log',
        confidence: 0.6,
        probableKind: 'todo',
        chipDecision: {
          showChips: true,
          needsClarification: true,
          reason: 'proto-task',
        },
      });

      const chipTypes = chips.map((c) => c.type);
      expect(chipTypes).toContain('create.todo');
      expect(chipTypes).toContain('create.note');
      expect(chipTypes).not.toContain('create.habit');
      expect(chips.length).toBe(2);
    });

    it('shows To-Do and Log chips even with habit keywords', () => {
      const chips = buildMindDropAskChips({
        text: 'Maybe I should run every day',
        probable: 'log',
        confidence: 0.6,
        probableKind: 'todo',
        chipDecision: {
          showChips: true,
          needsClarification: true,
          reason: 'proto-task',
        },
      });

      const chipTypes = chips.map((c) => c.type);
      expect(chipTypes).toContain('create.todo');
      expect(chipTypes).toContain('create.note');
      expect(chipTypes).not.toContain('create.habit'); // Suppressed for proto-tasks
      expect(chips.length).toBe(2);
    });
  });

  describe('Simple social events (probableKind=todo, reason=simple-social-event)', () => {
    it('shows only To-Do and Log chips (no Habit)', () => {
      const chips = buildMindDropAskChips({
        text: 'Drinks with Sam on Friday',
        probable: 'log',
        confidence: 0.6,
        probableKind: 'todo',
        chipDecision: {
          showChips: true,
          needsClarification: true,
          reason: 'simple-social-event',
        },
      });

      const chipTypes = chips.map((c) => c.type);
      expect(chipTypes).toContain('create.todo');
      expect(chipTypes).toContain('create.note');
      expect(chipTypes).not.toContain('create.habit');
      expect(chips.length).toBe(2);
    });
  });

  describe('Probable habit (probableKind=habit)', () => {
    it('shows Habit and Log chips, plus To-Do if action signal present', () => {
      const chips = buildMindDropAskChips({
        text: 'Run 3 times a week starting tomorrow',
        probable: 'habit',
        confidence: 0.8,
        probableKind: 'habit',
        chipDecision: {
          showChips: true,
          needsClarification: true,
        },
      });

      const chipTypes = chips.map((c) => c.type);
      expect(chipTypes).toContain('create.habit');
      expect(chipTypes).toContain('create.note');
      expect(chipTypes).toContain('create.todo'); // Has date, so show To-Do
    });

    it('shows only Habit and Log chips when no clear action signal', () => {
      const chips = buildMindDropAskChips({
        text: 'Exercise daily',
        probable: 'habit',
        confidence: 0.8,
        probableKind: 'habit',
        chipDecision: {
          showChips: true,
          needsClarification: true,
        },
      });

      const chipTypes = chips.map((c) => c.type);
      expect(chipTypes).toContain('create.habit');
      expect(chipTypes).toContain('create.note');
      expect(chipTypes).not.toContain('create.todo'); // No action verb or date
    });
  });

  describe('Chip suppression (chipDecision.showChips=false)', () => {
    it('returns empty array when showChips=false', () => {
      const chips = buildMindDropAskChips({
        text: 'Just thinking about stuff',
        probable: 'log',
        confidence: 0.6,
        probableKind: 'log',
        chipDecision: {
          showChips: false,
          needsClarification: false,
        },
      });

      expect(chips).toEqual([]);
    });

    it('returns empty array when chipDecision suppresses chips', () => {
      const chips = buildMindDropAskChips({
        text: 'Reflective mush',
        probable: 'log',
        confidence: 0.8,
        chipDecision: {
          showChips: false,
          needsClarification: false,
          reason: 'confident-log',
        },
      });

      expect(chips).toEqual([]);
    });
  });

  describe('Default fallback (probableKind undefined or none)', () => {
    it('shows To-Do and Log chips (no Habit)', () => {
      const chips = buildMindDropAskChips({
        text: 'Some ambiguous text',
        probable: 'unknown',
        confidence: 0.5,
        probableKind: 'none',
        chipDecision: {
          showChips: true,
          needsClarification: true,
        },
      });

      const chipTypes = chips.map((c) => c.type);
      expect(chipTypes).toContain('create.todo');
      expect(chipTypes).toContain('create.note');
      expect(chipTypes).not.toContain('create.habit');
    });
  });
});
