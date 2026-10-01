/**
 * Every kind of brief message renders in the thread (package 1: a hand-written
 * thread of every type).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { BriefMessage } from '../BriefMessage';
import { liveOfferId } from '../../../lib/brief/messages';
import type { SpaceChatMessage } from '../../../lib/types';

function msg(
  id: string,
  role: string,
  content: string,
  meta: Record<string, unknown>,
): SpaceChatMessage {
  return {
    id,
    chat_id: 'c1',
    scope_id: null,
    user_id: 'u1',
    role: role as SpaceChatMessage['role'],
    content,
    metadata_json: meta,
    created_at: '2026-10-01T15:00:00Z',
  } as SpaceChatMessage;
}

const thread: SpaceChatMessage[] = [
  msg('t1', 'assistant', 'Morning, James. Six meetings before lunch today.', {
    type: 'brief-text',
    part: 'morning',
    ids: [],
  }),
  msg('t2', 'assistant', "After that you're clear from 1:15.", {
    type: 'brief-text',
    part: 'morning',
  }),
  msg('d1', 'system', '', { type: 'brief-day-card', date: '2026-10-01' }),
  msg('o1', 'assistant', 'Want me to fit a few things into the afternoon?', {
    type: 'brief-offer',
    kind: 'plan',
    buttons: [
      { id: 'plan', label: 'Plan my afternoon', action: 'plan', primary: true },
      { id: 'not_today', label: 'Not today', action: 'not_today' },
    ],
  }),
  msg('p1', 'system', '', {
    type: 'brief-plan',
    version: 1,
    status: 'proposal',
    date: '2026-10-01',
    items: [],
    unplaced: [],
  }),
  msg('e1', 'system', 'Swept 7 things, 3 kept for today', { type: 'brief-event', icon: 'sweep' }),
  msg('r1', 'user', 'Not today', {
    type: 'brief-reply',
    button_id: 'not_today',
    action: 'not_today',
  }),
  msg('x1', 'assistant', 'old line', { type: 'brief-text', part: 'morning', superseded: true }),
];

function renderAt(index: number, live: string | null, onOfferButton = jest.fn()) {
  return render(
    <BriefMessage
      message={thread[index]}
      prev={thread[index - 1]}
      liveOfferId={live}
      onOfferButton={onOfferButton}
      renderDayCard={(_m, meta) => <Text>Day card {meta.date}</Text>}
      renderPlan={(_m, meta) => <Text>Plan v{meta.version}</Text>}
    />,
  );
}

describe('BriefMessage', () => {
  it("draws Gremly's lines, with his name only on the first", () => {
    const first = renderAt(0, null);
    expect(first.getByText('Morning, James. Six meetings before lunch today.')).toBeTruthy();
    expect(first.queryByText('GREMLY')).toBeTruthy();
    const second = renderAt(1, null);
    expect(second.getByText("After that you're clear from 1:15.")).toBeTruthy();
    expect(second.queryByText('GREMLY')).toBeNull();
  });

  it('hands the day card and plan card to their renderers', () => {
    expect(renderAt(2, null).getByText('Day card 2026-10-01')).toBeTruthy();
    expect(renderAt(4, null).getByText('Plan v1')).toBeTruthy();
  });

  it('shows the live offer buttons and reports a tap', () => {
    const onOfferButton = jest.fn();
    const live = liveOfferId(thread.slice(0, 5));
    expect(live).toBe('o1');
    const r = renderAt(3, live, onOfferButton);
    expect(r.getByText('Want me to fit a few things into the afternoon?')).toBeTruthy();
    fireEvent.press(r.getByText('Plan my afternoon'));
    expect(onOfferButton).toHaveBeenCalledWith(
      thread[3],
      expect.objectContaining({ id: 'plan', action: 'plan' }),
    );
  });

  it("keeps an old offer's words but not its buttons", () => {
    const r = renderAt(3, null);
    expect(r.getByText('Want me to fit a few things into the afternoon?')).toBeTruthy();
    expect(r.queryByText('Plan my afternoon')).toBeNull();
  });

  it("draws event lines and the person's replies", () => {
    expect(renderAt(5, null).getByText('Swept 7 things, 3 kept for today')).toBeTruthy();
    expect(renderAt(6, null).getByText('Not today')).toBeTruthy();
  });

  it('never draws a replaced line', () => {
    expect(renderAt(7, null).toJSON()).toBeNull();
  });
});
