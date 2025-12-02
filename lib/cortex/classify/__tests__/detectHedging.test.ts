import { detectHedging, _testExports } from '../detectHedging';

describe('detectHedging', () => {
  describe('Hedging words', () => {
    it('detects "should"', () => {
      const result = detectHedging('I should call mom');
      expect(result.isHedged).toBe(true);
      expect(result.hedgingWords).toContain('should');
    });

    it('detects "maybe"', () => {
      const result = detectHedging('Maybe I will go');
      expect(result.isHedged).toBe(true);
    });

    it('detects "probably"', () => {
      const result = detectHedging('I will probably do it');
      expect(result.isHedged).toBe(true);
    });

    it('detects "might"', () => {
      const result = detectHedging('I might call later');
      expect(result.isHedged).toBe(true);
    });
  });

  describe('Hedging phrases', () => {
    it('detects "thinking about"', () => {
      const result = detectHedging('Thinking about calling mom');
      expect(result.isHedged).toBe(true);
    });

    it('detects "should probably"', () => {
      const result = detectHedging('Should probably book dentist');
      expect(result.isHedged).toBe(true);
    });

    it('detects "I would like to"', () => {
      const result = detectHedging("I'd like to start running");
      expect(result.isHedged).toBe(true);
    });
  });

  describe('Reflection patterns', () => {
    it('detects "been thinking about"', () => {
      const result = detectHedging('Been thinking about life');
      expect(result.isReflection).toBe(true);
    });

    it('detects "lately I have"', () => {
      const result = detectHedging('Lately I have been stressed');
      expect(result.isReflection).toBe(true);
    });
  });

  describe('Non-hedged inputs', () => {
    it('does not flag "Call mom"', () => {
      const result = detectHedging('Call mom');
      expect(result.isHedged).toBe(false);
    });

    it('does not flag "Buy groceries"', () => {
      const result = detectHedging('Buy groceries');
      expect(result.isHedged).toBe(false);
    });

    it('does not flag "Meditate every morning"', () => {
      const result = detectHedging('Meditate every morning');
      expect(result.isHedged).toBe(false);
    });
  });
});
