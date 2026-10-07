import {
  cardText,
  CARD_CLOSE,
  CARD_FALLBACK,
  fedDayFor,
  getAgeLine,
  getCaption,
  getFedBubble,
  getFedCount,
  getFedLine,
  resetMomentWords,
  spellAge,
  WAITING_LINE,
} from '../momentWords';

describe('moment words', () => {
  beforeEach(() => resetMomentWords());

  it('spells the number out up to twelve and uses numerals after', () => {
    expect(spellAge(1)).toBe('One');
    expect(spellAge(7)).toBe('Seven');
    expect(spellAge(12)).toBe('Twelve');
    expect(spellAge(13)).toBe('13');
    expect(spellAge(100)).toBe('100');
  });

  it('his line follows his age without naming a band', () => {
    expect(getAgeLine(1)).toBe('Bigger.');
    expect(getAgeLine(4)).toBe('Four. I feel different.');
    expect(getAgeLine(7)).toBe('Seven. I feel different. Do I look it?');
    expect(getAgeLine(12)).toBe('Twelve. What’s next?');
    expect(getAgeLine(50)).toBe('50. You keep showing up. So do I.');
    expect(getAgeLine(600)).toBe('600. From the Sock Palace, thank you.');
    for (const age of [0, 2, 3, 9, 10, 25, 26, 41, 61, 121, 251, 501]) {
      expect(getAgeLine(age)).not.toMatch(/-|—|–/);
    }
  });

  it('the fed lines, counts and bubbles read by day and never carry a dash', () => {
    for (const day of [1, 2, 3] as const) {
      expect(getFedLine(day)).not.toMatch(/-|—|–/);
      expect(getFedCount(day)).toMatch(/of three/);
    }
    expect(getFedCount(1)).toBe('One of three. Two more and I grow.');
    expect(getFedBubble(1)).toMatch(/grow/);
    expect(getFedBubble(3)).toBe(WAITING_LINE);
  });

  it('a pool does not read the same line twice running', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(getFedLine(1));
    expect(seen.size).toBeGreaterThan(1);
    let prev = getFedLine(2);
    for (let i = 0; i < 20; i++) {
      const next = getFedLine(2);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('the card always ends the same way', () => {
    expect(cardText(null)).toBe(CARD_FALLBACK + ' ' + CARD_CLOSE);
    expect(cardText('  ')).toBe(CARD_FALLBACK + ' ' + CARD_CLOSE);
    expect(cardText('The deck out, two runs.')).toBe('The deck out, two runs. ' + CARD_CLOSE);
  });

  it('the count under the button', () => {
    expect(getCaption(0, false)).toBeNull();
    expect(getCaption(1, false)).toBe('1 of 3 fed days to the next age');
    expect(getCaption(2, false)).toBe('2 of 3 fed days to the next age');
    expect(getCaption(1, true)).toBe('Fed today · 1 of 3 to the next age');
    expect(getCaption(0, true)).toBe('Fed today · the next age in 3 fed days');
  });

  it('which fed day a crossing is', () => {
    expect(fedDayFor(0)).toBe(1);
    expect(fedDayFor(1)).toBe(2);
    expect(fedDayFor(2)).toBe(3);
    expect(fedDayFor(5)).toBe(3);
  });
});
