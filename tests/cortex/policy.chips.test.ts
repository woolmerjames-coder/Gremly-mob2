jest.mock('../../lib/cortex/entities/datetime', () => ({
  parseDue: jest.fn(),
}));

jest.mock('../../lib/cortex/policy/signals', () => ({
  detectSignals: jest.fn(),
}));

import { buildMindDropAskChips } from '../../lib/cortex/policy/chips';
import { parseDue } from '../../lib/cortex/entities/datetime';
import { detectSignals } from '../../lib/cortex/policy/signals';

const parseDueMock = parseDue as jest.MockedFunction<typeof parseDue>;
const detectSignalsMock = detectSignals as jest.MockedFunction<typeof detectSignals>;

describe('buildMindDropAskChips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    parseDueMock.mockReturnValue({ iso: undefined, confidence: 0, explain: 'none' });
    detectSignalsMock.mockReturnValue({ hasActionSignal: false, hasTimeSignal: false });
  });

  test('adds due-date chip for medium confidence dates', () => {
    parseDueMock.mockReturnValue({
      iso: '2025-11-03T00:00:00.000Z',
      confidence: 0.8,
      explain: 'medium',
    });

    const chips = buildMindDropAskChips({
      userText: 'Finish by 11/03/2025',
      intent: 'ambiguous',
    });

    expect(chips.some((chip) => chip.kind === 'set_due_date')).toBe(true);
  });

  test('suggests add as task when action signals present', () => {
    detectSignalsMock.mockReturnValue({ hasActionSignal: true, hasTimeSignal: true });

    const chips = buildMindDropAskChips({
      userText: 'call dentist next week',
      intent: 'ambiguous',
    });

    expect(chips.some((chip) => chip.kind === 'add_todo')).toBe(true);
  });

  test('suggests save note when no action signals', () => {
    detectSignalsMock.mockReturnValue({ hasActionSignal: false, hasTimeSignal: false });

    const chips = buildMindDropAskChips({
      userText: 'Interesting thought about focus',
      intent: 'note',
    });

    expect(chips.some((chip) => chip.kind === 'save_note')).toBe(true);
  });
});
