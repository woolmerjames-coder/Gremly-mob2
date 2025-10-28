import {
  detectActionSignal,
  detectTimeSignal,
  detectSignals,
} from '../../../lib/cortex/policy/signals';

describe('signals: action', () => {
  test('detects common verbs', () => {
    expect(detectActionSignal('call mom')).toBe(true);
    expect(detectActionSignal('need to schedule a dentist')).toBe(true);
    expect(detectActionSignal('finish the report')).toBe(true);
  });

  test('ignores plain observations', () => {
    expect(detectActionSignal('The sky is blue')).toBe(false);
    expect(detectActionSignal('Notes about the project')).toBe(false);
  });
});

describe('signals: time', () => {
  test('detects relative time phrases', () => {
    expect(detectTimeSignal('buy flowers tomorrow')).toBe(true);
    expect(detectTimeSignal('finish by Friday 3pm')).toBe(true);
    expect(detectTimeSignal('meet next week')).toBe(true);
  });

  test('detects date formats', () => {
    expect(detectTimeSignal('deadline 2025-11-03')).toBe(true);
    expect(detectTimeSignal('appt 11/03/2025')).toBe(true);
    expect(detectTimeSignal('demo on Nov 3')).toBe(true);
  });

  test('ignores non-temporal text', () => {
    expect(detectTimeSignal('just brainstorming')).toBe(false);
  });
});

describe('signals: both', () => {
  test('combined helper returns both flags', () => {
    const r = detectSignals('schedule dentist tomorrow 3pm');
    expect(r.hasActionSignal).toBe(true);
    expect(r.hasTimeSignal).toBe(true);
  });
});
