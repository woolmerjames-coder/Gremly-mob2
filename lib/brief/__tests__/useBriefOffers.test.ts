import { renderHook, act } from '@testing-library/react-native';
import { checkInOfferOwed, useBriefOffers } from '../useBriefOffers';
import { answerQuestion, markQuestionAsked } from '../../story/storyApi';
import { creditFirstReply } from '../feeding';
import { BRIEF_COPY } from '../offerFlow';
import { applyCheckIn, briefWeekFacts } from '../checkIn';
import { getDateService } from '../../date/DateService';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../story/storyApi', () => ({
  answerQuestion: jest.fn(),
  markQuestionAsked: jest.fn(),
}));
jest.mock('../feeding', () => ({
  creditFirstReply: jest.fn(),
}));
jest.mock('../dcoRefresh', () => ({ scheduleDcoRefresh: jest.fn() }));
// their week as the app holds it: no check in is on unless a test says so
jest.mock('../checkIn', () => ({
  ...jest.requireActual('../checkIn'),
  applyCheckIn: jest.fn(),
  briefWeekFacts: jest.fn(() => ({ checkIn: () => null, reviewOffer: false })),
}));

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

  it('shows nothing of the morning’s after a weekly review begun at the wrap up’s close', async () => {
    const answered = msg('q', 'assistant', {
      ...(QUESTION.metadata_json as any),
      chosen: { id: 'typed', at: 'now' },
    });
    const thread = [
      answered,
      PLAN_HELD,
      msg('e1', 'assistant', { type: 'brief-text', part: 'evening', wrap: true }),
      msg('done', 'system', { type: 'week-card', card: 'done', week: true }),
    ];
    const { hook, added } = setup(thread);
    await act(async () => {
      await hook.result.current.continueBrief({ afterWeek: true });
    });
    expect(added).toHaveLength(0);

    // a turn in the thread still shows the held offer, as it always has
    const turn = setup([...thread, said('u1', 'Thanks'), reply('a1', 'Any time.')]);
    await act(async () => {
      await turn.hook.result.current.continueBrief();
    });
    expect(turn.added).toHaveLength(1);
    expect(turn.added[0].meta).toMatchObject({ revealed_from: 'plan-held' });
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

  describe('after the weekly review', () => {
    const ds = getDateService() as any;
    let clock: () => Date;
    const chosen = msg('plan-shown', 'assistant', {
      ...(PLAN_SHOWN.metadata_json as any),
      review_offer: true,
      chosen: { id: 'plan_week', at: 'now' },
    });
    const tap = msg('tap', 'user', {
      type: 'brief-reply',
      button_id: 'plan_week',
      action: 'plan_week',
    });
    const reviewed = [
      chosen,
      tap,
      msg('done', 'system', { type: 'week-card', card: 'done', week: true }),
      msg('line', 'assistant', { type: 'brief-text', part: 'morning', ids: [], week: true }),
    ];
    // a local hour of the day, whatever timezone the suite runs in
    const at = (hour: number) => {
      ds.clock = () => new Date(2026, 9, 4, hour, 30, 0);
    };
    beforeEach(() => {
      clock = ds.clock;
    });
    afterEach(() => {
      ds.clock = clock;
    });

    it('brings Plan my day back once the review chosen on the offer is over', async () => {
      at(9);
      const { hook, added } = setup(reviewed);
      await act(async () => {
        await hook.result.current.continueBrief({ afterWeek: true });
      });
      expect(added).toHaveLength(1);
      expect(added[0].meta).toMatchObject({
        type: 'brief-offer',
        kind: 'plan',
        brought_back_from: 'plan-shown',
      });
      expect(added[0].meta.chosen).toBeUndefined();
      expect(added[0].meta.buttons.map((b: any) => b.action)).toEqual([
        'plan',
        'what_can_wait',
        'not_today',
      ]);
    });

    it('does not put it back under a review that is still opening', async () => {
      at(9);
      // they typed while the read was being made: that turn is not the review's end
      const { hook, added } = setup([
        chosen,
        tap,
        said('u1', 'What time is my flight'),
        reply('a1', 'At three.'),
      ]);
      await act(async () => {
        await hook.result.current.continueBrief();
      });
      expect(added).toHaveLength(0);
    });

    it('lets the day be once the review ends in the evening, or in the small hours', async () => {
      at(19);
      const evening = setup(reviewed);
      await act(async () => {
        await evening.hook.result.current.continueBrief({ afterWeek: true });
      });
      expect(evening.added).toHaveLength(0);

      // half past midnight, before their day ends at three: still the evening before
      ds.setDayBoundaryHour(3);
      at(0);
      const late = setup(reviewed);
      await act(async () => {
        await late.hook.result.current.continueBrief({ afterWeek: true });
      });
      expect(late.added).toHaveLength(0);
    });
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

describe('their week on the brief’s offer', () => {
  const said = (id: string, content: string) => msg(id, 'user', null as any, content);
  const BUTTONS = [
    { id: 'plan', label: 'Plan my day', action: 'plan', primary: true },
    { id: 'not_today', label: 'Not today', action: 'not_today' },
  ];
  // the brief's last message, with a habit they planned for today riding on it
  const RIDING = msg(
    'offer',
    'assistant',
    {
      type: 'brief-offer',
      kind: 'plan',
      brief_id: 'b1',
      plan_from: 540,
      buttons: BUTTONS,
      checkin: { habit_id: 'h1', title: 'Strength' },
      review_offer: true,
    },
    'Want me to fit a few things into the clear time today?',
  );
  const KEEP = { id: 'habit_keep', label: 'Still on', action: 'habit_keep', primary: true };
  const MOVE = {
    id: 'habit_move',
    label: 'Move it to Saturday',
    action: 'habit_move',
    value: '2026-10-10',
  };
  const SKIP = { id: 'habit_skip', label: 'Skip this week', action: 'habit_skip' };
  const stillOn = () =>
    (briefWeekFacts as jest.Mock).mockReturnValue({
      checkIn: () => ({ title: 'Strength', moveTo: '2026-10-10' }),
      reviewOffer: false,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (creditFirstReply as jest.Mock).mockResolvedValue(false);
    (briefWeekFacts as jest.Mock).mockReturnValue({ checkIn: () => null, reviewOffer: false });
    (applyCheckIn as jest.Mock).mockResolvedValue({ text: 'Nice.', week: true });
    (markQuestionAsked as jest.Mock).mockResolvedValue(undefined);
  });

  it('answers the check in: their reply, Gremly with the habit’s week, then the offer itself', async () => {
    (applyCheckIn as jest.Mock).mockResolvedValue({
      text: 'Done. Strength is on Saturday now.',
      week: true,
    });
    const { hook, added, patched } = setup([RIDING], { date: '2026-10-08' });
    await act(async () => {
      await hook.result.current.handleOfferButton(RIDING, MOVE as any);
    });
    expect(applyCheckIn).toHaveBeenCalledWith('h1', 'habit_move', '2026-10-10');
    // the message keeps the check in's words from here on
    expect(patched[0]).toMatchObject({
      id: 'offer',
      patch: {
        chosen: { id: 'habit_move' },
        checkin: { habit_id: 'h1', title: 'Strength', asked: true },
      },
    });
    expect(added.map((a) => [a.role, a.content])).toEqual([
      ['user', 'Move it to Saturday'],
      ['assistant', 'Done. Strength is on Saturday now.'],
      ['assistant', 'Want me to fit a few things into the clear time today?'],
    ]);
    expect(added[1].meta).toMatchObject({
      type: 'brief-text',
      brief_id: 'b1',
      habit_week: { habit_id: 'h1', day: '2026-10-08' },
    });
    // the brief's own offer follows, as a new message with the check in gone
    expect(added[2].meta).toMatchObject({
      type: 'brief-offer',
      kind: 'plan',
      plan_from: 540,
      revealed_from: 'offer',
      review_offer: true,
    });
    expect(added[2].meta.checkin).toBeUndefined();
    expect(added[2].meta.chosen).toBeUndefined();
    expect(added[2].meta.buttons).toEqual(BUTTONS);
  });

  it('answers Still on and Skip this week the same way', async () => {
    for (const button of [KEEP, SKIP]) {
      (applyCheckIn as jest.Mock).mockClear();
      const { hook, added } = setup([RIDING], { date: '2026-10-08' });
      await act(async () => {
        await hook.result.current.handleOfferButton(RIDING, button as any);
      });
      expect(applyCheckIn).toHaveBeenCalledWith('h1', button.action, null);
      expect(added.map((a) => a.meta.type)).toEqual(['brief-reply', 'brief-text', 'brief-offer']);
    }
  });

  it('still shows the offer when the check in could not be done, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (applyCheckIn as jest.Mock).mockRejectedValue(new Error('offline'));
    const { hook, added } = setup([RIDING], { date: '2026-10-08' });
    await act(async () => {
      await hook.result.current.handleOfferButton(RIDING, SKIP as any);
    });
    expect(added[1].content).toBe("I couldn't save that just now, so it's still on for today.");
    expect(added[1].meta.habit_week).toBeUndefined();
    expect(added[2].meta).toMatchObject({ type: 'brief-offer', revealed_from: 'offer' });
    warn.mockRestore();
  });

  it('hands Plan my week to the screen after their reply', async () => {
    const onPlanWeek = jest.fn();
    const { hook, added, patched } = setup([RIDING], { date: '2026-10-08', onPlanWeek });
    const button = { id: 'plan_week', label: 'Plan my week', action: 'plan_week' };
    await act(async () => {
      await hook.result.current.handleOfferButton(RIDING, button as any);
    });
    expect(patched[0]).toMatchObject({ id: 'offer', patch: { chosen: { id: 'plan_week' } } });
    expect(added.map((a) => [a.role, a.content])).toEqual([['user', 'Plan my week']]);
    expect(onPlanWeek).toHaveBeenCalledTimes(1);
  });

  it('hands back to back or with some space to the planner, after their reply', async () => {
    const onPlanSpacing = jest.fn();
    const ask = msg(
      'ask',
      'assistant',
      {
        type: 'brief-offer',
        kind: 'plan_spacing',
        plan_day: '2026-10-08',
        picks: [{ id: 'oat', title: 'Buy Oat Milk' }],
        buttons: [],
      },
      'Those only fit today back to back.',
    );
    const { hook, added, patched } = setup([ask], { date: '2026-10-08', onPlanSpacing });
    const button = {
      id: 'plan_tight',
      label: 'Back to back',
      action: 'plan_spacing',
      value: 'tight',
    };
    await act(async () => {
      await hook.result.current.handleOfferButton(ask, button as any);
    });
    expect(patched[0]).toMatchObject({ id: 'ask', patch: { chosen: { id: 'plan_tight' } } });
    expect(added.map((a) => [a.role, a.content])).toEqual([['user', 'Back to back']]);
    expect(onPlanSpacing).toHaveBeenCalledWith(ask, button);
    // answered once: a second tap on it does nothing
    const answered = msg(
      'ask',
      'assistant',
      { ...(ask.metadata_json as any), chosen: { id: 'plan_tight', at: 'now' } },
      ask.content,
    );
    await act(async () => {
      await hook.result.current.handleOfferButton(answered, button as any);
    });
    expect(onPlanSpacing).toHaveBeenCalledTimes(1);
  });

  it('hands what to do with picks that did not fit to the planner, after their reply', async () => {
    const onPlanUnfit = jest.fn();
    const ask = msg(
      'unfit',
      'assistant',
      {
        type: 'brief-offer',
        kind: 'plan_unfit',
        plan_day: '2026-10-08',
        unfit: [{ id: 'oat', title: 'Buy Oat Milk' }],
        buttons: [],
      },
      'Want it tomorrow instead, or put off for later?',
    );
    const { hook, added } = setup([ask], { date: '2026-10-08', onPlanUnfit });
    const button = { id: 'unfit_later', label: 'Later', action: 'plan_unfit', value: 'later' };
    await act(async () => {
      await hook.result.current.handleOfferButton(ask, button as any);
    });
    expect(added.map((a) => [a.role, a.content])).toEqual([['user', 'Later']]);
    expect(onPlanUnfit).toHaveBeenCalledWith(ask, button);
  });

  it('takes a message typed under the check in as their answer to it', async () => {
    stillOn();
    const { hook, patched } = setup([RIDING], { date: '2026-10-08' });
    await act(async () => {
      // no question is waiting, so nothing is handed back for the chat
      expect(await hook.result.current.takeTypedReply('can it go on Sunday instead?')).toBeNull();
    });
    expect(patched).toEqual([
      {
        id: 'offer',
        patch: {
          chosen: { id: 'typed', at: expect.any(String) },
          checkin: { habit_id: 'h1', title: 'Strength', asked: true },
        },
      },
    ]);
  });

  it('leaves the offer alone when a message is typed and no check in is on', async () => {
    const { hook, patched } = setup([RIDING], { date: '2026-10-08' });
    await act(async () => {
      await hook.result.current.takeTypedReply('move the deck to Friday');
    });
    expect(patched).toEqual([]);
  });

  it('shows the offer itself once the turn after a typed answer is done, and only once', async () => {
    const typed = msg(
      'offer',
      'assistant',
      {
        ...(RIDING.metadata_json as any),
        chosen: { id: 'typed', at: 'now' },
        checkin: { habit_id: 'h1', title: 'Strength', asked: true },
      },
      RIDING.content,
    );
    const thread = [typed, said('u1', 'can it go on Sunday instead?')];
    const { hook, added } = setup(thread, { date: '2026-10-08' });
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(1);
    expect(added[0].content).toBe('Want me to fit a few things into the clear time today?');
    expect(added[0].meta).toMatchObject({ type: 'brief-offer', revealed_from: 'offer' });
    expect(added[0].meta.checkin).toBeUndefined();

    const again = setup(
      [...thread, msg('shown', 'assistant', added[0].meta, added[0].content), said('u2', 'ok')],
      { date: '2026-10-08' },
    );
    await act(async () => {
      await again.hook.result.current.continueBrief();
    });
    // the offer has been shown: passed by, it comes back as the plan offer does, not as a copy again
    expect(again.added.map((a) => a.meta.revealed_from)).toEqual([undefined]);
    expect(again.added[0].meta.brought_back_from).toBe('shown');
  });

  it('still owes the offer when a tap on the check in never got as far as showing it', async () => {
    // tapped, then the app closed before the brief's own offer was saved
    const tapped = msg(
      'offer',
      'assistant',
      {
        ...(RIDING.metadata_json as any),
        chosen: { id: 'habit_skip', at: 'now' },
        checkin: { habit_id: 'h1', title: 'Strength', asked: true },
      },
      RIDING.content,
    );
    const thread = [tapped, said('u1', 'Skip this week')];
    const { hook, added } = setup(thread, { date: '2026-10-08' });
    expect(hook.result.current.owesOffer()).toBe(true);
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(1);
    expect(added[0].meta).toMatchObject({ type: 'brief-offer', revealed_from: 'offer' });
    expect(added[0].meta.checkin).toBeUndefined();
    // asked for twice at once, it is still shown once
    const twice = setup(thread, { date: '2026-10-08' });
    await act(async () => {
      await Promise.all([
        twice.hook.result.current.continueBrief(),
        twice.hook.result.current.continueBrief(),
      ]);
    });
    expect(twice.added).toHaveLength(1);
    // shown, it is owed no longer
    const shown = msg('shown', 'assistant', added[0].meta, added[0].content);
    expect(checkInOfferOwed([...thread, shown])).toBeNull();
  });

  it('owes nothing for a check in not answered, or once the wrap up has begun', () => {
    expect(checkInOfferOwed([RIDING])).toBeNull();
    const typed = msg(
      'offer',
      'assistant',
      {
        ...(RIDING.metadata_json as any),
        chosen: { id: 'typed', at: 'now' },
        checkin: { habit_id: 'h1', title: 'Strength', asked: true },
      },
      RIDING.content,
    );
    expect(checkInOfferOwed([typed])?.message.id).toBe('offer');
    // the weekly review in between does not use the day's offer up
    const week = msg('w1', 'assistant', {
      type: 'brief-offer',
      kind: 'plan',
      buttons: [],
      week: true,
    });
    expect(checkInOfferOwed([typed, week])?.message.id).toBe('offer');
    // the evening's wrap up does, from its first line: the morning's offer is past
    const wrap = msg('e1', 'assistant', { type: 'brief-text', wrap: true });
    expect(checkInOfferOwed([typed, wrap])).toBeNull();
    // and so does a plan made since
    const plan = msg('p1', 'system', { type: 'brief-plan', date: '2026-10-08', items: [] });
    expect(checkInOfferOwed([typed, plan])).toBeNull();
  });

  it('shows the check in again after the question when the held offer carries it', async () => {
    const held = msg(
      'held-offer',
      'assistant',
      { ...(RIDING.metadata_json as any), held: true },
      RIDING.content,
    );
    const { hook, added } = setup([QUESTION, held], { date: '2026-10-08' });
    await act(async () => {
      await hook.result.current.handleOfferButton(
        QUESTION,
        (QUESTION.metadata_json as any).buttons[2],
      );
    });
    const shown = added[added.length - 1];
    expect(shown.meta).toMatchObject({
      type: 'brief-offer',
      revealed_from: 'held-offer',
      checkin: { habit_id: 'h1', title: 'Strength' },
    });
    expect(shown.meta.held).toBeUndefined();
  });

  it('asks back to back or with some space again after a message typed past it, picks and all', async () => {
    const ask = msg(
      'ask',
      'assistant',
      {
        type: 'brief-offer',
        kind: 'plan_spacing',
        plan_day: '2026-10-08',
        plan_from: 795,
        picks: [{ id: 'oat', title: 'Buy Oat Milk', minutes: 15, chosen: true }],
        buttons: [
          { id: 'plan_tight', label: 'Back to back', action: 'plan_spacing', value: 'tight' },
          { id: 'plan_spaced', label: 'With some space', action: 'plan_spacing', value: 'spaced' },
        ],
      },
      'Those only fit today back to back. Want them back to back, or with some space between them?',
    );
    const { hook, added } = setup([ask, said('u1', 'What is on tomorrow?')], {
      date: '2026-10-08',
    });
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(1);
    // the same question, not the plan offer's words
    expect(added[0].content).toBe(ask.content);
    expect(added[0].meta).toMatchObject({
      kind: 'plan_spacing',
      brought_back_from: 'ask',
      plan_day: '2026-10-08',
      plan_from: 795,
      picks: [{ id: 'oat', title: 'Buy Oat Milk', minutes: 15, chosen: true }],
    });
    expect(added[0].meta.buttons.map((b: any) => b.value)).toEqual(['tight', 'spaced']);
    expect(added[0].meta.chosen).toBeUndefined();
  });

  it('brings the plan offer back as itself, never as the check in', async () => {
    // the habit was done before they got to the check in, and they typed past the offer
    const thread = [RIDING, said('u1', 'Move the deck to today')];
    const { hook, added } = setup(thread, { date: '2026-10-08' });
    await act(async () => {
      await hook.result.current.continueBrief();
    });
    expect(added).toHaveLength(1);
    expect(added[0].meta).toMatchObject({ kind: 'plan', brought_back_from: 'offer' });
    expect(added[0].meta.checkin).toBeUndefined();
  });
});
