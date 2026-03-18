/**
 * Tests for components/spaces/SpaceSuggestionCard.tsx
 *
 * Tests the UI structure after the app-fixes-3.8 refactor:
 * - itemBadge rendering
 * - reason text display
 * - accept/decline callbacks
 * - expand/collapse items list
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const createIcon = (name: string) => {
    const Icon = (props: Record<string, unknown>) => React.createElement(Text, props, name);
    Icon.displayName = name;
    return Icon;
  };
  return {
    Sparkles: createIcon('Sparkles'),
    X: createIcon('X'),
    ChevronDown: createIcon('ChevronDown'),
    ChevronUp: createIcon('ChevronUp'),
  };
});

jest.mock('../../../lib/store/selectors', () => ({
  useEntitiesByIds: (ids: string[]) =>
    ids.map((id) => ({
      id,
      _type: 'note' as const,
      title: `Item ${id}`,
      body: `Body for ${id}`,
    })),
}));

jest.mock('../../../ui', () => {
  const React = require('react');
  const { Text: RNText } = require('react-native');
  return {
    Text: (props: any) => React.createElement(RNText, props),
  };
});

import SpaceSuggestionCard from '../SpaceSuggestionCard';
import type { SpaceSuggestion } from '../../../lib/types';

function makeSuggestion(overrides: Partial<SpaceSuggestion> = {}): SpaceSuggestion {
  return {
    id: 'suggestion-1',
    user_id: 'user-1',
    suggestion_type: 'new_space',
    suggested_name: 'Fitness',
    reason: 'Multiple fitness-related drops detected',
    drop_ids: ['drop-1', 'drop-2', 'drop-3'],
    status: 'pending',
    created_at: '2025-12-15T00:00:00Z',
    updated_at: '2025-12-15T00:00:00Z',
    ...overrides,
  } as SpaceSuggestion;
}

describe('SpaceSuggestionCard', () => {
  const onAccept = jest.fn().mockResolvedValue(undefined);
  const onDecline = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('renders the suggested space name in quotes', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(getByText('"Fitness"')).toBeTruthy();
  });

  it('renders item badge with correct count text', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(getByText('3 items')).toBeTruthy();
  });

  it('renders "1 item" for single drop', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion({ drop_ids: ['drop-1'] })}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(getByText('1 item')).toBeTruthy();
  });

  it('renders the reason text', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(getByText('Multiple fitness-related drops detected')).toBeTruthy();
  });

  it('does not render reason text when reason is null', () => {
    const { queryByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion({ reason: null } as any)}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(queryByText('Multiple fitness-related drops detected')).toBeNull();
  });

  it('calls onDecline when dismiss button is pressed', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    // The X icon renders "X" text via mock
    fireEvent.press(getByText('X'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('calls onAccept when Create Space button is pressed', async () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    fireEvent.press(getByText('Create Space'));
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it('shows "View items" button', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(getByText('View items')).toBeTruthy();
  });

  it('renders "Suggested Space" header text', () => {
    const { getByText } = render(
      <SpaceSuggestionCard
        suggestion={makeSuggestion()}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(getByText('Suggested Space')).toBeTruthy();
  });
});
