import { getChipsForField, type ChipConfig } from '../chipMap';

// ═══════════════════════════════════════════════════════════════════════════════
// Keyword detection in AI response
// ═══════════════════════════════════════════════════════════════════════════════

describe('getChipsForField — AI response keyword detection', () => {
  it('returns confirm chips when AI presents a confirmation card', () => {
    const result = getChipsForField(null, "Here's what I've got for your habit:");
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
    expect(result!.chips).toContain('Let me tweak something');
    expect(result!.sendsMessage).toBe(true);
  });

  it('returns confirm chips for "want to lock this in"', () => {
    const result = getChipsForField(null, 'Want to lock this in?');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
  });

  it('returns confirm chips for "sound right"', () => {
    const result = getChipsForField(null, 'Does this sound right?');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
  });

  it('returns time chips when AI asks about time of day', () => {
    const result = getChipsForField(null, 'Do you have a particular time of day in mind?');
    expect(result).not.toBeNull();
    expect(result!.chips).toEqual(['Morning', 'Evening', 'Anytime']);
    expect(result!.sendsMessage).toBe(true);
  });

  it('returns time chips for "morning or evening"', () => {
    const result = getChipsForField(null, 'Would you prefer morning or evening?');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Morning');
  });

  it('returns day chips when AI asks about specific days', () => {
    const result = getChipsForField(null, 'Which days of the week would work best?');
    expect(result).not.toBeNull();
    expect(result!.chips).toEqual(['Weekdays', 'Mon / Wed / Fri', 'Pick my own']);
    expect(result!.sendsMessage).toBe(true);
  });

  it('returns day chips for "every day or certain days"', () => {
    const result = getChipsForField(null, 'Every day or certain days of the week?');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Weekdays');
  });

  it('returns start date chips when AI asks when to start', () => {
    const result = getChipsForField(null, 'When do you want to start tracking this?');
    expect(result).not.toBeNull();
    expect(result!.chips).toEqual(['Today', 'Tomorrow', 'Next Monday']);
    expect(result!.sendsMessage).toBe(true);
  });

  it('prioritizes confirm over time keywords (confirm is checked first)', () => {
    const result = getChipsForField(null, "Here's what I've got — morning or evening preference?");
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
  });

  it('is case-insensitive for keyword matching', () => {
    const result = getChipsForField(null, "HERE'S WHAT I'VE GOT:");
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// next_field fallback
// ═══════════════════════════════════════════════════════════════════════════════

describe('getChipsForField — next_field fallback', () => {
  it('returns cadence chips', () => {
    const result = getChipsForField('cadence');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Every day');
    expect(result!.chips).toContain('A few times a week');
    expect(result!.chips).toContain('Once a week');
  });

  it('returns target chips', () => {
    const result = getChipsForField('target');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('3x per week');
  });

  it('returns start_date chips', () => {
    const result = getChipsForField('start_date');
    expect(result).not.toBeNull();
    expect(result!.chips).toEqual(['Today', 'Tomorrow', 'Next Monday']);
  });

  it('returns confirm chips', () => {
    const result = getChipsForField('confirm');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
  });

  it('returns null for "name" field (freeform input)', () => {
    expect(getChipsForField('name')).toBeNull();
  });

  it('returns null for "habit_type" field (freeform input)', () => {
    expect(getChipsForField('habit_type')).toBeNull();
  });

  it('returns null for unknown field names', () => {
    expect(getChipsForField('some_unknown_field')).toBeNull();
  });

  it('returns null when both nextField and aiResponse are absent', () => {
    expect(getChipsForField(null)).toBeNull();
    expect(getChipsForField(null, undefined)).toBeNull();
    expect(getChipsForField(null, '')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI keyword overrides next_field
// ═══════════════════════════════════════════════════════════════════════════════

describe('getChipsForField — keyword override', () => {
  it('AI confirm keyword overrides next_field=cadence', () => {
    const result = getChipsForField('cadence', "Here's what I've got:");
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Lock it in ✓');
  });

  it('AI time keyword overrides next_field=cadence', () => {
    const result = getChipsForField('cadence', 'Do you have a specific time of day in mind?');
    expect(result).not.toBeNull();
    expect(result!.chips).toContain('Morning');
  });
});
