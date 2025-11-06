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
