/**
 * Tests for useSubscriptionStatus access-control formula.
 *
 * Covers: tester bypass, subscription check, trial window (14-day ceiling),
 * challenge completion short-circuits trial, new user defaults, loading state.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';

// Mock supabase
jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
}));

// Mock purchases — default: no active entitlement
const mockGetActiveEntitlement = jest.fn().mockResolvedValue(false);
jest.mock('../purchases', () => ({
  getActiveEntitlement: (...args: unknown[]) => mockGetActiveEntitlement(...args),
}));

// Mock DateService
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    now: () => new Date('2026-04-15T12:00:00Z'),
    today: () => '2026-04-15',
  }),
}));

// Import store and hook
import { useGremlyStore } from '../../store/useGremlyStore';
import { useSubscriptionStatus } from '../useSubscriptionStatus';

describe('useSubscriptionStatus', () => {
  beforeEach(() => {
    mockGetActiveEntitlement.mockReset().mockResolvedValue(false);
    useGremlyStore.setState({
      trialStartedAt: null,
      challengeStartedAt: null,
      challengeCompletedAt: null,
      isTester: false,
      isSubscribed: false,
    });
  });

  it('new user (no trialStartedAt) has access', async () => {
    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTrialActive).toBe(true);
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.isReadOnly).toBe(false);
    expect(result.current.daysUntilTrialCeiling).toBe(14);
  });

  it('user within 14-day window has access', async () => {
    // Started 5 days ago
    useGremlyStore.setState({
      trialStartedAt: '2026-04-10T12:00:00Z',
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTrialActive).toBe(true);
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.isReadOnly).toBe(false);
    expect(result.current.daysUntilTrialCeiling).toBeGreaterThan(0);
  });

  it('user past 14-day ceiling loses access', async () => {
    // Started 15 days ago
    useGremlyStore.setState({
      trialStartedAt: '2026-03-31T12:00:00Z',
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTrialActive).toBe(false);
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.isReadOnly).toBe(true);
    expect(result.current.daysUntilTrialCeiling).toBe(0);
  });

  it('challenge completion short-circuits trial', async () => {
    // Still within 14 days, but challenge completed
    useGremlyStore.setState({
      trialStartedAt: '2026-04-10T12:00:00Z',
      challengeStartedAt: '2026-04-10T12:00:00Z',
      challengeCompletedAt: '2026-04-13T12:00:00Z',
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTrialActive).toBe(false);
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.isReadOnly).toBe(true);
  });

  it('isTester overrides all gates', async () => {
    // Past trial, challenge completed, no subscription — but is tester
    useGremlyStore.setState({
      trialStartedAt: '2026-03-01T00:00:00Z',
      challengeCompletedAt: '2026-03-05T00:00:00Z',
      isTester: true,
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasAccess).toBe(true);
    expect(result.current.isReadOnly).toBe(false);
  });

  it('isSubscribed overrides trial/challenge gates', async () => {
    // Past trial, challenge completed — but subscribed
    mockGetActiveEntitlement.mockResolvedValue(true);
    useGremlyStore.setState({
      trialStartedAt: '2026-03-01T00:00:00Z',
      challengeCompletedAt: '2026-03-05T00:00:00Z',
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.isReadOnly).toBe(false);
  });

  it('RevenueCat fetch failure keeps existing state', async () => {
    mockGetActiveEntitlement.mockRejectedValue(new Error('Network error'));
    useGremlyStore.setState({
      trialStartedAt: '2026-04-10T12:00:00Z',
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Trial still active — existing state preserved
    expect(result.current.hasAccess).toBe(true);
  });

  it('refresh re-checks entitlement', async () => {
    mockGetActiveEntitlement.mockResolvedValue(false);
    useGremlyStore.setState({
      trialStartedAt: '2026-03-01T00:00:00Z',
      challengeCompletedAt: '2026-03-05T00:00:00Z',
    });

    const { result } = renderHook(() => useSubscriptionStatus());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);

    // Now user subscribes
    mockGetActiveEntitlement.mockResolvedValue(true);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.hasAccess).toBe(true);
  });
});
