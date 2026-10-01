import { renderHook, act } from '@testing-library/react-native';
import { useBriefOffers } from '../useBriefOffers';
import { answerQuestion, markQuestionAsked } from '../../story/storyApi';
import { creditFirstReply } from '../feeding';
import { BRIEF_COPY } from '../offerFlow';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../story/storyApi', () => ({
  answerQuestion: jest.fn(),
  markQuestionAsked: jest.fn(),
}));
jest.mock('../feeding', () => ({
  creditFirstReply: jest.fn(),
}));
jest.mock('../dcoRefresh', () => ({ scheduleDcoRefresh: jest.fn() }));

function msg(id: string, role: string, meta: Record<string, unknown>, content = id) {
  return { id, chat_id: 't1', role, content, metadata_json: meta } as unknown as SpaceChatMessage;
}

const QUESTION = msg(
  'q',
  'assistant',
  {
    type: 'brief-offer',
    kind: 'question',
    question_id: 'question-1',
    brief_id: 'b1',
    buttons: [
      { id: 'answer_0', label: 'Friday', action: 'answer', value: 'Friday' },
      { id: 'answer_other', label: 'Something else', action: 'answer_other' },
      { id: 'skip', label: 'Skip', action: 'skip' },
    ],
  },
  'Is your haircut this Friday or Saturday?',
);
const HELD = msg(
  'held',
  'assistant',
  {
    type: 'brief-offer',
    kind: 'sweep',
    held: true,
    brief_id: 'b1',
    buttons: [
      { id: 'sweep', label: 'Sweep first', action: 'sweep', primary: true },
      { id: 'not_today', label: 'Not today', action: 'not_today' },
    ],
  },
  'A few things are waiting in Sweep. Want to sort them first?',
);

function setup(messages: SpaceChatMessage[], extra: Record<string, unknown> = {}) {
  const added: { role: string; content: string; meta: Record<string, any> }[] = [];
  const patched: { id: string; patch: Record<string, unknown> }[] = [];
  const deps = {
    threadId: 't1',
    messages,
    pauseMs: 0,
    appendBriefMessage: jest.fn(
      async (role: string, content: string, meta: Record<string, any>) => {
        added.push({ role, content, meta });
        return msg(`m${added.length}`, role, meta, content);
      },
    ),
    patchMessageMetadata: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      patched.push({ id, patch });
    }),
    ...extra,
  };
  const hook = renderHook(() => useBriefOffers(deps as any));
  return { hook, added, patched, deps };
}

describe('the brief’s buttons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (answerQuestion as jest.Mock).mockResolvedValue(true);
    (markQuestionAsked as jest.Mock).mockResolvedValue(undefined);
    (creditFirstReply as jest.Mock).mockResolvedValue(true);
  });

  it('saves a tapped answer, says thanks with a Saved line, then shows the held offer', async () => {
    const { hook, added, patched } = setup([QUESTION, HELD]);
    const button = (QUESTION.metadata_json as any).buttons[0];
    await act(async () => {
      await hook.result.current.handleOfferButton(QUESTION, button);
    });
    expect(answerQuestion).toHaveBeenCalledWith('question-1', 'Friday');
    expect(patched[0]).toMatchObject({ id: 'q', patch: { chosen: { id: 'answer_0' } } });
    expect(added.map((a) => [a.role, a.content])).toEqual([
      ['user', 'Friday'],
      ['assistant', BRIEF_COPY.answered],
      ['system', BRIEF_COPY.saved],
      ['assistant', 'A few things are waiting in Sweep. Want to sort them first?'],
    ]);
    expect(added[3].meta).toMatchObject({ type: 'brief-offer', revealed_from: 'held' });
    expect(added[3].meta.held).toBeUndefined();
    expect(creditFirstReply).toHaveBeenCalledWith('t1');
  });

  it('turns Something else into an answer box, and the next message is the answer', async () => {
    const { hook, added } = setup([QUESTION, HELD]);
    const other = (QUESTION.metadata_json as any).buttons[1];
    await act(async () => {
      await hook.result.current.handleOfferButton(QUESTION, other);
    });
    expect(hook.result.current.awaitingAnswer).toBe(true);
    expect(added).toHaveLength(0);
    let used = false;
    await act(async () => {
      used = await hook.result.current.answerTyped("It's next Tuesday actually");
    });
    expect(used).toBe(true);
    expect(answerQuestion).toHaveBeenCalledWith('question-1', "It's next Tuesday actually");
    expect(added[0]).toMatchObject({
      role: 'user',
      content: "It's next Tuesday actually",
      meta: { type: 'brief-reply', action: 'answer' },
    });
    expect(added.map((a) => a.content)).toContain(BRIEF_COPY.saved);
    expect(hook.result.current.awaitingAnswer).toBe(false);
  });

  it('leaves an ordinary message alone when no answer is awaited', async () => {
    const { hook } = setup([QUESTION, HELD]);
    let used = true;
    await act(async () => {
      used = await hook.result.current.answerTyped('hello');
    });
    expect(used).toBe(false);
  });

  it('marks a skipped question asked and shows the held offer', async () => {
    const { hook, added } = setup([QUESTION, HELD]);
    const skip = (QUESTION.metadata_json as any).buttons[2];
    await act(async () => {
      await hook.result.current.handleOfferButton(QUESTION, skip);
    });
    expect(markQuestionAsked).toHaveBeenCalledWith('question-1');
    expect(answerQuestion).not.toHaveBeenCalled();
    expect(added.map((a) => a.content)).toEqual([
      'Skip',
      BRIEF_COPY.skipped,
      'A few things are waiting in Sweep. Want to sort them first?',
    ]);
  });

  it('hands Sweep first and planning to the screen after the reply', async () => {
    const onSweep = jest.fn();
    const onPlan = jest.fn();
    const offer = msg('o', 'assistant', {
      type: 'brief-offer',
      kind: 'sweep',
      buttons: [
        { id: 'sweep', label: 'Sweep first', action: 'sweep', primary: true },
        { id: 'plan', label: 'Plan anyway', action: 'plan' },
      ],
    });
    const { hook, added } = setup([offer], { onSweep, onPlan });
    await act(async () => {
      await hook.result.current.handleOfferButton(offer, (offer.metadata_json as any).buttons[0]);
    });
    expect(added.map((a) => a.content)).toEqual(['Sweep first']);
    expect(onSweep).toHaveBeenCalled();
    expect(onPlan).not.toHaveBeenCalled();
  });

  it('ignores a tap on an offer that already has an answer', async () => {
    const done = msg('d', 'assistant', {
      type: 'brief-offer',
      kind: 'plan',
      chosen: { id: 'plan', at: 'x' },
      buttons: [{ id: 'not_today', label: 'Not today', action: 'not_today' }],
    });
    const { hook, added } = setup([done]);
    await act(async () => {
      await hook.result.current.handleOfferButton(done, (done.metadata_json as any).buttons[0]);
    });
    expect(added).toHaveLength(0);
  });
});

describe('a reply typed under the question, and the brief carrying on', () => {
  const PLAN_HELD = msg(
    'plan-held',
    'assistant',
    {
      type: 'brief-offer',
      kind: 'plan',
      held: true,
      brief_id: 'b1',
      plan_from: 788,
      buttons: [
        { id: 'plan', label: 'Plan my afternoon', action: 'plan', primary: true },
        { id: 'what_can_wait', label: 'What can wait?', action: 'what_can_wait' },
        { id: 'not_today', label: 'Not today', action: 'not_today' },
      ],
    },
    'We can plan your afternoon if you like.',
  );
  const PLAN_SHOWN = msg(
    'plan-shown',
    'assistant',
    { ...(PLAN_HELD.metadata_json as any), held: undefined, revealed_from: 'plan-held' },
    'We can plan your afternoon if you like.',
  );
  const said = (id: string, content: string) => msg(id, 'user', null as any, content);
  const reply = (id: string, content: string) => msg(id, 'assistant', null as any, content);
  const card = (id: string) =>
    msg(id, 'system', { type: 'entity-card', status: 'applied' }, 'Entity card: Send the deck');

  beforeEach(() => {
    jest.clearAllMocks();
    (answerQuestion as jest.Mock).mockResolvedValue(true);
  });

  it('takes a message typed under the question as the reply to it', async () => {
    const { hook, added, patched } = setup([QUESTION, PLAN_HELD]);
    let question: string | null = null;
    await act(async () => {
      question = await hook.result.current.takeTypedReply('The appointment is cancelled');
    });
    expect(question).toBe('Is your haircut this Friday or Saturday?');
    expect(patched[0]).toMatchObject({ id: 'q', patch: { chosen: { id: 'typed' } } });
    expect(answerQuestion).toHaveBeenCalledWith('question-1', 'The appointment is cancelled');
    // the chat replies; nothing is added here
    expect(added).toHaveLength(0);
  });

  it('leaves a message alone when the question is not the last thing said', async () => {
    const { hook, patched } = setup([QUESTION, said('u1', 'hello'), reply('a1', 'Hi!')]);
    let question: string | null = 'x';
    await act(async () => {
      question = await hook.result.current.takeTypedReply('what about tomorrow');
    });
    expect(question).toBeNull();
    expect(patched).toHaveLength(0);
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it('shows the offer held for the question once the reply is in', async () => {
    const answered = msg('q', 'assistant', {
      ...(QUESTION.metadata_json as any),
      chosen: { id: 'typed', at: 'now' },
    });
    const { hook, added } = setup([
      answered,
      PLAN_HELD,
      said('u1', 'The appointment is cancelled'),
      reply('a1', 'Got it, that frees up the afternoon.'),
    ]);
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      role: 'assistant',
      content: 'We can plan your afternoon if you like.',
      meta: { type: 'brief-offer', revealed_from: 'plan-held' },
    });
  });

  it('waits while the question is still the last thing said', async () => {
    const { hook, added } = setup([QUESTION, PLAN_HELD]);
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(0);
  });

  it('brings the plan offer back once after a change made in the thread', async () => {
    const thread = [
      PLAN_HELD,
      PLAN_SHOWN,
      said('u1', 'Move the deck to today'),
      reply('a1', 'Is that the one you mean?'),
      card('c1'),
    ];
    const { hook, added } = setup(thread);
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(1);
    expect(added[0].meta).toMatchObject({
      type: 'brief-offer',
      kind: 'plan',
      brought_back_from: 'plan-shown',
    });
    expect(added[0].meta.revealed_from).toBeUndefined();
    expect(added[0].meta.buttons.map((b: any) => b.action)).toEqual([
      'plan',
      'what_can_wait',
      'not_today',
    ]);

    // passed by again: not brought back a second time
    const again = [
      ...thread,
      msg('back', 'assistant', added[0].meta, added[0].content),
      said('u2', 'And move the plumber to Monday'),
      reply('a2', 'Is that the one you mean?'),
      card('c2'),
    ];
    const second = setup(again);
    await act(async () => {
      await second.hook.result.current.continueBrief();
    });
    expect(second.added).toHaveLength(0);
  });

  it('does not bring the plan offer back once something was chosen on it or a plan was made', async () => {
    const chosen = msg('plan-shown', 'assistant', {
      ...(PLAN_SHOWN.metadata_json as any),
      chosen: { id: 'not_today', at: 'now' },
    });
    const a = setup([PLAN_HELD, chosen, said('u1', 'move it'), card('c1')]);
    await act(async () => {
      await a.hook.result.current.continueBrief();
    });
    expect(a.added).toHaveLength(0);

    const plan = msg('p1', 'system', { type: 'brief-plan', status: 'proposal', items: [] });
    const b = setup([
      PLAN_HELD,
      PLAN_SHOWN,
      said('u1', 'plan'),
      plan,
      said('u2', 'move it'),
      card('c1'),
    ]);
    await act(async () => {
      await b.hook.result.current.continueBrief();
    });
    expect(b.added).toHaveLength(0);
  });
});
