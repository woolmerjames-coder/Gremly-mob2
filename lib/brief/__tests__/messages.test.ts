import {
  briefMetaOf,
  dayPartAt,
  followsGremly,
  isBriefMessage,
  liveOfferId,
  liveQuestion,
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
      'sweep-still',
      'sweep-habits',
      'sweep-journal',
      'sweep-item',
      'sweep-end',
    ]) {
      expect(isBriefMessage(msg(type, 'system', { type }))).toBe(true);
    }
  });
});
