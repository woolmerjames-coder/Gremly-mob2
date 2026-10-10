/**
 * The moment: one timeline for a fed day and for the third day that runs on
 * into the age up. These tests drive the controller with fake timers and
 * read the phases it emits.
 */

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('../../../../lib/env', () => ({
  getEnv: jest.fn((key: string) => {
    if (key === 'EXPO_PUBLIC_CELEBRATE') return 'on';
    if (key === 'EXPO_PUBLIC_CELEBRATE_MIN_MS_BETWEEN') return '0';
    return '';
  }),
}));

jest.mock('../celebrationBus', () => ({
  subscribeToCelebrationEvents: jest.fn(() => jest.fn()),
}));

jest.mock('../../../../lib/date', () => ({
  getDateService: () => ({
    now: () => new Date('2026-01-10T12:00:00Z'),
  }),
}));

import * as Haptics from 'expo-haptics';
import celebrationController, {
  AGE_HOLD_MS,
  AGE_ONLY_BEATS,
  MOMENT_BEATS,
  type CelebrationPayload,
  type MomentPhase,
} from '../CelebrationController';
import {
  AFTER_LINE,
  CARD_CLOSE,
  CARD_FALLBACK,
  WAITING_LINE,
} from '../../../../lib/speech/momentWords';

function phasesOf(listener: jest.Mock): MomentPhase[] {
  return listener.mock.calls
    .map((c) => c[0] as CelebrationPayload)
    .filter((p) => p.kind === 'moment' && p.moment)
    .map((p) => p.moment!.phase);
}

function lastMoment(listener: jest.Mock) {
  const calls = listener.mock.calls
    .map((c) => c[0] as CelebrationPayload)
    .filter((p) => p.kind === 'moment');
  return calls[calls.length - 1]?.moment;
}

describe('the moment', () => {
  let listener: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    celebrationController.endMoment();
    listener = jest.fn();
    celebrationController.subscribe(listener);
    (Haptics.impactAsync as jest.Mock).mockClear();
    (Haptics.notificationAsync as jest.Mock).mockClear();
  });

  afterEach(() => {
    celebrationController.endMoment();
    jest.useRealTimers();
  });

  it('a fed day runs wash, text, pop, fall, tint, bubble and ends on its own', () => {
    const m = celebrationController.startMoment({ day: 1, age: 6 });
    expect(m).not.toBeNull();
    expect(m!.day).toBe(1);
    expect(m!.agesUp).toBe(false);
    expect(phasesOf(listener)).toEqual(['start']);

    jest.advanceTimersByTime(MOMENT_BEATS.wash);
    expect(phasesOf(listener)).toEqual(['start', 'wash']);
    jest.advanceTimersByTime(MOMENT_BEATS.pop - MOMENT_BEATS.wash);
    expect(phasesOf(listener)).toEqual(['start', 'wash', 'text', 'pop']);
    jest.advanceTimersByTime(MOMENT_BEATS.bubble - MOMENT_BEATS.pop + 100);
    expect(phasesOf(listener)).toEqual([
      'start',
      'wash',
      'text',
      'pop',
      'fall',
      'tint',
      'bubble',
      'end',
    ]);
    expect(celebrationController.getMoment()).toBeNull();
    // one buzz on each visible beat, nothing in between
    expect((Haptics.impactAsync as jest.Mock).mock.calls.length).toBe(3);
    expect((Haptics.notificationAsync as jest.Mock).mock.calls.length).toBe(1);
  });

  it('the third day runs on into the age up once the server has confirmed it', () => {
    const m = celebrationController.startMoment({ day: 3, age: 6 });
    expect(m!.agesUp).toBe(true);
    celebrationController.confirmAgeUp(7);
    jest.advanceTimersByTime(MOMENT_BEATS.go + 10);
    expect(phasesOf(listener)).toEqual([
      'start',
      'wash',
      'text',
      'pop',
      'charge',
      'hop',
      'merge',
      'burst',
      'land',
      'line',
      'card',
      'record',
      'dots',
      'go',
    ]);
    const last = lastMoment(listener)!;
    expect(last.nextAge).toBe(7);
    expect(last.ageLine).toBe('Seven. I feel different. I think it shows.');
    expect(last.card).toBe(CARD_FALLBACK + ' ' + CARD_CLOSE);
    // it waits for Keep going
    jest.advanceTimersByTime(60000);
    expect(celebrationController.getMoment()?.phase).toBe('go');
    celebrationController.endMoment();
    expect(lastMoment(listener)!.phase).toBe('end');
    expect(lastMoment(listener)!.bubble).toBe(AFTER_LINE);
    // the heavy thud and the chord land together
    const heavy = (Haptics.impactAsync as jest.Mock).mock.calls.filter((c) => c[0] === 'heavy');
    expect(heavy.length).toBe(1);
    expect((Haptics.notificationAsync as jest.Mock).mock.calls.length).toBe(2);
  });

  it('the third day holds at the charge, then ends as a fed day if the server is late', () => {
    celebrationController.startMoment({ day: 3, age: 6 });
    jest.advanceTimersByTime(MOMENT_BEATS.charge + AGE_HOLD_MS - 10);
    expect(phasesOf(listener)).toEqual(['start', 'wash', 'text', 'pop']);
    jest.advanceTimersByTime(500);
    expect(phasesOf(listener)).toEqual([
      'start',
      'wash',
      'text',
      'pop',
      'fall',
      'tint',
      'bubble',
      'end',
    ]);
    const ended = listener.mock.calls
      .map((c) => c[0] as CelebrationPayload)
      .filter((p) => p.kind === 'moment' && p.moment?.phase === 'bubble')[0].moment!;
    expect(ended.bubble).toBe(WAITING_LINE);
    expect(ended.agesUp).toBe(false);

    // the server speaks later: the age up plays on its own, from the charge
    listener.mockClear();
    celebrationController.confirmAgeUp(7);
    expect(lastMoment(listener)!.ageOnly).toBe(true);
    jest.advanceTimersByTime(AGE_ONLY_BEATS.go + 10);
    expect(phasesOf(listener)).toEqual([
      'start',
      'charge',
      'hop',
      'merge',
      'burst',
      'land',
      'line',
      'card',
      'record',
      'dots',
      'go',
    ]);
  });

  it('the server speaking during the hold takes the age up from the charge at once', () => {
    celebrationController.startMoment({ day: 3, age: 6 });
    jest.advanceTimersByTime(MOMENT_BEATS.charge + 500);
    expect(phasesOf(listener)).toEqual(['start', 'wash', 'text', 'pop']);
    celebrationController.confirmAgeUp(7);
    expect(lastMoment(listener)!.phase).toBe('charge');
    jest.advanceTimersByTime(MOMENT_BEATS.land - MOMENT_BEATS.charge + 10);
    expect(lastMoment(listener)!.phase).toBe('land');
  });

  it('the written line replaces the fallback on the card, in place when the card is showing', () => {
    celebrationController.startMoment({ day: 3, age: 6 });
    celebrationController.confirmAgeUp(7);
    jest.advanceTimersByTime(MOMENT_BEATS.card + 10);
    expect(lastMoment(listener)!.card).toBe(CARD_FALLBACK + ' ' + CARD_CLOSE);
    celebrationController.setCardLine(
      'The Harlow deck out the door, the dentist booked, two runs.',
    );
    expect(lastMoment(listener)!.phase).toBe('card');
    expect(lastMoment(listener)!.card).toBe(
      'The Harlow deck out the door, the dentist booked, two runs. ' + CARD_CLOSE,
    );
  });

  it('a second start while one is running is ignored', () => {
    const a = celebrationController.startMoment({ day: 1, age: 6 });
    const b = celebrationController.startMoment({ day: 2, age: 6 });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});
