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

jest.mock('../../changes/apply', () => ({ applyChanges: jest.fn() }));
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

describe('what Gremly is told', () => {
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
