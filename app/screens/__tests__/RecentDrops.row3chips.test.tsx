/**
 * The third line of a Mind Drop card: an event says its day and time once,
 * and a journal without moods shows its tags, so no card has an empty line.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Row3Chips } from '../RecentDrops';
import { formatDateForChip } from '../../../lib/minddrop/cardHelpers';
import type { UnifiedDrop } from '../../../types/UnifiedDrop';

const base = {
  id: 'n1',
  kind: 'note' as const,
  title: 'Something',
  text: 'Something',
  created_at: '2026-09-30T09:00:00Z',
  tags: [],
  views: { minddrop_stage: 'enriched' },
} as unknown as UnifiedDrop;

const chips = (item: Partial<UnifiedDrop>) =>
  render(<Row3Chips item={{ ...base, ...item } as UnifiedDrop} effectiveKind="note" styles={{}} />);

describe('Row3Chips', () => {
  it('shows an event day once, with its time', () => {
    const day = '2031-10-06';
    const { getByText, queryByText } = chips({
      noteSubtype: 'event',
      target_date: day,
      event_time: '15:00',
    });
    expect(getByText(`${formatDateForChip(day)}, 3PM`)).toBeTruthy();
    // the plain day chip that repeated it is gone
    expect(queryByText(formatDateForChip(day))).toBeNull();
  });

  it('reads the time from views when that is where the drop keeps it', () => {
    const day = '2031-10-06';
    const { getByText } = chips({
      noteSubtype: 'event',
      target_date: day,
      views: { minddrop_stage: 'enriched', event_time: '09:30' },
    });
    expect(getByText(`${formatDateForChip(day)}, 9:30AM`)).toBeTruthy();
  });

  it('fills a journal without moods with its tags', () => {
    const { getByText } = chips({ noteSubtype: 'journal', tags: ['hiking', 'outdoors'] });
    expect(getByText('#hiking')).toBeTruthy();
    expect(getByText('#outdoors')).toBeTruthy();
  });

  it('shows a journal its moods when it has them', () => {
    const { getByText, queryByText } = chips({
      noteSubtype: 'journal',
      tags: ['hiking'],
      mood: ['calm'] as UnifiedDrop['mood'],
    });
    expect(getByText('Calm')).toBeTruthy();
    expect(queryByText('#hiking')).toBeNull();
  });

  it('shows an idea its tags', () => {
    const { getByText } = chips({ noteSubtype: 'idea', tags: ['app'] });
    expect(getByText('#app')).toBeTruthy();
  });
});
