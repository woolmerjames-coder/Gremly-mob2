import {
  briefMetaOf,
  dayPartAt,
  followsGremly,
  isBriefMessage,
  liveOfferId,
  liveQuestion,
  planOfferToBringBack,
  visibleThreadMessages,
} from '../messages';
import type { SpaceChatMessage } from '../../types';

function msg(id: string, role: string, meta: Record<string, unknown> | null): SpaceChatMessage {
  return {
    id,
    chat_id: 'c1',
    scope_id: null,
    user_id: 'u1',
    role: role as SpaceChatMessage['role'],
    content: id,
    metadata_json: meta,
    created_at: '2026-10-01T15:00:00Z',
  } as SpaceChatMessage;
}

describe('brief messages', () => {
  it('knows a brief message by its metadata type', () => {
    expect(isBriefMessage(msg('a', 'assistant', { type: 'brief-text', part: 'morning' }))).toBe(
      true,
    );
    expect(isBriefMessage(msg('b', 'system', { type: 'entity-card' }))).toBe(false);
    expect(isBriefMessage(msg('c', 'assistant', null))).toBe(false);
    expect(briefMetaOf(msg('d', 'system', { type: 'brief-plan', version: 1 }))?.type).toBe(
      'brief-plan',
    );
  });

  it('never shows lines a rewrite replaced', () => {
    const list = [
      msg('old', 'assistant', { type: 'brief-text', part: 'morning', superseded: true }),
      msg('new', 'assistant', { type: 'brief-text', part: 'afternoon' }),
      msg('chat', 'user', null),
    ];
    expect(visibleThreadMessages(list).map((m) => m.id)).toEqual(['new', 'chat']);
  });

  it('keeps only the newest unanswered offer live', () => {
    const offer = (id: string, chosen?: object) =>
      msg(id, 'assistant', {
        type: 'brief-offer',
        kind: 'plan',
        buttons: [],
        chosen: chosen ?? null,
      });
    expect(
      liveOfferId([offer('o1'), msg('t', 'assistant', { type: 'brief-text' }), offer('o2')]),
    ).toBe('o2');
    // a tap or a typed message after the offer ends it
    expect(liveOfferId([offer('o1'), msg('u', 'user', { type: 'brief-reply' })])).toBeNull();
    expect(liveOfferId([offer('o1', { id: 'plan', at: 'x' })])).toBeNull();
    // a plan card after the offer does not end it
    expect(liveOfferId([offer('o1'), msg('p', 'system', { type: 'brief-plan' })])).toBe('o1');
  });

  it('shows the GREMLY mark once for a run of his lines', () => {
    expect(followsGremly(undefined)).toBe(false);
    expect(followsGremly(msg('a', 'assistant', { type: 'brief-text' }))).toBe(true);
    expect(followsGremly(msg('b', 'system', { type: 'brief-day-card' }))).toBe(true);
    expect(followsGremly(msg('c', 'user', { type: 'brief-reply' }))).toBe(false);
    expect(followsGremly(msg('d', 'system', { type: 'brief-event' }))).toBe(false);
    expect(followsGremly(msg('e', 'user', null))).toBe(false);
    // a card of the weekly review can end with their own answer: his next line is marked
    expect(
      followsGremly(msg('f', 'system', { type: 'week-card', card: 'priorities', week: true })),
    ).toBe(false);
    expect(followsGremly(msg('g', 'system', { type: 'week-offer', done: false }))).toBe(false);
  });

  it('splits the day into morning, afternoon and evening', () => {
    expect(dayPartAt(7)).toBe('morning');
    expect(dayPartAt(11)).toBe('morning');
    expect(dayPartAt(12)).toBe('afternoon');
    expect(dayPartAt(16)).toBe('afternoon');
    expect(dayPartAt(17)).toBe('evening');
  });
});

describe("Gremly's question in the thread", () => {
  const question = (wrap: boolean) =>
    msg('q', 'assistant', {
      type: 'brief-offer',
      kind: 'question',
      question_id: 'q1',
      buttons: [],
      ...(wrap ? { wrap: true } : {}),
    });

  it('is the live question when it is the last thing said', () => {
    expect(liveQuestion([question(false)])?.id).toBe('q');
  });

  it('is left to the wrap up when it was asked there', () => {
    // a message typed under it after the X is an ordinary one, not its answer
    expect(liveQuestion([question(true)])).toBeNull();
  });

  it('knows the wrap up cards as thread messages', () => {
    for (const type of [
      'sweep-recap',
      'sweep-receipt',
      'sweep-habits',
      'sweep-journal',
      'sweep-item',
      'sweep-end',
    ]) {
      expect(isBriefMessage(msg(type, 'system', { type }))).toBe(true);
    }
  });
});

describe('the plan offer that comes back', () => {
  const PLAN = {
    type: 'brief-offer',
    kind: 'plan',
    brief_id: 'b1',
    review_offer: true,
    buttons: [
      { id: 'plan', label: 'Plan my day', action: 'plan', primary: true },
      { id: 'not_today', label: 'Not today', action: 'not_today' },
    ],
  };
  const weekChosen = { ...PLAN, chosen: { id: 'plan_week', at: 'now' } };
  // the weekly review as it sits in the thread once it is over
  const review = [
    msg('tap', 'user', { type: 'brief-reply', button_id: 'plan_week', action: 'plan_week' }),
    msg('open', 'assistant', {
      type: 'brief-offer',
      kind: 'week',
      week: true,
      chosen: { id: 'week_start', at: 'now' },
      buttons: [{ id: 'week_start', label: 'Start', action: 'week_start' }],
    }),
    msg('go', 'user', { type: 'brief-reply', button_id: 'week_start', week: true }),
    msg('done', 'system', {
      type: 'week-card',
      card: 'done',
      week_start: '2026-10-05',
      week: true,
    }),
    msg('line', 'assistant', { type: 'brief-text', part: 'morning', ids: [], week: true }),
  ];

  it('is back to back or with some space too, when a message was typed past it', () => {
    // what they picked rides on the question: it must not be lost to a typed message
    const SPACING = {
      type: 'brief-offer',
      kind: 'plan_spacing',
      plan_day: '2026-10-05',
      picks: [{ id: 'oat', title: 'Buy Oat Milk' }],
      buttons: [
        { id: 'plan_tight', label: 'Back to back', action: 'plan_spacing', value: 'tight' },
        { id: 'plan_spaced', label: 'With some space', action: 'plan_spacing', value: 'spaced' },
      ],
    };
    const thread = [
      msg('ask', 'assistant', SPACING),
      msg('typed', 'user', null),
      msg('reply', 'assistant', null),
    ];
    expect(planOfferToBringBack(thread)?.id).toBe('ask');
    // not while it is still the live question, once answered, or a second time
    expect(planOfferToBringBack([thread[0]])).toBeNull();
    expect(
      planOfferToBringBack([
        msg('ask', 'assistant', { ...SPACING, chosen: { id: 'plan_tight', at: 'now' } }),
        ...thread.slice(1),
      ]),
    ).toBeNull();
    expect(
      planOfferToBringBack([
        msg('ask', 'assistant', { ...SPACING, brought_back_from: 'first' }),
        ...thread.slice(1),
      ]),
    ).toBeNull();
  });

  it('is the plan offer once the weekly review they chose on it has ended', () => {
    const thread = [msg('offer', 'assistant', weekChosen), ...review];
    expect(planOfferToBringBack(thread, true)?.id).toBe('offer');
  });

  it('stays away while that review is still opening: a turn in the thread is not its end', () => {
    // Plan my week tapped, the read still being made, and they type something
    const thread = [
      msg('offer', 'assistant', weekChosen),
      review[0],
      msg('typed', 'user', null),
      msg('reply', 'assistant', null),
    ];
    expect(planOfferToBringBack(thread)).toBeNull();
  });

  it('is the plan offer when the review was opened from somewhere else', () => {
    const thread = [msg('offer', 'assistant', PLAN), ...review.slice(1)];
    expect(planOfferToBringBack(thread, true)?.id).toBe('offer');
    // but not on a turn while that review is opening or under way: the review's own offer is in the way
    const opening = [
      ...thread.slice(0, 3),
      msg('typed', 'user', null),
      msg('reply', 'assistant', null),
    ];
    expect(planOfferToBringBack(opening)).toBeNull();
  });

  it('comes back after the review on an offer that was itself brought back', () => {
    const back = { ...weekChosen, brought_back_from: 'first' };
    const thread = [
      msg('first', 'assistant', PLAN),
      msg('u', 'user', null),
      msg('offer', 'assistant', back),
      ...review,
    ];
    expect(planOfferToBringBack(thread, true)?.id).toBe('offer');
  });

  it('stays away after any other answer, a plan, or the wrap up', () => {
    const no = { ...PLAN, chosen: { id: 'not_today', at: 'now' } };
    expect(planOfferToBringBack([msg('offer', 'assistant', no), ...review], true)).toBeNull();
    const planned = msg('plan', 'system', { type: 'brief-plan', status: 'proposal', items: [] });
    expect(
      planOfferToBringBack([msg('offer', 'assistant', weekChosen), ...review, planned], true),
    ).toBeNull();
    const wrap = msg('wrap', 'assistant', { type: 'brief-text', part: 'evening', wrap: true });
    expect(
      planOfferToBringBack([msg('offer', 'assistant', weekChosen), ...review, wrap], true),
    ).toBeNull();
  });

  it('waits while one of the review’s own offers is still live', () => {
    const asking = msg('day', 'assistant', {
      type: 'brief-offer',
      kind: 'week_day',
      week: true,
      buttons: [{ id: 'week_keep_day', label: 'Keep', action: 'week_keep_day' }],
    });
    const thread = [msg('offer', 'assistant', weekChosen), ...review, asking];
    expect(planOfferToBringBack(thread, true)).toBeNull();
  });

  it('is nothing when the brief had no plan to offer', () => {
    const bare = { ...weekChosen, kind: 'none', buttons: [] };
    expect(planOfferToBringBack([msg('offer', 'assistant', bare), ...review], true)).toBeNull();
  });
});
