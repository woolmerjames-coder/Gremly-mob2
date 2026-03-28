/**
 * Phase 10.9: Celebration Controller
 *
 * Singleton that manages celebration triggers with rate limiting,
 * deduplication, and intelligent mapping of events to visual feedback.
 */

import * as Haptics from 'expo-haptics';
import { getEnv } from '../../../lib/env';
import { subscribeToCelebrationEvents, type CelebrationEvent } from './celebrationBus';
import { getDateService } from '../../../lib/date';

export type CelebrationKind = 'micro' | 'confetti' | 'mascot' | 'age_up' | 'fed' | 'post_age_up';

export interface CelebrationPayload {
  kind: CelebrationKind;
  message?: string;
  itemType?: 'todo' | 'note' | 'habit';
  streakCount?: number;
  /** Age value for age_up celebrations */
  age?: number;
  /** Fed days count for fed celebration (1, 2, or 3) */
  fedDaysCount?: number;
  /** Tier name for the new age (e.g., "Guide") */
  tierName?: string;
  /** Whether this age-up crossed a tier boundary */
  isTierTransition?: boolean;
  /** Previous tier name (only set if isTierTransition is true) */
  previousTierName?: string;
}

type CelebrationListener = (payload: CelebrationPayload) => void;

class CelebrationController {
  private listeners: Set<CelebrationListener> = new Set();
  private lastCelebrationTime: number = 0;
  private lastCelebrationKind?: CelebrationKind;
  private pendingBatch: CelebrationEvent[] = [];
  private batchTimer?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private _suppressAgeUp = false;
  private _pendingAgeUp: {
    age: number;
    tierInfo?: { tierName: string; isTierTransition: boolean; previousTierName?: string };
  } | null = null;

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
    // Subscribe to celebration events
    this.unsubscribe = subscribeToCelebrationEvents((event) => {
      this.handleEvent(event);
    });
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
            message: `${streakCount} day streak! 🔥`,
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

    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Batch for 2 seconds
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

  celebrate(kind: CelebrationKind, payload: Partial<CelebrationPayload>): void {
    // Rate limiting
    const minMsBetween = parseInt(getEnv('EXPO_PUBLIC_CELEBRATE_MIN_MS_BETWEEN') || '45000', 10);

    const now = getDateService().now().getTime();
    const elapsed = now - this.lastCelebrationTime;

    // Block confetti if last celebration was confetti and within rate limit
    if (kind === 'confetti' && this.lastCelebrationKind === 'confetti' && elapsed < minMsBetween) {
      if (__DEV__) {
        console.log(`[Celebration] Rate limited: ${elapsed}ms < ${minMsBetween}ms`);
      }
      return;
    }

    // Generate message if not provided
    const message = payload.message || this.getNextMessage();

    // Trigger haptics
    this.triggerHaptic(kind);

    // Update state
    this.lastCelebrationTime = now;
    this.lastCelebrationKind = kind;

    // Emit to listeners
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
    try {
      if (kind === 'micro') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (kind === 'confetti' || kind === 'mascot') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      // Haptics might fail on some devices
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

  /**
   * Trigger age-up celebration modal for testing.
   * This does NOT modify the actual gremlyAge in the store.
   * @param age - The age to display in the modal
   */
  showAgeUpCelebration(
    age: number,
    tierInfo?: { tierName: string; isTierTransition: boolean; previousTierName?: string },
  ): void {
    if (this._suppressAgeUp) {
      this._pendingAgeUp = { age, tierInfo };
      if (__DEV__) {
        console.log('[Celebration] Age-up QUEUED (suppressed) for age:', age);
      }
      return;
    }

    this._pendingAgeUp = null;

    const payload: CelebrationPayload = {
      kind: 'age_up',
      age,
      tierName: tierInfo?.tierName,
      isTierTransition: tierInfo?.isTierTransition,
      previousTierName: tierInfo?.previousTierName,
    };

    this.emit(payload);

    if (__DEV__) {
      console.log('[Celebration] Age-up celebration triggered', {
        age,
        tierName: tierInfo?.tierName,
        isTierTransition: tierInfo?.isTierTransition,
      });
    }
  }

  suppressAgeUpCelebration(suppress: boolean): void {
    this._suppressAgeUp = suppress;
    if (__DEV__) {
      console.log('[Celebration] Age-up suppression:', suppress ? 'ON' : 'OFF');
    }

    if (!suppress && this._pendingAgeUp) {
      const { age, tierInfo } = this._pendingAgeUp;
      if (__DEV__) {
        console.log('[Celebration] Firing queued age-up for age:', age);
      }
      setTimeout(() => {
        this.showAgeUpCelebration(age, tierInfo);
      }, 400);
    }
  }

  /**
   * Trigger post age-up speech after the age-up modal is dismissed.
   * @param age - The new age value
   */
  showPostAgeUpSpeech(age: number): void {
    const payload: CelebrationPayload = {
      kind: 'post_age_up',
      age,
    };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    this.emit(payload);

    if (__DEV__) {
      console.log('[Celebration] Post age-up speech triggered for age: ' + age);
    }
  }

  /**
   * Trigger fed celebration (toast banner).
   * @param fedDaysCount - Current fed days count (1, 2, or 3) for "Day X of 3" display
   */
  showFedCelebration(fedDaysCount: number): void {
    const payload: CelebrationPayload = {
      kind: 'fed',
      fedDaysCount,
    };

    this.triggerHaptic('confetti');

    this.emit(payload);

    if (__DEV__) {
      console.log('[Celebration] Fed celebration triggered, day', fedDaysCount, 'of 3');
    }
  }

  cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.listeners.clear();
  }
}

// Global singleton
const celebrationController = new CelebrationController();

export default celebrationController;
