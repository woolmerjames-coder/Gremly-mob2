import { decideChatToastGating } from '../../lib/chat/decideToastGating';

describe('decideChatToastGating', () => {
  test('high-confidence todo -> auto', () => {
    const r = decideChatToastGating('finish report by Friday 3pm', {
      kind: 'todo',
      confidence: 0.93,
    });
    expect(r.mode).toBe('auto');
  });

  test('mid-band habit -> ask with chips', () => {
    const r = decideChatToastGating('start running every day', {
      kind: 'habit',
      confidence: 0.78,
    });
    expect(r.mode).toBe('ask');
    expect(r.showChips).toBe(true);
  });

  test('ambiguous in mid-band -> ask disambiguate', () => {
    const r = decideChatToastGating('remember Casey works at Google', {
      kind: 'ambiguous',
      confidence: 0.75,
    });
    expect(r.mode).toBe('ask');
    expect(r.chipKind).toBe('disambiguate');
  });
});
