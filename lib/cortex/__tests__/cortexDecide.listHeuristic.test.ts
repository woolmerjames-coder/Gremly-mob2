import type { ChipSuggestion } from '../policy/chips';

const mockClassify = jest.fn();

jest.mock('../../../cortex/createEngine', () => ({
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

describe('cortexDecide list heuristics', () => {
  beforeEach(() => {
    mockClassify.mockReset();
    jest.resetModules();
    process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'on';
    process.env.EXPO_PUBLIC_CORTEX_MODEL = 'gpt-4o-mini';
    process.env.EXPO_PUBLIC_CORTEX_ENGINE = 'LLM';
    process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS = '1500';
    process.env.EXPO_PUBLIC_CANONICAL_TYPES = 'off';
    process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS = 'on';
  });

  it('auto-creates strong list patterns (checkboxes) as notes', async () => {
    mockClassify.mockResolvedValue({
      type: 'todo',
      title: 'Packing list',
      confidence: 0.96,
    });

    const bulletText = '- [ ] Pack passport\n- [ ] Charge camera\n- [ ] Print tickets';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: bulletText },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Strong lists (score >= 0.7) now auto-create instead of showing chips
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');

    // Heuristic metadata should be present
    expect(result.meta?.heuristics?.list?.applied).toBe(true);
    expect(result.meta?.heuristics?.list?.score).toBeGreaterThanOrEqual(0.7);
    expect(result.meta?.canonicalSubtype).toBe('list');
    expect(result.meta?.canonicalHint).toEqual(
      expect.objectContaining({ source: 'list-heuristic' }),
    );
  });

  it('surfaces idea chip and canonical hint when idea heuristic triggers', async () => {
    mockClassify.mockResolvedValue({
      type: 'todo',
      title: 'Plan analytics sprint',
      confidence: 0.88,
    });

    const ideaText = 'We could build a lightweight analytics dashboard for weekly updates.';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: ideaText },
      { userId: 'user-2', uiSurface: 'catchall', activeSpaceId: null },
    );

    expect(result.mode).toBe('auto'); // V3: idea heuristic triggers auto mode (not ask)
    // V3: In auto mode, actions are created directly (no chips/suggestions)
    const chipLabels = (result.suggestions ?? [])
      .filter((suggestion): suggestion is ChipSuggestion => typeof suggestion !== 'string')
      .map((chip) => chip.label);
    // V3 CHANGE: Auto mode doesn't show chips, it auto-creates
    expect(chipLabels).toEqual([]); // No chips in auto mode
    expect(result.meta?.heuristics?.idea?.applied).toBe(true);
    expect(result.meta?.canonicalSubtype).toBe('idea');
    expect(result.meta?.canonicalHint).toEqual(
      expect.objectContaining({ source: 'idea-heuristic' }),
    );
  });

  it('does not override high-confidence todo when idea heuristic is suppressed', async () => {
    mockClassify.mockResolvedValue({
      type: 'todo',
      title: 'Plan analytics sprint',
      confidence: 0.95,
    });

    const ideaText = 'We could launch an automation for reminders next month.';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: ideaText },
      { userId: 'user-3', uiSurface: 'catchall', activeSpaceId: null },
    );

    expect(result.mode).toBe('ask'); // V3: high-confidence todo suppressed, shows ask mode
    // V3 CHANGE: In ask mode with suppressed heuristic, no actions are auto-created
    expect(result.actions).toHaveLength(0); // No auto-actions when heuristic suppressed
    expect(result.meta?.heuristics?.idea?.triggered).toBe(true);
    expect(result.meta?.heuristics?.idea?.applied).toBe(false);
    expect(result.meta?.canonicalHint).toBeUndefined();
  });
});
