/**
 * lib/subscriptions/useSubscriptionStatus.ts
 *
 * Combines RevenueCat entitlement check with local trial/challenge logic.
 * Access model (Phase 4):
 *   hasAccess = isTester OR isSubscribed OR (challengeNotComplete AND within14Days)
 */

import { useCallback, useEffect, useState } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import {
  useTrialStartedAt,
  useChallengeCompletedAt,
  useIsTester,
} from '../store/lifecycleSelectors';
import { getActiveEntitlement } from './purchases';
import { getDateService } from '../date/DateService';

const TRIAL_CEILING_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (hard cap)

interface SubscriptionStatus {
  /** RevenueCat "Gremly Pro" entitlement is active */
  isSubscribed: boolean;
  /** User is within 14 days of trial start AND challenge not yet completed */
  isTrialActive: boolean;
  /** User has access to create/chat — tester, subscribed, or within free window */
  hasAccess: boolean;
  /** User should be gated from creating new content */
  isReadOnly: boolean;
  /** Still loading initial RevenueCat check */
  isLoading: boolean;
  /** Days remaining until the 14-day ceiling kicks in (0 if past) */
  daysUntilTrialCeiling: number;
  /** Re-check entitlement */
  refresh: () => Promise<void>;
}

export function useSubscriptionStatus(): SubscriptionStatus {
  const trialStartedAt = useTrialStartedAt();
  const challengeCompletedAt = useChallengeCompletedAt();
  const isTester = useIsTester();
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

  // Compute days remaining until the 14-day ceiling
  const daysUntilTrialCeiling = (() => {
    if (!trialStartedAt) return 14;
    const started = new Date(trialStartedAt).getTime();
    const remaining = started + TRIAL_CEILING_MS - getDateService().now().getTime();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  })();

  // Trial is active if: no challenge complete AND within 14 days
  const isTrialActive = (() => {
    if (!trialStartedAt) return true; // new user, not yet started — treat as in-trial
    if (challengeCompletedAt) return false; // challenge done — trial period is over
    return daysUntilTrialCeiling > 0;
  })();

  const hasAccess = isTester || isSubscribed || isTrialActive;
  const isReadOnly = !hasAccess;

  return {
    isSubscribed,
    isTrialActive,
    hasAccess,
    isReadOnly,
    isLoading,
    daysUntilTrialCeiling,
    refresh: checkEntitlement,
  };
}

/** User has access to create and chat. Composes tester + subscription + trial state. */
export const useHasAccess = () => {
  const { hasAccess } = useSubscriptionStatus();
  return hasAccess;
};

/** User is in read-only mode — view existing content but can't create new. */
export const useIsReadOnly = () => {
  const { isReadOnly } = useSubscriptionStatus();
  return isReadOnly;
};

/** User can create new content (drops, habits, todos, notes, calendar events). */
export const useCanCreate = () => useHasAccess();

/** User can send chat messages (Ask Gremly, Space chats). */
export const useCanChat = () => useHasAccess();
