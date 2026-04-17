/**
 * lib/subscriptions/useSubscriptionStatus.ts
 *
 * Combines RevenueCat entitlement check with local trial logic.
 * Returns whether the user has access (subscribed or trial active).
 */

import { useCallback, useEffect, useState } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import { useTrialStartedAt } from '../store/lifecycleSelectors';
import { getActiveEntitlement } from './purchases';
import { getDateService } from '../date/DateService';

const TRIAL_DURATION_MS = 8 * 24 * 60 * 60 * 1000; // 8 days (7 challenge + 1 grace)

interface SubscriptionStatus {
  /** User has an active "Gremly Pro" entitlement */
  isSubscribed: boolean;
  /** Trial period is still active (trialStartedAt + 8 days > now) */
  isTrialActive: boolean;
  /** Trial expired and no subscription - should show paywall */
  isExpired: boolean;
  /** Still loading initial check */
  isLoading: boolean;
  /** Re-check entitlement (e.g. after purchase/restore) */
  refresh: () => Promise<void>;
}

export function useSubscriptionStatus(): SubscriptionStatus {
  const trialStartedAt = useTrialStartedAt();
  const isSubscribed = useGremlyStore((s) => s.isSubscribed);
  const setIsSubscribed = useGremlyStore((s) => s.setIsSubscribed);
  const [isLoading, setIsLoading] = useState(true);

  const checkEntitlement = useCallback(async () => {
    try {
      const active = await getActiveEntitlement();
      setIsSubscribed(active);
    } catch {
      // Keep existing state on error
    } finally {
      setIsLoading(false);
    }
  }, [setIsSubscribed]);

  useEffect(() => {
    checkEntitlement();
  }, [checkEntitlement]);

  const isTrialActive = (() => {
    if (!trialStartedAt) return true; // Not started yet, treat as in-trial
    const started = new Date(trialStartedAt).getTime();
    return getDateService().now().getTime() < started + TRIAL_DURATION_MS;
  })();

  const isExpired = !isSubscribed && !isTrialActive;

  return {
    isSubscribed,
    isTrialActive,
    isExpired,
    isLoading,
    refresh: checkEntitlement,
  };
}
