/**
 * Celebration Controller
 *
 * One singleton for everything that celebrates. Two jobs:
 *
 * 1. The small celebrations (micro toasts, confetti, the mascot's drop
 *    animation) in response to events on the celebration bus, with rate
 *    limiting and batching, as before.
 *
 * 2. The moment: one timeline for a fed day and for the third fed day that
 *    runs on into the age up. The controller owns the clock, fires the
 *    haptics on the beats, and tells its hosts (the wash in the Gremly home,
 *    the moment layer at the root, the tab button, the Drop page) which phase
 *    it is in. The hosts only draw. Spec: the celebrations build plan.
 */

import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';
import { getEnv } from '../../../lib/env';
import { subscribeToCelebrationEvents, type CelebrationEvent } from './celebrationBus';
import { getDateService } from '../../../lib/date';
import {
  AFTER_LINE,
  cardText,
  getAgeLine,
  getFedBubble,
  getFedCount,
  getFedLine,
  type FedDay,
} from '../../../lib/speech/momentWords';

export type CelebrationKind = 'micro' | 'confetti' | 'mascot' | 'moment';

/** Where the moment is, in order. A fed day ends after the bubble. */
export type MomentPhase =
  | 'start'
  | 'wash'
  | 'text'
  | 'pop'
  | 'fall'
  | 'tint'
  | 'bubble'
  | 'charge'
  | 'hop'
  | 'merge'
  | 'burst'
  | 'land'
  | 'line'
  | 'card'
  | 'record'
  | 'dots'
  | 'go'
  | 'end';

export interface MomentState {
  /** Changes with every start, so hosts can tell a new moment from a replay */
  id: number;
  /** Which fed day this is toward the next age */
  day: FedDay;
  /** His age before this moment */
  age: number;
  /** His age after, once the server has confirmed it */
  nextAge: number | null;
  /** Whether this moment runs on into the age up */
  agesUp: boolean;
  /** True when the sequence starts at the age up (no fed wash first) */
  ageOnly: boolean;
  phase: MomentPhase;
  reducedMotion: boolean;
  /** The words, picked once at the start so hosts stay in step */
  line: string;
  count: string;
  bubble: string;
  ageLine: string | null;
  /** The card's full text: the written line or the fallback, with the close */
  card: string;
}

export interface CelebrationPayload {
  kind: CelebrationKind;
  message?: string;
  itemType?: 'todo' | 'note' | 'habit';
  streakCount?: number;
  /** The moment, for kind 'moment' */
  moment?: MomentState;
}

type CelebrationListener = (payload: CelebrationPayload) => void;

/** The beats of a moment, in milliseconds from the gauge crossing full. */
export const MOMENT_BEATS = {
  wash: 150,
  text: 1050,
  pop: 1100,
  // a fed day
  fall: 3300,
  tint: 3450,
  bubble: 3650,
  // the third day runs on
  charge: 3100,
  hop: 3400,
  merge: 3500,
  burst: 4000,
  land: 4600,
  line: 5100,
  card: 5600,
  record: 6100,
  dots: 6600,
  go: 7100,
} as const;

/** The age up on its own, when it comes later than the fed day: from the charge. */
export const AGE_ONLY_BEATS = {
  charge: 0,
  hop: 300,
  merge: 400,
  burst: 900,
  land: 1500,
  line: 2000,
  card: 2500,
  record: 3000,
  dots: 3500,
  go: 4000,
} as const;

/** How long the third day waits at the charge for the server before it gives up. */
export const AGE_HOLD_MS = 3000;

type Haptic = 'light' | 'medium' | 'heavy' | 'success';

class CelebrationController {
  private listeners: Set<CelebrationListener> = new Set();
  private lastCelebrationTime: number = 0;
  private lastCelebrationKind?: CelebrationKind;
  private pendingBatch: CelebrationEvent[] = [];
  private batchTimer?: NodeJS.Timeout;
  private unsubscribe?: () => void;

  private moment: MomentState | null = null;
  private momentTimers: NodeJS.Timeout[] = [];
  private momentSeq = 0;
  private holdTimer?: NodeJS.Timeout;
  private waitingForAge = false;
  private reducedMotion = false;
  /** The written card line, when it arrives before or during a moment */
  private cardLine: string | null = null;

  // Microcopy pool (rotate to avoid repetition)
  private microMessages = [
    'Saved ✓',
    'Nice move.',
    'Locked in.',
    "That'll help later.",
    'Progress noted.',
    'Good call.',
  ];
  private messageIndex = 0;

  constructor() {
    this.unsubscribe = subscribeToCelebrationEvents((event) => {
      this.handleEvent(event);
    });
    this.readReducedMotion();
  }

  private readReducedMotion(): void {
    try {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((on) => {
          this.reducedMotion = !!on;
        })
        .catch(() => undefined);
      AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
        this.reducedMotion = !!on;
      });
    } catch {
      // not available (tests): motion stays on
    }
  }

  private handleEvent(event: CelebrationEvent): void {
    const celebrateEnabled = getEnv('EXPO_PUBLIC_CELEBRATE') === 'on';
    if (!celebrateEnabled) return;

    switch (event.type) {
      case 'item_created':
        this.batchItemCreated(event);
        break;

      case 'todo_completed':
        if (event.payload.isFirstToday) {
          this.celebrate('micro', { message: 'First win today ✓' });
        } else {
          this.celebrate('micro', {});
        }
        break;

      case 'habit_checkin': {
        const streakCount = event.payload.streakCount || 0;
        const isMilestone = [3, 7, 14].includes(streakCount);

        if (isMilestone && streakCount >= 3) {
          this.celebrate('confetti', {
            message: `${streakCount} day streak! \u{1F525}`,
            streakCount,
          });
          this.celebrate('mascot', { streakCount });
        } else {
          this.celebrate('micro', {});
        }
        break;
      }

      case 'summary_refreshed':
        this.celebrate('micro', { message: 'Summary updated' });
        break;

      case 'overlay_success':
        this.celebrate('mascot', {});
        break;
    }
  }

  private batchItemCreated(event: CelebrationEvent): void {
    this.pendingBatch.push(event);

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      const count = this.pendingBatch.length;

      if (count === 1) {
        const singleEvent = this.pendingBatch[0];
        if (singleEvent.type === 'item_created') {
          this.celebrate('micro', {
            itemType: singleEvent.payload.itemType,
          });
        }
      } else if (count > 1) {
        this.celebrate('micro', {
          message: `Saved ${count} items`,
        });
      }

      this.pendingBatch = [];
      this.batchTimer = undefined;
    }, 2000);
  }

  celebrate(kind: Exclude<CelebrationKind, 'moment'>, payload: Partial<CelebrationPayload>): void {
    const minMsBetween = parseInt(getEnv('EXPO_PUBLIC_CELEBRATE_MIN_MS_BETWEEN') || '45000', 10);

    const now = getDateService().now().getTime();
    const elapsed = now - this.lastCelebrationTime;

    if (kind === 'confetti' && this.lastCelebrationKind === 'confetti' && elapsed < minMsBetween) {
      if (__DEV__) {
        console.log(`[Celebration] Rate limited: ${elapsed}ms < ${minMsBetween}ms`);
      }
      return;
    }

    const message = payload.message || this.getNextMessage();

    this.triggerHaptic(kind);

    this.lastCelebrationTime = now;
    this.lastCelebrationKind = kind;

    const fullPayload: CelebrationPayload = {
      kind,
      message,
      ...payload,
    };

    this.emit(fullPayload);

    if (__DEV__) {
      console.log('[Celebration]', kind, message);
    }
  }

  private getNextMessage(): string {
    const message = this.microMessages[this.messageIndex];
    this.messageIndex = (this.messageIndex + 1) % this.microMessages.length;
    return message;
  }

  private triggerHaptic(kind: CelebrationKind): void {
    if (kind === 'micro') this.haptic('light');
    else if (kind === 'confetti' || kind === 'mascot') this.haptic('success');
  }

  private haptic(h: Haptic): void {
    try {
      if (h === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const style =
          h === 'heavy'
            ? Haptics.ImpactFeedbackStyle.Heavy
            : h === 'medium'
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light;
        void Haptics.impactAsync(style);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[Celebration] Haptics failed:', error);
      }
    }
  }

  subscribe(listener: CelebrationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(payload: CelebrationPayload): void {
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error('[CelebrationController] Listener error:', error);
      }
    });
  }

  // ---------------------------------------------------------------------
  // The moment
  // ---------------------------------------------------------------------

  /** The moment under way, or null */
  getMoment(): MomentState | null {
    return this.moment;
  }

  /**
   * A fed day starts here, the instant the gauge crosses full on the
   * optimistic preview. Day 3 runs on into the age up once confirmAgeUp has
   * been called; it waits at the charge for at most AGE_HOLD_MS for that.
   */
  startMoment(input: { day: FedDay; age: number }): MomentState | null {
    if (this.moment && this.moment.phase !== 'end') {
      if (__DEV__) console.log('[Moment] Already running, ignoring start');
      return null;
    }
    const day = input.day;
    const state: MomentState = {
      id: ++this.momentSeq,
      day,
      age: input.age,
      nextAge: null,
      agesUp: day === 3,
      ageOnly: false,
      phase: 'start',
      reducedMotion: this.reducedMotion,
      line: getFedLine(day),
      count: getFedCount(day),
      bubble: getFedBubble(day),
      ageLine: day === 3 ? getAgeLine(input.age + 1) : null,
      card: cardText(this.cardLine),
    };
    this.moment = state;
    this.clearMomentTimers();
    this.haptic('light');
    this.emitMoment();

    const B = MOMENT_BEATS;
    this.beat(B.wash, 'wash', 'medium');
    this.beat(B.text, 'text', 'light');
    this.beat(B.pop, 'pop', 'success');
    if (day !== 3) {
      this.scheduleFedTail(B.fall, B.tint, B.bubble);
      return state;
    }
    // the third day: charge, then wait for the server if it has not spoken yet
    this.at(B.charge, () => {
      if (this.moment?.id !== state.id) return;
      if (state.nextAge !== null) {
        this.runAgeUp(state, B.charge, B);
        return;
      }
      this.waitingForAge = true;
      this.holdTimer = setTimeout(() => {
        this.holdTimer = undefined;
        if (this.moment?.id !== state.id || !this.waitingForAge) return;
        this.waitingForAge = false;
        if (__DEV__) console.log('[Moment] The age did not come back in time; ending as a fed day');
        state.agesUp = false;
        state.bubble = getFedBubble(3);
        // from now: the fall, the tint and the bubble, close together
        this.scheduleFedTail(0, 150, 350);
      }, AGE_HOLD_MS);
    });
    return state;
  }

  /**
   * The server confirmed the age. During a day 3 moment the sequence takes
   * it from here. After a moment that gave up waiting, or with no moment
   * running, the age up plays on its own from the charge.
   */
  confirmAgeUp(nextAge: number): void {
    const m = this.moment;
    if (m && m.phase !== 'end' && m.day === 3 && m.agesUp) {
      m.nextAge = nextAge;
      m.ageLine = getAgeLine(nextAge);
      if (this.waitingForAge) {
        this.waitingForAge = false;
        if (this.holdTimer) {
          clearTimeout(this.holdTimer);
          this.holdTimer = undefined;
        }
        const B = MOMENT_BEATS;
        this.runAgeUp(m, B.charge, B);
      }
      return;
    }
    if (m && m.phase !== 'end') {
      // a fed day is still playing; the age up follows once it is done
      const age = m.age;
      this.at(MOMENT_BEATS.bubble + 1200, () => this.startAgeUp({ age, nextAge }));
      return;
    }
    this.startAgeUp({ age: nextAge - 1, nextAge });
  }

  /** The age up on its own, from the charge beat, with the cover rising from the bottom. */
  startAgeUp(input: { age: number; nextAge: number }): MomentState | null {
    if (this.moment && this.moment.phase !== 'end') return null;
    const state: MomentState = {
      id: ++this.momentSeq,
      day: 3,
      age: input.age,
      nextAge: input.nextAge,
      agesUp: true,
      ageOnly: true,
      phase: 'start',
      reducedMotion: this.reducedMotion,
      line: getFedLine(3),
      count: getFedCount(3),
      bubble: AFTER_LINE,
      ageLine: getAgeLine(input.nextAge),
      card: cardText(this.cardLine),
    };
    this.moment = state;
    this.clearMomentTimers();
    this.emitMoment();
    this.runAgeUp(state, 0, AGE_ONLY_BEATS);
    return state;
  }

  /** The written card line. Replaces the fallback in place if the card is showing. */
  setCardLine(line: string | null): void {
    this.cardLine = line && line.trim() ? line.trim() : null;
    const m = this.moment;
    if (m && m.phase !== 'end') {
      m.card = cardText(this.cardLine);
      const shown: MomentPhase[] = ['card', 'record', 'dots', 'go'];
      if (shown.includes(m.phase)) this.emitMoment();
    }
  }

  /** Keep going, or the fed day's natural end. */
  endMoment(): void {
    const m = this.moment;
    if (!m || m.phase === 'end') return;
    this.clearMomentTimers();
    this.waitingForAge = false;
    if (m.agesUp && m.nextAge !== null) {
      m.bubble = AFTER_LINE;
      this.haptic('light');
      this.cardLine = null;
    }
    this.setPhase('end');
    this.moment = null;
  }

  private runAgeUp(
    state: MomentState,
    from: number,
    B: typeof MOMENT_BEATS | typeof AGE_ONLY_BEATS,
  ): void {
    const rel = (t: number) => t - from;
    this.beat(rel(B.charge), 'charge', 'light');
    this.beat(rel(B.hop), 'hop');
    this.beat(rel(B.merge), 'merge');
    this.beat(rel(B.burst), 'burst', 'light');
    this.at(rel(B.burst) + 350, () => {
      if (this.moment?.id === state.id) this.haptic('light');
    });
    this.beat(rel(B.land), 'land', 'heavy');
    this.at(rel(B.land) + 60, () => {
      if (this.moment?.id === state.id) this.haptic('success');
    });
    this.beat(rel(B.line), 'line');
    this.beat(rel(B.card), 'card');
    this.beat(rel(B.record), 'record');
    this.beat(rel(B.dots), 'dots');
    this.beat(rel(B.go), 'go');
  }

  private scheduleFedTail(fall: number, tint: number, bubble: number): void {
    this.beat(fall, 'fall');
    this.beat(tint, 'tint');
    this.beat(bubble, 'bubble');
    this.at(bubble + 50, () => {
      // the fed day is over; the hosts keep the bubble and the tint themselves
      if (this.moment && this.moment.phase === 'bubble') {
        this.setPhase('end');
        this.moment = null;
      }
    });
  }

  private beat(ms: number, phase: MomentPhase, haptic?: Haptic): void {
    const id = this.moment?.id;
    this.at(ms, () => {
      if (!this.moment || this.moment.id !== id) return;
      if (haptic) this.haptic(haptic);
      this.setPhase(phase);
    });
  }

  private at(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    this.momentTimers.push(setTimeout(fn, ms));
  }

  private setPhase(phase: MomentPhase): void {
    if (!this.moment) return;
    this.moment.phase = phase;
    this.emitMoment();
  }

  private emitMoment(): void {
    if (!this.moment) return;
    this.emit({ kind: 'moment', moment: { ...this.moment } });
    if (__DEV__) console.log('[Moment]', this.moment.phase);
  }

  private clearMomentTimers(): void {
    this.momentTimers.forEach(clearTimeout);
    this.momentTimers = [];
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = undefined;
    }
  }

  cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.clearMomentTimers();
    this.listeners.clear();
  }
}

// Global singleton
const celebrationController = new CelebrationController();

export default celebrationController;
