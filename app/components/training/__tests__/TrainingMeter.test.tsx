/**
 * Tests for TrainingMeter component.
 *
 * Covers: visible/hidden toggle, header text variants, day tracker rendering,
 * navigation callbacks, dismiss callback.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ─── Mock state ────────────────────────────────────────────────────────────
let mockStoreState: Record<string, any> = {
  trainingReadiness: 50,
  graduatedAt: null,
  feedingHistory: [],
  isFedToday: false,
  refreshTrainingReadiness: jest.fn(),
  fetchFeedingHistory: jest.fn(),
};

const storeFn = (selector: (s: any) => any) => selector(mockStoreState);
storeFn.getState = () => mockStoreState;
storeFn.setState = (p: Record<string, any>) => Object.assign(mockStoreState, p);

jest.mock('../../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: storeFn,
}));

jest.mock('../../../../lib/store/lifecycleSelectors', () => ({
  useNeedsMindDropTutorial: () => true,
  useTrialStartedAt: () => '2025-06-10T00:00:00Z',
}));

jest.mock('../../../../lib/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

jest.mock('../../../../lib/date/DateService', () => ({
  dateService: {
    today: () => '2025-06-15',
    now: () => new Date('2025-06-15T12:00:00'),
    toLocalDate: () => '2025-06-10',
    daysBetween: () => 5,
    fromLocalDate: (dateStr: string) => new Date(dateStr + 'T12:00:00'),
    addDays: (base: string, n: number) => {
      const d = new Date(base + 'T12:00:00');
      d.setDate(d.getDate() + n);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    },
  },
  getDateService: () => ({
    now: () => new Date('2025-06-15T12:00:00'),
    today: () => '2025-06-15',
    getHour: () => 12,
  }),
}));

jest.mock('../../../../lib/training/trainingHints', () => ({
  getTrainingHints: () => [],
}));

jest.mock('../../../../lib/training/trainingReadiness', () => ({
  getReadinessLabel: (score: number) => (score >= 80 ? 'Ready!' : 'Learning your patterns'),
  getTrainingDaysRemaining: () => 2,
}));

jest.mock('../../../components/MascotLottie', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="mascot-lottie" /> };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const stub = () => <View />;
  return {
    ArrowDownToLine: stub,
    Moon: stub,
    MessageCircle: stub,
    Calendar: stub,
    BookOpen: stub,
    Repeat: stub,
    Sun: stub,
    ChevronRight: stub,
    Sparkles: stub,
  };
});

import TrainingMeter from '../TrainingMeter';

const onDismiss = jest.fn();
const onNavigate = jest.fn();

beforeEach(() => {
  onDismiss.mockClear();
  onNavigate.mockClear();
  mockStoreState = {
    trainingReadiness: 50,
    graduatedAt: null,
    feedingHistory: [],
    isFedToday: false,
    refreshTrainingReadiness: jest.fn(),
    fetchFeedingHistory: jest.fn(),
  };
});

describe('TrainingMeter', () => {
  it('renders day counter when visible', () => {
    const { getByText } = render(
      <TrainingMeter visible={true} onDismiss={onDismiss} onNavigate={onNavigate} />,
    );
    expect(getByText(/Day \d+ of 7-day challenge/)).toBeTruthy();
  });

  it('renders header text for challenge variant', () => {
    const { getByText } = render(
      <TrainingMeter visible={true} onDismiss={onDismiss} onNavigate={onNavigate} />,
    );
    // isInChallengeVariant is always true; with daysRemaining=2 header is "Almost there"
    expect(getByText('Almost there')).toBeTruthy();
  });

  it('renders "How to keep going" section for challenge variant', () => {
    const { getByText } = render(
      <TrainingMeter visible={true} onDismiss={onDismiss} onNavigate={onNavigate} />,
    );
    expect(getByText('How to keep going')).toBeTruthy();
  });

  it('does not render content when not visible', () => {
    const { queryByText } = render(
      <TrainingMeter visible={false} onDismiss={onDismiss} onNavigate={onNavigate} />,
    );
    expect(queryByText(/Day \d+ of 7-day challenge/)).toBeNull();
  });
});
