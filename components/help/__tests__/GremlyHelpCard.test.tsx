/**
 * GremlyHelpCard.test.tsx
 *
 * Tests for the GremlyHelpCard component — a modal help card with
 * swipeable pages. Page 1 shows help steps for the current screen.
 * Page 2 shows Gremly age and ritual progress (drops + sweeps).
 *
 * The card supports 8 screen types:
 * minddrop, today, organize, sweep, sweep-habits, spaces, space-detail, hub
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const makeIcon = (name: string) => {
    const Icon = (props: any) => <View testID={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    ArrowDownToLine: makeIcon('ArrowDownToLine'),
    Sparkles: makeIcon('Sparkles'),
    Moon: makeIcon('Moon'),
    CheckCircle2: makeIcon('CheckCircle2'),
    ListChecks: makeIcon('ListChecks'),
    PlusCircle: makeIcon('PlusCircle'),
    Inbox: makeIcon('Inbox'),
    ArrowRightLeft: makeIcon('ArrowRightLeft'),
    Grip: makeIcon('Grip'),
    FolderOpen: makeIcon('FolderOpen'),
    MessageCircle: makeIcon('MessageCircle'),
    Tag: makeIcon('Tag'),
    Settings: makeIcon('Settings'),
    Search: makeIcon('Search'),
    LayoutGrid: makeIcon('LayoutGrid'),
    ArrowRight: makeIcon('ArrowRight'),
    CircleDot: makeIcon('CircleDot'),
    Flame: makeIcon('Flame'),
    Flag: makeIcon('Flag'),
    CalendarCheck: makeIcon('CalendarCheck'),
    Coffee: makeIcon('Coffee'),
  };
});

// Mock the store — use a plain function (NOT jest.fn) so clearMocks won't wipe the implementation
jest.mock('../../../lib/store/useGremlyStore', () => {
  const state = {
    gremlyAge: 7,
    todayDropsCount: 2,
    todaySweepsCount: 1,
  };
  function useGremlyStore(selector: any) {
    return typeof selector === 'function' ? selector(state) : state;
  }
  useGremlyStore.getState = () => state;
  useGremlyStore.subscribe = () => () => {};
  return { useGremlyStore };
});

// Mock brand
jest.mock('../../../design/brand', () => ({
  BRAND: {
    colors: {
      mossGreen: '#2E5540',
      charcoalInk: '#0E1116',
      sageMist: '#E8F0EB',
    },
    radius: { lg: 16, md: 12 },
  },
}));

import GremlyHelpCard from '../GremlyHelpCard';

const SCREEN_TYPES = [
  'minddrop',
  'today',
  'organize',
  'sweep',
  'sweep-habits',
  'spaces',
  'space-detail',
  'hub',
] as const;

const EXPECTED_TITLES: Record<string, string> = {
  minddrop: 'Mind Drop',
  today: 'Today',
  organize: 'Organize',
  sweep: 'Evening Sweep',
  'sweep-habits': 'Habits today',
  spaces: 'Spaces',
  'space-detail': 'Inside a Space',
  hub: 'Hub',
};

describe('GremlyHelpCard', () => {
  const mockDismiss = jest.fn();

  beforeEach(() => {
    mockDismiss.mockClear();
  });

  describe('visibility', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="minddrop" />,
      );

      expect(getByText('Mind Drop')).toBeTruthy();
    });

    it('does not render content when visible is false', () => {
      const { queryByText } = render(
        <GremlyHelpCard visible={false} onDismiss={mockDismiss} screen="minddrop" />,
      );

      // Modal with visible=false should not render its children
      expect(queryByText('Mind Drop')).toBeNull();
    });
  });

  describe('screen types — all 8 render correct titles', () => {
    SCREEN_TYPES.forEach((screen) => {
      it(`renders title "${EXPECTED_TITLES[screen]}" for screen="${screen}"`, () => {
        const { getByText } = render(
          <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen={screen} />,
        );

        expect(getByText(EXPECTED_TITLES[screen])).toBeTruthy();
      });
    });
  });

  describe('help steps content', () => {
    it('renders 3 help steps for minddrop', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="minddrop" />,
      );

      expect(getByText(/Type anything/)).toBeTruthy();
      expect(getByText(/Gremly figures out/)).toBeTruthy();
      expect(getByText(/Review it all/)).toBeTruthy();
    });

    it('renders 3 help steps for sweep', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="sweep" />,
      );

      expect(getByText(/drops and open items/)).toBeTruthy();
      expect(getByText(/Swipe right to keep/)).toBeTruthy();
      expect(getByText(/Tap the buttons/)).toBeTruthy();
    });

    it('renders 3 help steps for hub', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="hub" />,
      );

      expect(getByText(/Search anything/)).toBeTruthy();
      expect(getByText(/Browse by timeline/)).toBeTruthy();
      expect(getByText(/Adjust notifications/)).toBeTruthy();
    });
  });

  describe('page 2 — ritual progress', () => {
    it('renders Gremly age on page 2', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="hub" />,
      );

      // Page 2 title uses gremlyAge from store (mocked as 7)
      expect(getByText('Gremly · Age 7')).toBeTruthy();
    });

    it('renders ritual progress dots', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="hub" />,
      );

      // Store mocked: todayDropsCount=2, todaySweepsCount=1
      expect(getByText('2/3 drops')).toBeTruthy();
      expect(getByText('1/3 sweeps')).toBeTruthy();
    });
  });

  describe('dismiss behavior', () => {
    it('calls onDismiss when "Got it" button is pressed', () => {
      const { getByText } = render(
        <GremlyHelpCard visible={true} onDismiss={mockDismiss} screen="minddrop" />,
      );

      fireEvent.press(getByText('Got it'));

      expect(mockDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
