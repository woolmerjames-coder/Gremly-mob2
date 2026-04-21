/**
 * mascotMatrix.test.ts
 *
 * Unit tests for the mascot preempt matrix, auto-return map, and helpers.
 */

import {
  canPreempt,
  isOneShot,
  AFTER_FINISH,
  MAX_DURATION_MS,
  LOOPING_MODES,
  PREEMPT_MATRIX,
} from '../../../lib/mascot/mascotMatrix';
import type { AnimationMode } from '../../../lib/types';

describe('canPreempt', () => {
  describe('looping modes are universally interruptible', () => {
    const looping: AnimationMode[] = ['idle', 'sleeping'];
    const oneShots: AnimationMode[] = ['waving', 'fallingAsleep', 'wakingUp', 'drop', 'fed'];

    for (const current of looping) {
      for (const next of oneShots) {
        it(`${current} can be preempted by ${next}`, () => {
          expect(canPreempt(current, next)).toBe(true);
        });
      }
    }
  });

  describe('one-shot modes block all transitions by default', () => {
    const blocked: AnimationMode[] = ['waving', 'wakingUp', 'drop', 'fed'];
    const attempts: AnimationMode[] = ['idle', 'waving', 'drop', 'fed', 'sleeping', 'wakingUp'];

    for (const current of blocked) {
      for (const next of attempts) {
        it(`${current} cannot be preempted by ${next}`, () => {
          expect(canPreempt(current, next)).toBe(false);
        });
      }
    }
  });

  describe('fallingAsleep exceptions', () => {
    it('fallingAsleep can be preempted by wakingUp', () => {
      expect(canPreempt('fallingAsleep', 'wakingUp')).toBe(true);
    });

    const others: AnimationMode[] = ['idle', 'sleeping', 'waving', 'drop', 'fed'];
    for (const next of others) {
      it(`fallingAsleep cannot be preempted by ${next}`, () => {
        expect(canPreempt('fallingAsleep', next)).toBe(false);
      });
    }
  });
});

describe('isOneShot', () => {
  it('idle is not a one-shot (it loops)', () => {
    expect(isOneShot('idle')).toBe(false);
  });

  it('sleeping is not a one-shot (it loops)', () => {
    expect(isOneShot('sleeping')).toBe(false);
  });

  const oneShots: AnimationMode[] = ['waving', 'fallingAsleep', 'wakingUp', 'drop', 'fed'];
  for (const mode of oneShots) {
    it(`${mode} is a one-shot`, () => {
      expect(isOneShot(mode)).toBe(true);
    });
  }
});

describe('LOOPING_MODES', () => {
  it('contains idle and sleeping', () => {
    expect(LOOPING_MODES.has('idle')).toBe(true);
    expect(LOOPING_MODES.has('sleeping')).toBe(true);
  });

  it('does not contain one-shot modes', () => {
    expect(LOOPING_MODES.has('waving')).toBe(false);
    expect(LOOPING_MODES.has('drop')).toBe(false);
  });
});

describe('AFTER_FINISH', () => {
  it('fallingAsleep returns to sleeping', () => {
    expect(AFTER_FINISH['fallingAsleep']).toBe('sleeping');
  });

  it('waving, drop, fed, wakingUp are undefined (caller defaults to idle)', () => {
    expect(AFTER_FINISH['waving']).toBeUndefined();
    expect(AFTER_FINISH['drop']).toBeUndefined();
    expect(AFTER_FINISH['fed']).toBeUndefined();
    expect(AFTER_FINISH['wakingUp']).toBeUndefined();
  });
});

describe('MAX_DURATION_MS', () => {
  it('has safety timers for all one-shot modes', () => {
    expect(MAX_DURATION_MS['waving']).toBe(5500);
    expect(MAX_DURATION_MS['fallingAsleep']).toBe(6000);
    expect(MAX_DURATION_MS['wakingUp']).toBe(6000);
    expect(MAX_DURATION_MS['drop']).toBe(1500);
    expect(MAX_DURATION_MS['fed']).toBe(2500);
  });

  it('has no safety timer for looping modes', () => {
    expect(MAX_DURATION_MS['idle']).toBeUndefined();
    expect(MAX_DURATION_MS['sleeping']).toBeUndefined();
  });
});

describe('PREEMPT_MATRIX coverage', () => {
  it('has an entry for every AnimationMode', () => {
    const allModes: AnimationMode[] = [
      'idle',
      'sleeping',
      'waving',
      'fallingAsleep',
      'wakingUp',
      'drop',
      'fed',
    ];
    for (const mode of allModes) {
      expect(PREEMPT_MATRIX).toHaveProperty(mode);
    }
  });
});
