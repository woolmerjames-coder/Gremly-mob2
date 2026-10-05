/**
 * @jest-environment node
 *
 * The words: the hard checks (length, dashes, repeats), the second model when
 * the first fails, the fixed line when both do, and reminders in plain words.
 */
import {
  checkCopy,
  writeCopy,
  reminderCopy,
  fallbackCopy,
  buildPrompt,
  LIMITS,
  COPY_MODELS,
} from '../copy';

jest.mock('../../context/llm', () => ({ jsonCall: jest.fn() }));

describe('checkCopy', () => {
  it('passes a clean line', () => {
    expect(
      checkCopy({ title: 'Your Thursday', body: 'Three meetings, then a clear afternoon.' }, []),
    ).toBeNull();
  });
  it('rejects an empty body', () => {
    expect(checkCopy({ title: 'x', body: '  ' })).toBe('empty body');
  });
  it('rejects long lines', () => {
    expect(checkCopy({ title: 'x'.repeat(LIMITS.title + 1), body: 'ok' })).toMatch(/title over/);
    expect(checkCopy({ body: 'x'.repeat(LIMITS.body + 1) })).toMatch(/body over/);
  });
  it('rejects every kind of dash', () => {
    for (const body of ['A — B', 'A – B', 'A -- B'])
      expect(checkCopy({ body })).toBe('contains a dash');
    expect(checkCopy({ body: 'A well-fed Gremly' })).toBeNull();
  });
  it('rejects a repeat of a recent line, ignoring case and punctuation', () => {
    expect(checkCopy({ body: 'Your day is ready!' }, ['your day is ready.'])).toBe(
      'repeats a recent line',
    );
  });
});

describe('writeCopy', () => {
  const args = {
    moment: 'brief',
    angle: 'day_shape',
    facts: { weekday: 'Thursday' },
    recentLines: ['Old line'],
    fallbackFacts: { weekday: 'Thursday' },
  };

  it('uses the first model when its words pass', async () => {
    const call = jest.fn(async () => ({
      output: { title: 'Thursday', body: 'Two meetings, free after three.' },
    }));
    const out = await writeCopy({}, args, call);
    expect(out).toMatchObject({
      title: 'Thursday',
      body: 'Two meetings, free after three.',
      model: COPY_MODELS.primary.model,
      usedFallback: false,
      problem: null,
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('tries the second model when the first breaks a rule, and records why', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({ output: { title: '', body: 'Busy day — good luck' } })
      .mockResolvedValueOnce({ output: { title: '', body: 'Busy morning, quiet afternoon.' } });
    const out = await writeCopy({}, args, call);
    expect(out.model).toBe(COPY_MODELS.fallback.model);
    expect(out.usedFallback).toBe(false);
    expect(out.problem).toMatch(/contains a dash/);
  });

  it('sends the fixed line when both models fail', async () => {
    const call = jest.fn(async () => {
      throw new Error('503');
    });
    const out = await writeCopy({}, args, call);
    expect(out).toMatchObject({
      ...fallbackCopy('brief', { weekday: 'Thursday' }),
      model: null,
      usedFallback: true,
    });
    expect(out.problem).toMatch(/503/);
  });

  it('gives up on a model that takes too long', async () => {
    jest.useFakeTimers();
    const call = jest.fn(() => new Promise(() => {}));
    const pending = writeCopy({}, args, call);
    await jest.advanceTimersByTimeAsync(LIMITS.timeoutMs * 2 + 10);
    const out = await pending;
    jest.useRealTimers();
    expect(out.usedFallback).toBe(true);
    expect(out.problem).toMatch(/timed out/);
  });
});

describe('the fixed lines', () => {
  it('pass their own checks', () => {
    for (const m of ['brief', 'sweep', 'habit_checkin', 'nudge', 'good_news', 'return_note']) {
      expect(
        checkCopy(fallbackCopy(m, { weekday: 'Wednesday', habitTitle: 'Stretch' })),
      ).toBeNull();
      expect(checkCopy(fallbackCopy(m, { lastNote: true }))).toBeNull();
    }
  });
  it('call the evening one their wrap up, never Sweep', () => {
    const line = fallbackCopy('sweep', { weekday: 'Wednesday' });
    expect(line.title).toBe('Ready to wrap up Wednesday?');
    expect(`${line.title} ${line.body}`).not.toMatch(/sweep/i);
    expect(fallbackCopy('sweep', {}).title).toBe('Ready to wrap up?');
  });
});

describe('reminderCopy', () => {
  it('uses their words and says when', () => {
    expect(
      reminderCopy({
        itemTitle: 'Dentist',
        rule: { kind: 'before', minutes: 60 },
        startClock: '3:30pm',
      }),
    ).toEqual({ title: 'Dentist', body: 'Starts in an hour, at 3:30pm.' });
    expect(reminderCopy({ itemTitle: 'Dentist', rule: { kind: 'before', minutes: 15 } }).body).toBe(
      'Starts in 15 minutes.',
    );
    expect(
      reminderCopy({
        itemTitle: 'Dentist',
        rule: { kind: 'before', evening: true },
        startClock: '9am',
      }).body,
    ).toBe('Tomorrow at 9am.');
    expect(reminderCopy({ itemTitle: 'Call Sam', rule: { kind: 'once' } }).body).toBe(
      'You asked me to remind you about this now.',
    );
  });
  it('clips a long title', () => {
    const t = reminderCopy({
      itemTitle: 'A really very long reminder title that keeps going',
    }).title;
    expect(t.length).toBeLessThanOrEqual(LIMITS.title);
    expect(t.endsWith('…')).toBe(true);
  });
});

it('puts the moment, the angle, the facts and the recent lines in the prompt', () => {
  const { system, user } = buildPrompt({
    moment: 'sweep',
    angle: 'tiny_invite',
    facts: { waiting_in_sweep: 3 },
    recentLines: ['Earlier line'],
  });
  expect(system.fixed).toMatch(/GREMLY'S VOICE/);
  expect(user).toMatch(/WHAT THIS IS/);
  expect(user).toMatch(/ANGLE: Invite one small thing/);
  expect(user).toMatch(/"waiting_to_sort": 3/);
  expect(user).not.toMatch(/waiting_in_sweep|Sweep/);
  expect(user).toMatch(/- Earlier line/);
});
