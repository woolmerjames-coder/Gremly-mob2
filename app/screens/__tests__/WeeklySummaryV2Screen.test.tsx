/**
 * Tests for app/screens/WeeklySummaryV2Screen.tsx
 *
 * Covers rendering of card types, helper functions, navigation,
 * and the empty-state fallback.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, addListener: jest.fn(() => jest.fn()) }),
  useRoute: () => ({
    params: { weekStartDate: '2025-12-15' },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView, FlatList, Image } = require('react-native');
  const forward = (Base: any) =>
    React.forwardRef((props: any, ref: any) => React.createElement(Base, { ...props, ref }));
  return {
    __esModule: true,
    default: {
      View: forward(View),
      Text: forward(Text),
      ScrollView: forward(ScrollView),
      FlatList: forward(FlatList),
      Image: forward(Image),
      createAnimatedComponent: (C: any) => C,
    },
    FadeIn: new Proxy(
      {},
      {
        get: () =>
          function self() {
            return new Proxy({}, { get: () => self });
          },
      },
    ),
    FadeInUp: new Proxy(
      {},
      {
        get: () =>
          function self() {
            return new Proxy({}, { get: () => self });
          },
      },
    ),
    FadeInDown: new Proxy(
      {},
      {
        get: () =>
          function self() {
            return new Proxy({}, { get: () => self });
          },
      },
    ),
    FadeOutLeft: new Proxy(
      {},
      {
        get: () =>
          function self() {
            return new Proxy({}, { get: () => self });
          },
      },
    ),
    Layout: new Proxy(
      {},
      {
        get: () =>
          function self() {
            return new Proxy({}, { get: () => self });
          },
      },
    ),
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => any) => fn(),
    withSpring: (v: number) => v,
  };
});

jest.mock('../../../hooks/useMindDropSubmit', () => ({
  useMindDropSubmit: () => ({
    submit: jest.fn().mockResolvedValue({ success: true, dropId: 'drop-1' }),
    isSubmitting: false,
  }),
}));

jest.mock('../../../lib/haptics', () => ({
  triggerLight: jest.fn(),
  triggerSuccess: jest.fn(),
}));

jest.mock('../../../lib/notifications/itemReminderService', () => ({
  scheduleItemReminder: jest.fn(),
}));

jest.mock('../../../design/brand', () => ({
  BRAND: {
    radius: { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 },
    shadow: { sm: {} },
    colors: { mossGreen: '#7C9A5E' },
  },
}));

jest.mock('../../../lib/date', () => ({
  getDateService: () => ({
    today: () => '2025-12-15',
    fromLocalDate: (str: string) => (str ? new Date(str + 'T00:00:00') : null),
    addDays: (dateStr: string, days: number) => {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    },
  }),
}));

jest.mock('date-fns', () => ({
  addDays: (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  },
  nextMonday: (d: Date) => {
    const r = new Date(d);
    r.setDate(r.getDate() + ((8 - r.getDay()) % 7 || 7));
    return r;
  },
  format: (_d: Date, fmt: string) => {
    if (fmt === 'MMM d') return 'Dec 22';
    return '2025-12-21';
  },
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const createIcon = (name: string) => {
    const Icon = (props: Record<string, unknown>) => React.createElement(Text, props, name);
    Icon.displayName = name;
    return Icon;
  };
  return new Proxy(
    {},
    {
      get(_target, prop) {
        return createIcon(String(prop));
      },
    },
  );
});

// ── Mock store with V2 content ─────────────────────────────────────────────

const mockV2Content = {
  cards: [
    {
      type: 'gremly_mood',
      mood_line: 'You brought the energy this week.',
      hook: 'Let us look at your week.',
      week_label: '2025-12-15 to 2025-12-21',
    },
    {
      type: 'opening',
      headline: 'A Week of Progress',
      subheadline: 'Steady momentum across all areas',
      body: 'You maintained focus across multiple projects.',
      mood: 'motivated',
      quote: 'Done is better than perfect.',
      quote_date: '2025-12-17',
      image_hint: null,
      engagement: { drops: 15, sweeps: 3, journals: 2 },
    },
    {
      type: 'thread_movements',
      title: 'Life in Motion',
      threads: [
        {
          name: 'Running',
          domain: 'Health',
          direction: 'up',
          icon_hint: 'dumbbell',
          shift_label: 'Getting consistent',
          badge_label: '3 runs',
          badge_type: 'success',
          detail: 'Three runs this week, best pace yet.',
          is_highlight: true,
        },
      ],
    },
    {
      type: 'discoveries',
      spotlight: {
        badge: 'discovery',
        title: 'Morning routine pays off',
        evidence_trail: 'Consistent 6AM starts led to higher productivity.',
        takeaway: 'Early mornings work for you.',
        research_context: null,
      },
      trends: [
        {
          icon_hint: 'trending-up',
          badge_type: 'info',
          title: 'Rising focus time',
          detail: 'Up 20% from last week.',
        },
      ],
      mini_discoveries: [{ title: 'Coffee less', detail: 'Down to 2 cups.' }],
    },
    {
      type: 'moments',
      moments: [
        {
          day_label: 'Monday',
          date: '2025-12-15',
          title: 'Launched the feature',
          body: 'Finally shipped after weeks of work.',
          quote: null,
          image_hint: null,
          thread_tags: ['Work'],
        },
      ],
    },
    {
      type: 'stale_triage',
      headline: 'Time for a cleanup',
      context: "3 items haven't been touched in 2+ weeks.",
      items: [
        {
          title: 'Old task',
          days_stale: 21,
          domain: 'Work',
          context: 'Created 3 weeks ago, untouched.',
        },
      ],
    },
    {
      type: 'week_ahead',
      intro: 'Next week has 4 events.',
      highlights: [
        {
          day_label: 'Monday',
          date: '2025-12-22',
          title: 'Sprint Planning',
          icon_hint: 'calendar',
          thread_connection: 'Work',
          prep_nudge: 'Review backlog',
          context: null,
        },
      ],
      busy_day_warnings: [{ day: 'Wednesday', detail: '3 meetings stacked' }],
    },
    {
      type: 'recommends',
      primary: {
        title: 'Try morning journaling',
        body: 'Based on your pattern of evening reflection.',
        type: 'experiment',
      },
      secondary: [
        {
          title: 'Scale back coffee',
          body: 'You noted sleep issues twice.',
          type: 'habit_idea',
        },
      ],
    },
  ],
  metadata: {
    week_type: 'productive',
    mood: 'motivated',
    key_themes: ['shipping', 'health'],
    card_count: 8,
    card_types_used: [
      'gremly_mood',
      'opening',
      'thread_movements',
      'discoveries',
      'moments',
      'stale_triage',
      'week_ahead',
      'recommends',
    ],
  },
};

const mockSummary = {
  id: 'summary-v2-1',
  user_id: 'user-1',
  week_start_date: '2025-12-15',
  week_end_date: '2025-12-21',
  generated_at: '2025-12-21T18:00:00Z',
  content: mockV2Content,
  stats_snapshot: null,
  viewed: false,
  viewed_at: null,
  completed_flow: false,
  banner_dismissed: false,
  created_at: '2025-12-21T18:00:00Z',
  updated_at: '2025-12-21T18:00:00Z',
};

jest.mock('../../../lib/store/useGremlyStore', () => {
  const markSummaryViewed = jest.fn();
  const markSummaryFlowCompleted = jest.fn().mockResolvedValue(undefined);
  const archiveTodo = jest.fn();
  const updateTodo = jest.fn();

  const storeState: Record<string, unknown> = {
    markSummaryViewed,
    markSummaryFlowCompleted,
    archiveTodo,
    updateTodo,
    todos: [],
    habits: [],
  };

  const useGremlyStore = Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
    { getState: () => storeState, __storeState: storeState },
  );

  return { useGremlyStore };
});

let mockCurrentSummary = mockSummary;

jest.mock('../../../lib/store/selectors', () => ({
  useCurrentWeekSummary: () => mockCurrentSummary,
  selectSummaryByWeek: (_state: unknown, weekStartDate: string) =>
    weekStartDate === '2025-12-15' ? mockCurrentSummary : undefined,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

import WeeklySummaryV2Screen from '../WeeklySummaryV2Screen';

describe('WeeklySummaryV2Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<WeeklySummaryV2Screen />);
    expect(toJSON()).not.toBeNull();
  });

  it('renders GremlyMoodCard mood_line text', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('You brought the energy this week.')).toBeTruthy();
  });

  it('renders OpeningCard headline', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('A Week of Progress')).toBeTruthy();
  });

  it('renders OpeningCard engagement stats', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    // Stats now render as separate value + label Text nodes
    expect(getByText('15')).toBeTruthy();
    expect(getByText('drops')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('sweeps')).toBeTruthy();
  });

  it('renders thread movements card title', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Life in motion')).toBeTruthy();
  });

  it('renders thread name from thread_movements card', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Running')).toBeTruthy();
  });

  it('renders discoveries spotlight title', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Morning routine pays off')).toBeTruthy();
  });

  it('renders moments card with moment title', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Launched the feature')).toBeTruthy();
  });

  it('renders stale triage headline', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Time for a cleanup')).toBeTruthy();
  });

  it('renders week ahead intro', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Next week has 4 events.')).toBeTruthy();
  });

  it('renders recommends primary item', () => {
    const { getByText } = render(<WeeklySummaryV2Screen />);
    expect(getByText('Try morning journaling')).toBeTruthy();
  });

  it('does not call goBack on mount', () => {
    render(<WeeklySummaryV2Screen />);
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe('WeeklySummaryV2Screen empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no cards', () => {
    // Override mock to return empty cards
    const originalSummary = mockCurrentSummary;
    mockCurrentSummary = {
      ...mockSummary,
      content: { cards: [], metadata: mockV2Content.metadata },
    };

    const { queryByText } = render(<WeeklySummaryV2Screen />);
    // Should not render any card content
    expect(queryByText('You brought the energy this week.')).toBeNull();
    // Should show some empty state indication
    expect(queryByText(/summary/i) || queryByText(/check back/i)).toBeTruthy();

    mockCurrentSummary = originalSummary;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions (formatWeekLabel, resolveIcon)
// ─────────────────────────────────────────────────────────────────────────────

describe('formatWeekLabel (via rendering)', () => {
  it('formats week_label in GremlyMoodCard', () => {
    const { getAllByText } = render(<WeeklySummaryV2Screen />);
    // Both GremlyMoodCard and OpeningCard may format the same week range
    const matches = getAllByText(/Dec 15/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
