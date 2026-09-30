/**
 * The item overlay after chat or Mind Drop changed the item: the history card
 * leads, the first words keep their place under "Your original drop", and the
 * label goes once the words are rewritten.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import '../../tests/overlay/__testutils__/mockUnifiedOverlayDeps';

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    getById: jest.fn(),
    remove: jest.fn(),
    listSpaces: jest.fn(() => Promise.resolve([])),
    getAll: jest.fn(() => []),
  }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    shouldRunMindDropPrefill: false,
    suggestedTitle: null,
    suggestedTags: [],
    aiTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false, mode: 'create', record: null, spaceId: null },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const DROP = 'Dentist appointment booked for Friday at 10am';

const record = {
  id: 'n-dentist',
  type: 'note' as const,
  title: 'Dentist Appointment',
  body: DROP,
  subtype: 'event',
  origin: 'catchall',
  target_date: '2026-10-05',
  event_time: '15:00',
  created_at: '2026-09-30T09:12:00Z',
  updated_at: '2026-09-30T09:20:00Z',
  user_id: 'test-user',
  space_id: null,
  tags: [],
  views: {
    original_text: DROP,
    change_log: [
      {
        id: 'c1',
        field: 'due_day',
        from: '2026-10-02',
        to: '2026-10-05',
        was: 'Fri 2 Oct, 10:00am',
        now: 'Mon 5 Oct, 3:00pm',
        at: '2026-09-30T09:20:00Z',
        source: 'minddrop',
      },
    ],
  },
};

describe('UnifiedOverlayV2: item history', () => {
  it('leads with the change and labels the first words', () => {
    const { getByTestId, getByText } = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    expect(getByTestId('change-history')).toBeTruthy();
    expect(getByText('Moved to Mon 5 Oct, 3:00pm')).toBeTruthy();
    expect(getByTestId('original-text-label')).toBeTruthy();
    expect(getByText('Your original drop')).toBeTruthy();
    // the date row says it changed, while the change still holds
    expect(getByText('Updated')).toBeTruthy();
  });

  it('drops the label once the words are rewritten, and keeps the history', () => {
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    fireEvent.changeText(getByLabelText('Overlay content input'), 'Moved to Monday afternoon.');
    expect(queryByTestId('original-text-label')).toBeNull();
    expect(getByTestId('change-history')).toBeTruthy();
  });

  it('shows the same in view mode', () => {
    const { getByTestId } = render(
      <UnifiedOverlayV2 visible mode="view" onClose={jest.fn()} initialEntity={record} />,
    );
    expect(getByTestId('change-history')).toBeTruthy();
    expect(getByTestId('original-text-label')).toBeTruthy();
  });

  it('shows nothing extra for an item nothing has changed', () => {
    const untouched = { ...record, views: {} };
    const { queryByTestId } = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={untouched} />,
    );
    expect(queryByTestId('change-history')).toBeNull();
    expect(queryByTestId('original-text-label')).toBeNull();
  });
});
