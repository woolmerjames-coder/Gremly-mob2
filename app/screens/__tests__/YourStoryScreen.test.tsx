/**
 * Your story in the Worlds look (Worlds rebuild, stage 4d): a dark header
 * reached from Looking back, the story so far by Gremly, and only the parts
 * that have something in them. Dates read in words, with no dashes.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Story } from '../../../lib/story/storyApi';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: (...a: any[]) => mockGoBack(...a),
    navigate: (...a: any[]) => mockNavigate(...a),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/appEvents', () => ({ useAppEventOnFocus: () => undefined }));

jest.mock('../../../components/story/NotRightSheet', () => {
  const { Text } = require('react-native');
  return {
    NotRightLink: () => <Text>Not right?</Text>,
    NotRightSheet: () => null,
  };
});

let mockStory: Story;
let mockQuestions: unknown[] = [];
jest.mock('../../../lib/story/useStory', () => ({
  useStory: () => ({ data: mockStory, loading: false }),
  useOpenQuestions: () => ({ data: mockQuestions, loading: false }),
  useUsage: () => ({
    data: {
      period_start: '2026-01-01',
      active_days: 40,
      drops: 120,
      chat_messages: 300,
      todos_done: 55,
      habit_checkins: 80,
      journals: 9,
      sweeps: 12,
    },
    loading: false,
  }),
}));

import YourStoryScreen from '../YourStoryScreen';

const fullStory: Story = {
  header: {
    storyForThem: 'You spent the spring learning to bake bread and teaching it to a neighbour.',
    writtenAt: '2026-09-14T18:00:00Z',
  },
  items: [
    {
      id: 'm1',
      kind: 'milestone',
      pattern_kind: null,
      title: 'First loaf that rose',
      body: 'After six tries.',
      period_start: '2026-03-02',
      period_end: '2026-06-20',
      private: false,
    },
    {
      id: 'p1',
      kind: 'pattern',
      pattern_kind: 'loves',
      title: 'Early mornings',
      body: 'Most drops land before eight.',
      period_start: null,
      period_end: null,
      private: false,
    },
  ],
};

describe('YourStoryScreen', () => {
  beforeEach(() => {
    mockStory = fullStory;
    mockQuestions = [];
  });

  it('opens on a header that says where it sits and goes back', () => {
    const { getByText, getByTestId } = render(<YourStoryScreen />);
    expect(getByText('Your story')).toBeTruthy();
    expect(getByText('Looking back')).toBeTruthy();
    expect(getByText('Updated 14 Sep')).toBeTruthy();
    fireEvent.press(getByTestId('page-back'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows the story so far by Gremly and the parts that have something in them', () => {
    const { getByText, queryByText } = render(<YourStoryScreen />);
    expect(getByText('So far, by Gremly')).toBeTruthy();
    expect(getByText(fullStory.header.storyForThem!)).toBeTruthy();
    expect(getByText('Milestones')).toBeTruthy();
    expect(getByText('Mar 2026 to Jun 2026')).toBeTruthy();
    expect(getByText('Loves')).toBeTruthy();
    expect(queryByText('Proud moments')).toBeNull();
    expect(queryByText('People who matter')).toBeNull();
    expect(queryByText('How things have shifted')).toBeNull();
  });

  it('says the story is still being written when there is nothing yet', () => {
    mockStory = { header: { storyForThem: null, writtenAt: null }, items: [] };
    const { getByText, queryByText } = render(<YourStoryScreen />);
    expect(getByText(/still being written/)).toBeTruthy();
    expect(queryByText(/Updated/)).toBeNull();
  });

  it('opens what Gremly remembers from the foot of the page', () => {
    const { getByText } = render(<YourStoryScreen />);
    fireEvent.press(getByText('Edit or clear what Gremly remembers'));
    expect(mockNavigate).toHaveBeenCalledWith('WhatGremlyKnows');
  });
});
