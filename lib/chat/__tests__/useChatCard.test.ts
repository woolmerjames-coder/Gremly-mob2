/**
 * The agent's card in Ask Gremly: Accept writes the ticked changes through the
 * change model and adds "Updated 2 things", Undo puts them back, setting it
 * aside changes nothing, and what each card came to is part of the history
 * Gremly is told.
 */
import { renderHook, act } from '@testing-library/react-native';
import { chatCardMeta, chatHistoryOf, useChatCard } from '../useChatCard';
import { applyChanges } from '../../changes/apply';
import type { SpaceChatMessage } from '../../types';
import { sayNoToChapters } from '../../worlds/saidNo';
import { feedForChatSave, savedSomethingNew } from '../feedsGremly';

jest.mock('../../changes/apply', () => ({ applyChanges: jest.fn() }));
jest.mock('../../worlds/saidNo', () => ({ sayNoToChapters: jest.fn() }));
jest.mock('../feedsGremly', () => ({
  savedSomethingNew: jest.fn(() => false),
  feedForChatSave: jest.fn(async () => {}),
}));
jest.mock('../../brief/useDayTurn', () => ({
  cardOutcomeWords: (meta: { status: string }) =>
    meta.status === 'open' ? null : `(card ${meta.status})`,
  DAY_TURN_COPY: {
    dismissed: "No problem, I've left everything as it is.",
    someFailed: "One of those didn't save. It's marked on the card.",
    undoFailed: "I couldn't put all of that back.",
  },
}));
jest.mock('../../brief/applyChanges', () => ({
  changedEventText: (n: number) => `Updated ${n} things`,
  undoneEventText: (n: number) => `Put back ${n} things`,
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: {
    getState: () => ({ thread: { id: 'day1', metadata_json: { ritual_day: '2026-10-03' } } }),
  },
}));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({ ritualDay: () => '2026-10-03' }),
}));

const card = [
  { cid: 'c1', op: 'change', type: 'todo', id: 'v1', title: 'Vet', fields: { day: '2026-10-09' } },
  { cid: 'c2', op: 'add', type: 'todo', title: 'Call Mum', fields: { day: '2026-10-04' } },
] as any;

const cardMessage = (status = 'open') =>
  ({
    id: 'm9',
    role: 'system',
    content: '',
    metadata_json: { ...chatCardMeta(card, [{ ask: 'Move the vet', status: 'proposed' }]), status },
  }) as unknown as SpaceChatMessage;

function setup() {
  const deps = {
    appendBriefMessage: jest.fn(async () => undefined),
    patchMessageMetadata: jest.fn(async () => {}),
    say: jest.fn(async () => {}),
  };
  const hook = renderHook(() => useChatCard(deps));
  return { deps, hook };
}

beforeEach(() => jest.clearAllMocks());

describe('the card in a chat', () => {
  it('Accept writes the ticked rows from the chat, says how many, and can be undone', async () => {
    const revert = jest.fn(async () => {});
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [{ cid: 'c1', ok: true, summary: '', revert }],
      revertAll: revert,
    });
    const { deps, hook } = setup();
    await act(() => hook.result.current.apply(cardMessage(), ['c2']));
    expect(applyChanges).toHaveBeenCalledWith([card[0]], { source: 'chat', threadId: 'day1' });
    expect(deps.patchMessageMetadata).toHaveBeenCalledWith('m9', {
      status: 'applied',
      unticked: ['c2'],
      applied: ['c1'],
      failed: [],
    });
    expect(deps.appendBriefMessage).toHaveBeenCalledWith('system', 'Updated 1 things', {
      type: 'brief-event',
      icon: 'saved',
    });
    expect(hook.result.current.canUndo('m9')).toBe(true);
    await act(() => hook.result.current.undo(cardMessage('applied')));
    expect(revert).toHaveBeenCalled();
    expect(deps.patchMessageMetadata).toHaveBeenLastCalledWith('m9', { status: 'undone' });
    expect(hook.result.current.canUndo('m9')).toBe(false);
  });

  it('keeps the item a row made, so the row can open it', async () => {
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [
        { cid: 'c1', ok: true, summary: '', revert: jest.fn(), createdId: 'new-todo' },
        { cid: 'c2', ok: true, summary: '', revert: jest.fn() },
      ],
      revertAll: jest.fn(),
    });
    const { deps, hook } = setup();
    await act(() => hook.result.current.apply(cardMessage(), []));
    expect(deps.patchMessageMetadata).toHaveBeenCalledWith('m9', {
      status: 'applied',
      unticked: [],
      applied: ['c1', 'c2'],
      failed: [],
      created: { c1: 'new-todo' },
    });
  });

  it('sets up the steps of a milestone still ticked, and keeps the todo each made', async () => {
    const talk = {
      cid: 'c3',
      op: 'milestone',
      type: null,
      id: null,
      title: 'Conference talk',
      milestone: {
        goal: 'Conference talk',
        date: '2026-10-20',
        steps: [
          { title: 'Draft the outline', by: '2026-10-08', kind: 'todo' },
          { title: 'Rehearse once', by: '2026-10-16', kind: 'todo' },
        ],
      },
    };
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [
        { cid: 'c3', ok: true, summary: '', revert: jest.fn(), createdParts: { 'c3.2': 'made-2' } },
      ],
      revertAll: jest.fn(),
    });
    const { deps, hook } = setup();
    const message = {
      id: 'm9',
      role: 'system',
      content: '',
      metadata_json: { ...chatCardMeta([...card, talk], []), status: 'open' },
    } as unknown as SpaceChatMessage;
    await act(() => hook.result.current.apply(message, ['c1', 'c2', 'c3.1']));
    expect((applyChanges as jest.Mock).mock.calls[0][0]).toEqual([
      {
        ...talk,
        milestone: {
          ...talk.milestone,
          steps: [{ title: 'Rehearse once', by: '2026-10-16', kind: 'todo', row: 'c3.2' }],
        },
      },
    ]);
    expect(deps.patchMessageMetadata).toHaveBeenCalledWith('m9', {
      status: 'applied',
      unticked: ['c1', 'c2', 'c3.1'],
      applied: ['c3'],
      failed: [],
      created: { 'c3.2': 'made-2' },
    });
  });

  it('says so when a row could not be saved', async () => {
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [{ cid: 'c1', ok: false, reason: 'stale', message: 'edited since' }],
      revertAll: jest.fn(),
    });
    const { deps, hook } = setup();
    await act(() => hook.result.current.apply(cardMessage(), []));
    expect(deps.say).toHaveBeenCalledWith("One of those didn't save. It's marked on the card.");
    expect(deps.appendBriefMessage).not.toHaveBeenCalled();
  });

  it('setting it aside changes nothing, and a closed card does nothing', async () => {
    const { deps, hook } = setup();
    await act(() => hook.result.current.dismiss(cardMessage()));
    expect(deps.patchMessageMetadata).toHaveBeenCalledWith('m9', { status: 'dismissed' });
    expect(deps.say).toHaveBeenCalledWith("No problem, I've left everything as it is.");
    await act(() => hook.result.current.apply(cardMessage('dismissed'), []));
    expect(applyChanges).not.toHaveBeenCalled();
  });
});

describe('feeding Gremly', () => {
  it('a card that saved something new feeds him once, like a drop', async () => {
    const outcomes = [
      { cid: 'c1', ok: true, summary: '', revert: jest.fn() },
      { cid: 'c2', ok: true, summary: '', revert: jest.fn(), createdId: 'new-todo' },
    ];
    (applyChanges as jest.Mock).mockResolvedValue({ outcomes, revertAll: jest.fn() });
    (savedSomethingNew as jest.Mock).mockReturnValueOnce(true);
    const { hook } = setup();
    await act(() => hook.result.current.apply(cardMessage(), []));
    expect(savedSomethingNew).toHaveBeenCalledWith(card, outcomes);
    expect(feedForChatSave).toHaveBeenCalledTimes(1);
  });

  it('a card that saved nothing new does not feed him', async () => {
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [{ cid: 'c1', ok: true, summary: '', revert: jest.fn() }],
      revertAll: jest.fn(),
    });
    const { hook } = setup();
    await act(() => hook.result.current.apply(cardMessage(), ['c2']));
    expect(savedSomethingNew).toHaveBeenCalledWith([card[0]], expect.any(Array));
    expect(feedForChatSave).not.toHaveBeenCalled();
  });
});

describe('a Chapter Gremly offered', () => {
  const trip = {
    cid: 'c4',
    op: 'add',
    type: 'chapter',
    id: null,
    title: 'Lisbon trip',
    fields: { name: 'Lisbon trip', world: 'w1', end_day: '2026-11-02' },
  };
  const offer = (status = 'open') =>
    ({
      id: 'm9',
      role: 'system',
      content: '',
      metadata_json: { ...chatCardMeta([card[0], trip], []), status },
    }) as unknown as SpaceChatMessage;

  it('is a no when the card is set aside', async () => {
    const { hook } = setup();
    await act(() => hook.result.current.dismiss(offer()));
    expect(sayNoToChapters).toHaveBeenCalledWith([card[0], trip]);
  });

  it('is a no when its row is left unticked, and only that row', async () => {
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [{ cid: 'c1', ok: true, summary: '', revert: jest.fn() }],
      revertAll: jest.fn(),
    });
    const { hook } = setup();
    await act(() => hook.result.current.apply(offer(), ['c4']));
    expect(sayNoToChapters).toHaveBeenCalledWith([trip]);
  });

  it('is a no when its start is undone, and not before', async () => {
    const revert = jest.fn(async () => {});
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [
        { cid: 'c1', ok: true, summary: '', revert },
        { cid: 'c4', ok: true, summary: '', revert, createdId: 'ch9' },
      ],
      revertAll: revert,
    });
    const { hook } = setup();
    await act(() => hook.result.current.apply(offer(), []));
    expect(sayNoToChapters).toHaveBeenCalledWith([]);
    await act(() => hook.result.current.undo(offer('applied')));
    expect(sayNoToChapters).toHaveBeenLastCalledWith([card[0], trip]);
  });

  it('is not a no when the undo could not put it back', async () => {
    const revert = jest.fn(async () => {
      throw new Error('offline');
    });
    (applyChanges as jest.Mock).mockResolvedValue({
      outcomes: [{ cid: 'c4', ok: true, summary: '', revert }],
      revertAll: revert,
    });
    const { hook } = setup();
    await act(() => hook.result.current.apply(offer(), []));
    await act(() => hook.result.current.undo(offer('applied')));
    expect(sayNoToChapters).toHaveBeenCalledTimes(1);
    expect(sayNoToChapters).toHaveBeenCalledWith([]);
  });
});

describe('what Gremly is told', () => {
  it('what they saved from the conversation, and changes they accepted on the quick card', () => {
    const card = (over: Record<string, unknown>) =>
      ({
        id: String(Math.random()),
        role: 'system',
        content: 'Entity card',
        metadata_json: { type: 'entity-card', status: 'applied', ...over },
      }) as unknown as SpaceChatMessage;
    const told = chatHistoryOf([
      { id: 'u1', role: 'user', content: "I've got Friday off work" } as SpaceChatMessage,
      card({
        card: {
          kind: 'view',
          saved: true,
          entity: { id: 'n1', type: 'note', title: 'Friday Off Work' },
        },
      }),
      card({
        card: {
          kind: 'edit',
          entity: { id: 'n2', type: 'note', title: 'See Michelle' },
          change: { field: 'body_add', from: null, to: 'First time since' },
        },
      }),
      // still waiting, or turned down: nothing happened
      card({
        status: 'pending',
        card: { kind: 'view', saved: true, entity: { id: 'n3', type: 'note', title: 'Not yet' } },
      }),
      card({
        status: 'declined',
        card: {
          kind: 'edit',
          entity: { id: 'n4', type: 'todo', title: 'Said no' },
          change: { field: 'due_day', from: null, to: '2026-10-09' },
        },
      }),
    ]);
    expect(told).toEqual([
      { role: 'user', content: "I've got Friday off work" },
      {
        role: 'user',
        content: '(They saved “Friday Off Work” from this conversation, as a note.)',
      },
      { role: 'user', content: '(They accepted a change to their note “See Michelle”.)' },
    ]);
  });

  it('the conversation, with what each card came to', () => {
    const history = chatHistoryOf([
      { id: '1', role: 'user', content: 'Move the vet to Friday', metadata_json: null },
      { id: '2', role: 'assistant', content: 'Want me to?', metadata_json: null },
      cardMessage('applied'),
      {
        id: '3',
        role: 'system',
        content: 'Updated 1 things',
        metadata_json: { type: 'brief-event' },
      },
      cardMessage('open'),
    ] as unknown as SpaceChatMessage[]);
    expect(history).toEqual([
      { role: 'user', content: 'Move the vet to Friday' },
      { role: 'assistant', content: 'Want me to?' },
      { role: 'user', content: '(card applied)' },
    ]);
  });

  it('what they kept from a reply, and where; a Save button not used says nothing', () => {
    const keep = (saved: unknown) => ({
      id: 'k',
      role: 'system',
      content: '',
      metadata_json: {
        type: 'keep-offer',
        kind: 'list',
        title: 'Packing',
        lines: ['Passport'],
        place: null,
        saved,
      },
    });
    const history = chatHistoryOf([
      keep(null),
      keep({ id: 'n1', place: { type: 'chapter', id: 'ch1', name: 'Lisbon trip' } }),
    ] as unknown as SpaceChatMessage[]);
    expect(history).toEqual([
      { role: 'user', content: "(They saved “Packing” from Gremly's reply to Lisbon trip.)" },
    ]);
  });

  it('the card carries the asks it answers', () => {
    expect(
      chatCardMeta(card, [
        { ask: 'Move the vet', status: 'proposed' },
        { ask: 'x', status: 'open' },
      ]),
    ).toMatchObject({
      type: 'brief-changes',
      card,
      checklist: [{ ask: 'Move the vet', status: 'proposed' }],
      status: 'open',
    });
  });
});
