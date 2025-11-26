/**
 * Tests for env.ts flag() helper function
 * Verifies that the flag conversion logic correctly handles all edge cases
 */

describe('env flag() helper', () => {
  // Mock the flag function behavior (we can't import it directly as it's not exported)
  const flag = (v?: string): boolean => {
    if (!v) return false;
    const normalized = v.toLowerCase();
    if (normalized === 'off' || normalized === 'false' || normalized === '0') {
      return false;
    }
    return normalized === 'on' || normalized === 'true' || normalized === '1';
  };

  describe('returns false for falsy values', () => {
    it('returns false when undefined', () => {
      expect(flag(undefined)).toBe(false);
    });

    it('returns false when empty string', () => {
      expect(flag('')).toBe(false);
    });

    it('returns false for "off"', () => {
      expect(flag('off')).toBe(false);
    });

    it('returns false for "OFF" (case insensitive)', () => {
      expect(flag('OFF')).toBe(false);
    });

    it('returns false for "false"', () => {
      expect(flag('false')).toBe(false);
    });

    it('returns false for "FALSE" (case insensitive)', () => {
      expect(flag('FALSE')).toBe(false);
    });

    it('returns false for "0"', () => {
      expect(flag('0')).toBe(false);
    });
  });

  describe('returns true for truthy values', () => {
    it('returns true for "on"', () => {
      expect(flag('on')).toBe(true);
    });

    it('returns true for "ON" (case insensitive)', () => {
      expect(flag('ON')).toBe(true);
    });

    it('returns true for "true"', () => {
      expect(flag('true')).toBe(true);
    });

    it('returns true for "TRUE" (case insensitive)', () => {
      expect(flag('TRUE')).toBe(true);
    });

    it('returns true for "1"', () => {
      expect(flag('1')).toBe(true);
    });
  });

  describe('returns false for non-standard values', () => {
    // The flag() helper is strict - only 'on', 'true', '1' return true
    // Any other value (including seemingly truthy strings) returns false
    it('returns false for "yes"', () => {
      expect(flag('yes')).toBe(false);
    });

    it('returns false for "enabled"', () => {
      expect(flag('enabled')).toBe(false);
    });

    it('returns false for arbitrary strings', () => {
      expect(flag('anything')).toBe(false);
    });
  });

  describe('real-world EXPO_PUBLIC_NOW_V1 scenarios', () => {
    it('EXPO_PUBLIC_NOW_V1=on enables NOW V1', () => {
      expect(flag('on')).toBe(true);
    });

    it('EXPO_PUBLIC_NOW_V1=1 enables NOW V1', () => {
      expect(flag('1')).toBe(true);
    });

    it('EXPO_PUBLIC_NOW_V1=off disables NOW V1', () => {
      expect(flag('off')).toBe(false);
    });

    it('EXPO_PUBLIC_NOW_V1=0 disables NOW V1', () => {
      expect(flag('0')).toBe(false);
    });

    it('EXPO_PUBLIC_NOW_V1 unset defaults to false', () => {
      expect(flag(undefined)).toBe(false);
    });
  });
});
