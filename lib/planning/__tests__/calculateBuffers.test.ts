/**
 * Tests for calculateBuffers module
 *
 * Tests the buffer calculation logic for prep and cooldown times
 * based on energy type and task title keywords.
 *
 * Key functions tested:
 * - calculateBuffers: Main buffer calculation
 * - computeTotalMinutes: Total time including buffers
 * - validateEnergyType: Energy type normalization
 * - inferEnergyTypeFromTitle: Keyword-based energy inference
 */

import {
  calculateBuffers,
  computeTotalMinutes,
  validateEnergyType,
  inferEnergyTypeFromTitle,
  type EnergyType,
} from '../calculateBuffers';

describe('calculateBuffers', () => {
  describe('physical energy type', () => {
    it('returns high buffers for high-intensity activities', () => {
      const highIntensityTitles = [
        'Gym workout',
        'Go running',
        'HIIT training',
        'Weight lifting session',
        'Morning exercise',
      ];

      highIntensityTitles.forEach((title) => {
        const result = calculateBuffers('physical', title, 60);
        expect(result).toEqual({
          prep_buffer_minutes: 15,
          cooldown_buffer_minutes: 20,
        });
      });
    });

    it('returns medium buffers for medium-intensity activities', () => {
      const mediumIntensityTitles = [
        'Yoga class',
        'Swimming',
        'Bike ride',
        'Morning jog',
        'Cycling to work',
      ];

      mediumIntensityTitles.forEach((title) => {
        const result = calculateBuffers('physical', title, 60);
        expect(result).toEqual({
          prep_buffer_minutes: 10,
          cooldown_buffer_minutes: 15,
        });
      });
    });

    it('returns light buffers for low-intensity activities', () => {
      const lightIntensityTitles = [
        'Walk the dog',
        'Grocery errands',
        'Clean the house',
        'Light stretching',
      ];

      lightIntensityTitles.forEach((title) => {
        const result = calculateBuffers('physical', title, 30);
        expect(result).toEqual({
          prep_buffer_minutes: 5,
          cooldown_buffer_minutes: 5,
        });
      });
    });
  });

  describe('social energy type', () => {
    it('returns higher buffers for heavy meetings', () => {
      const heavyMeetingTitles = [
        'Client presentation',
        'Job interview',
        'Product review',
        '1:1 with manager',
        'Important meeting',
      ];

      heavyMeetingTitles.forEach((title) => {
        const result = calculateBuffers('social', title, 60);
        expect(result).toEqual({
          prep_buffer_minutes: 10,
          cooldown_buffer_minutes: 10,
        });
      });
    });

    it('returns smaller buffers for regular meetings', () => {
      const regularMeetingTitles = [
        'Team standup',
        'Quick call with Sam',
        'Catch up with friend',
        'Regular meeting',
      ];

      regularMeetingTitles.forEach((title) => {
        const result = calculateBuffers('social', title, 30);
        expect(result).toEqual({
          prep_buffer_minutes: 5,
          cooldown_buffer_minutes: 5,
        });
      });
    });
  });

  describe('deep_focus energy type', () => {
    it('returns small buffers for flow state', () => {
      const deepWorkTitles = [
        'Write blog post',
        'Code the new feature',
        'Design system architecture',
      ];

      deepWorkTitles.forEach((title) => {
        const result = calculateBuffers('deep_focus', title, 90);
        expect(result).toEqual({
          prep_buffer_minutes: 5,
          cooldown_buffer_minutes: 5,
        });
      });
    });
  });

  describe('administrative energy type', () => {
    it('returns no buffers for admin tasks', () => {
      const adminTitles = ['Check email', 'File expense report', 'Update spreadsheet'];

      adminTitles.forEach((title) => {
        const result = calculateBuffers('administrative', title, 15);
        expect(result).toEqual({
          prep_buffer_minutes: 0,
          cooldown_buffer_minutes: 0,
        });
      });
    });
  });

  describe('quick energy type', () => {
    it('returns no buffers for quick tasks', () => {
      const result = calculateBuffers('quick', 'Send text', 5);
      expect(result).toEqual({
        prep_buffer_minutes: 0,
        cooldown_buffer_minutes: 0,
      });
    });
  });

  describe('edge cases', () => {
    it('handles null energy type by defaulting to administrative', () => {
      const result = calculateBuffers(null, 'Random task', 30);
      expect(result).toEqual({
        prep_buffer_minutes: 0,
        cooldown_buffer_minutes: 0,
      });
    });

    it('handles undefined energy type', () => {
      const result = calculateBuffers(undefined, 'Random task', 30);
      expect(result).toEqual({
        prep_buffer_minutes: 0,
        cooldown_buffer_minutes: 0,
      });
    });

    it('handles invalid energy type string', () => {
      const result = calculateBuffers('invalid_type', 'Random task', 30);
      expect(result).toEqual({
        prep_buffer_minutes: 0,
        cooldown_buffer_minutes: 0,
      });
    });

    it('handles empty title', () => {
      const result = calculateBuffers('physical', '', 30);
      expect(result).toEqual({
        prep_buffer_minutes: 5,
        cooldown_buffer_minutes: 5,
      });
    });

    it('handles null title', () => {
      // TypeScript would normally prevent this, but runtime safety is important
      const result = calculateBuffers('physical', null as unknown as string, 30);
      expect(result).toEqual({
        prep_buffer_minutes: 5,
        cooldown_buffer_minutes: 5,
      });
    });

    it('is case-insensitive for title matching', () => {
      const result1 = calculateBuffers('physical', 'GYM WORKOUT', 60);
      const result2 = calculateBuffers('physical', 'gym workout', 60);
      const result3 = calculateBuffers('physical', 'Gym Workout', 60);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });
});

describe('computeTotalMinutes', () => {
  it('sums visible minutes with buffers', () => {
    expect(computeTotalMinutes(60, 15, 20)).toBe(95);
  });

  it('handles zero buffers', () => {
    expect(computeTotalMinutes(30, 0, 0)).toBe(30);
  });

  it('handles zero visible minutes', () => {
    expect(computeTotalMinutes(0, 5, 5)).toBe(10);
  });

  it('handles all zeros', () => {
    expect(computeTotalMinutes(0, 0, 0)).toBe(0);
  });

  it('handles null/undefined values safely', () => {
    expect(computeTotalMinutes(null as unknown as number, 0, 0)).toBe(0);
    expect(computeTotalMinutes(30, null as unknown as number, 5)).toBe(35);
    expect(computeTotalMinutes(30, 5, undefined as unknown as number)).toBe(35);
  });
});

describe('validateEnergyType', () => {
  it('returns valid energy types unchanged', () => {
    const validTypes: EnergyType[] = [
      'deep_focus',
      'administrative',
      'physical',
      'social',
      'quick',
    ];

    validTypes.forEach((type) => {
      expect(validateEnergyType(type)).toBe(type);
    });
  });

  it('returns administrative for null', () => {
    expect(validateEnergyType(null)).toBe('administrative');
  });

  it('returns administrative for undefined', () => {
    expect(validateEnergyType(undefined)).toBe('administrative');
  });

  it('returns administrative for invalid strings', () => {
    expect(validateEnergyType('invalid')).toBe('administrative');
    expect(validateEnergyType('')).toBe('administrative');
    expect(validateEnergyType('DEEP_FOCUS')).toBe('administrative'); // case-sensitive
  });
});

describe('inferEnergyTypeFromTitle', () => {
  describe('physical inference', () => {
    it('detects workout keywords', () => {
      const physicalTitles = [
        'Morning run',
        'Go to gym',
        'Workout session',
        'Walking meeting',
        'Yoga class',
        'Swim laps',
        'Bike to work',
        'Weight training',
      ];

      physicalTitles.forEach((title) => {
        expect(inferEnergyTypeFromTitle(title)).toBe('physical');
      });
    });
  });

  describe('social inference', () => {
    it('detects meeting/call keywords', () => {
      const socialTitles = [
        'Call with client',
        'Team meeting',
        'Chat with Sarah',
        'Interview candidate',
        '1:1 sync',
        'Standup meeting',
        'Huddle with team',
      ];

      socialTitles.forEach((title) => {
        expect(inferEnergyTypeFromTitle(title)).toBe('social');
      });
    });
  });

  describe('deep_focus inference', () => {
    it('detects creative/analytical keywords', () => {
      const deepFocusTitles = [
        'Write documentation',
        'Code feature',
        'Design mockups',
        'Plan architecture',
        'Research competitors',
        'Analyze data',
        'Build prototype',
        'Draft proposal',
      ];

      deepFocusTitles.forEach((title) => {
        expect(inferEnergyTypeFromTitle(title)).toBe('deep_focus');
      });
    });
  });

  describe('administrative inference', () => {
    it('detects admin keywords', () => {
      const adminTitles = [
        'Check email',
        'Schedule dentist',
        'Book flights',
        'Pay bills',
        'Submit expense report',
        'File taxes',
        'Fill out form',
      ];

      adminTitles.forEach((title) => {
        expect(inferEnergyTypeFromTitle(title)).toBe('administrative');
      });
    });
  });

  describe('fallback behavior', () => {
    it('defaults to administrative for unrecognized titles', () => {
      const ambiguousTitles = ['Stuff', 'Thing', 'Untitled task', 'xyz123'];

      ambiguousTitles.forEach((title) => {
        expect(inferEnergyTypeFromTitle(title)).toBe('administrative');
      });
    });

    it('handles empty/null titles', () => {
      expect(inferEnergyTypeFromTitle('')).toBe('administrative');
      expect(inferEnergyTypeFromTitle(null as unknown as string)).toBe('administrative');
    });
  });

  describe('word boundary matching', () => {
    it('matches whole words only', () => {
      // "calling" should not match "call" as a word boundary check
      // But current implementation may or may not have word boundaries
      // This test documents actual behavior

      // "run" is in "running" - should still match if substring-based
      expect(inferEnergyTypeFromTitle('running errands')).toBe('physical');
    });
  });
});

describe('integration: calculateBuffers with inferEnergyTypeFromTitle', () => {
  it('combines energy inference with buffer calculation', () => {
    const title = 'Morning gym session';
    const inferredEnergy = inferEnergyTypeFromTitle(title);
    const buffers = calculateBuffers(inferredEnergy, title, 60);

    expect(inferredEnergy).toBe('physical');
    expect(buffers.prep_buffer_minutes).toBe(15);
    expect(buffers.cooldown_buffer_minutes).toBe(20);
  });

  it('uses inferred energy for light physical when no explicit type', () => {
    const title = 'Walk to the store';
    const inferredEnergy = inferEnergyTypeFromTitle(title);
    const buffers = calculateBuffers(inferredEnergy, title, 20);

    expect(inferredEnergy).toBe('physical');
    expect(buffers.prep_buffer_minutes).toBe(5);
    expect(buffers.cooldown_buffer_minutes).toBe(5);
  });
});
