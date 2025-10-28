import { decideGating, THRESHOLDS } from '../../../lib/cortex/policy/gating';

describe('gating policy', () => {
  test('meta-comment -> unsorted', () => {
    const r = decideGating({
      intent: 'question',
      confidence: 0.95,
      isMetaComment: true,
    });
    expect(r.mode).toBe('unsorted');
    expect(r.reason).toBe('meta_comment');
  });

  test('explicit command -> auto', () => {
    const r = decideGating({
      intent: 'todo',
      confidence: 0.2,
      isCommand: true,
    });
    expect(r.mode).toBe('auto');
    expect(r.reason).toBe('explicit_command');
  });

  test('>= auto threshold -> auto', () => {
    const r = decideGating({
      intent: 'todo',
      confidence: THRESHOLDS.auto,
    });
    expect(r.mode).toBe('auto');
    expect(r.reason).toBe('high_confidence');
  });

  test('mid band (askLow..auto) -> ask (todo)', () => {
    const r = decideGating({
      intent: 'todo',
      confidence: (THRESHOLDS.auto + THRESHOLDS.askLow) / 2,
    });
    expect(r.mode).toBe('ask');
    expect(r.showChips).toBe(true);
    expect(r.chipKind).toBe('todo');
  });

  test('mid band ambiguous -> ask disambiguate', () => {
    const r = decideGating({
      intent: 'ambiguous',
      confidence: (THRESHOLDS.auto + THRESHOLDS.askLow) / 2,
    });
    expect(r.mode).toBe('ask');
    expect(r.chipKind).toBe('disambiguate');
  });

  test('< askLow, no signals -> keep', () => {
    const r = decideGating({
      intent: 'note',
      confidence: Math.max(0, THRESHOLDS.askLow - 0.1),
    });
    expect(r.mode).toBe('keep');
    expect(r.reason).toBe('low_confidence_no_signals');
  });

  test('< askLow, with signals -> ask disambiguate', () => {
    const r = decideGating({
      intent: 'note',
      confidence: Math.max(0, THRESHOLDS.askLow - 0.2),
      hasActionSignal: true,
    });
    expect(r.mode).toBe('ask');
    expect(r.reason).toBe('low_confidence_with_signals');
    expect(r.chipKind).toBe('disambiguate');
  });
});
