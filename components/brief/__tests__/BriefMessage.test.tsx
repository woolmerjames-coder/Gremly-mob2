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

describe('BriefMessage: the evening wrap up', () => {
  const offer = msg('w1', 'assistant', 'How was today?', {
    type: 'brief-offer',
    kind: 'journal',
    wrap: true,
    hint: 'A quiet line under the buttons',
    buttons: [
      { id: 'journal_write', label: 'Write a few lines', action: 'journal_write', primary: true },
      { id: 'journal_mood', label: 'Just pick a mood', action: 'journal_mood' },
      { id: 'journal_skip', label: 'Skip tonight', action: 'journal_skip' },
    ],
  });

  it('draws the wrap up cards through the screen that owns the wrap up', () => {
    const recap = msg('w2', 'system', '', { type: 'sweep-recap', wrap: true, date: '2026-09-30' });
    const renderWrap = jest.fn(() => <Text>the recap card</Text>);
    const r = render(<BriefMessage message={recap} renderWrap={renderWrap} />);
    expect(r.getByText('the recap card')).toBeTruthy();
    expect(renderWrap).toHaveBeenCalledWith(
      recap,
      expect.objectContaining({ type: 'sweep-recap' }),
    );
    // with nothing to draw it, nothing is shown
    expect(render(<BriefMessage message={recap} />).toJSON()).toBeNull();
  });

  it('shows the quiet line under a live offer, and can leave a button out', () => {
    const all = render(<BriefMessage message={offer} liveOfferId="w1" />);
    expect(all.getByText('Write a few lines')).toBeTruthy();
    expect(all.getByText('A quiet line under the buttons')).toBeTruthy();
    const armed = render(
      <BriefMessage message={offer} liveOfferId="w1" hiddenActions={['journal_write']} />,
    );
    expect(armed.queryByText('Write a few lines')).toBeNull();
    expect(armed.getByText('Just pick a mood')).toBeTruthy();
  });

  it('draws the time the evening started as a quiet line', () => {
    const time = msg('w3', 'system', '8:40 PM', { type: 'brief-event', icon: 'time', wrap: true });
    const r = render(<BriefMessage message={time} />);
    expect(r.getByTestId('brief-time')).toBeTruthy();
    expect(r.getByText('8:40 PM')).toBeTruthy();
  });

  it('never draws a receipt that a newer one replaced', () => {
    const old = msg('w4', 'system', '', { type: 'sweep-receipt', wrap: true, superseded: true });
    const r = render(<BriefMessage message={old} renderWrap={() => <Text>receipt</Text>} />);
    expect(r.toJSON()).toBeNull();
  });
});

describe("the weekly review's messages", () => {
  it("hands the review's cards and the button to their week to the screen that owns the review", () => {
    const card = msg('k1', 'system', '', {
      type: 'week-card',
      card: 'priorities',
      week_start: '2026-10-05',
      week: true,
    });
    const renderWeek = jest.fn(() => <Text>the priorities card</Text>);
    const r = render(<BriefMessage message={card} renderWeek={renderWeek} />);
    expect(r.getByText('the priorities card')).toBeTruthy();
    expect(renderWeek).toHaveBeenCalledWith(
      card,
      expect.objectContaining({ type: 'week-card', card: 'priorities' }),
    );

    const offer = msg('k2', 'system', '', { type: 'week-offer', done: false, week: true });
    const again = render(
      <BriefMessage message={offer} renderWeek={() => <Text>Plan your week</Text>} />,
    );
    expect(again.getByText('Plan your week')).toBeTruthy();
  });

  it('draws nothing for a card with nothing to show, or one a newer copy replaced', () => {
    const card = msg('k3', 'system', '', {
      type: 'week-card',
      card: 'shape',
      week_start: '2026-10-05',
      week: true,
    });
    expect(render(<BriefMessage message={card} renderWeek={() => null} />).toJSON()).toBeNull();
    expect(render(<BriefMessage message={card} />).toJSON()).toBeNull();
    const old = msg('k4', 'system', '', {
      type: 'week-card',
      card: 'shape',
      week_start: '2026-10-05',
      week: true,
      superseded: true,
    });
    const r = render(<BriefMessage message={old} renderWeek={() => <Text>shape</Text>} />);
    expect(r.toJSON()).toBeNull();
  });

  it("draws the review's own offer with its buttons, like any other offer", () => {
    const offer = msg('k5', 'assistant', 'Got ten minutes?', {
      type: 'brief-offer',
      kind: 'week_open',
      week: true,
      buttons: [
        { id: 'week_start', label: "Let's do it", action: 'week_start', primary: true },
        { id: 'week_skip', label: 'Not this week', action: 'week_skip' },
      ],
    });
    const onOfferButton = jest.fn();
    const r = render(
      <BriefMessage message={offer} liveOfferId="k5" onOfferButton={onOfferButton} />,
    );
    fireEvent.press(r.getByText("Let's do it"));
    expect(onOfferButton).toHaveBeenCalledWith(
      offer,
      expect.objectContaining({ action: 'week_start' }),
    );
  });
});
