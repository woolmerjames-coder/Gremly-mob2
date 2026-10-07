import {
  BRIEF_COPY,
  afterAnswer,
  afterCatchUp,
  afterJustToday,
  afterNotToday,
  afterSkip,
  planLabel,
  replyStep,
  revealStep,
  typedAnswerStep,
  backToPlanStep,
  afterCheckInStep,
  checkInReplyStep,
} from '../offerFlow';
import { heldOffer, liveOfferId, visibleThreadMessages } from '../messages';
import type { BriefOfferMeta } from '../types';
import type { SpaceChatMessage } from '../../types';

function msg(id: string, role: string, meta: Record<string, unknown> | null, content = id) {
  return {
    id,
    chat_id: 'c1',
    scope_id: null,
    role,
    content,
    metadata_json: meta,
    created_at: '2026-10-01T15:00:00Z',
  } as unknown as SpaceChatMessage;
}

const RETURN_OFFER: BriefOfferMeta = {
  type: 'brief-offer',
  kind: 'return',
  buttons: [
    { id: 'sweep', label: 'Sweep first', action: 'sweep', primary: true },
    { id: 'catch_up', label: 'Catch me up', action: 'catch_up' },
    { id: 'just_today', label: 'Just today', action: 'just_today' },
  ],
  catch_up: 'There are 12 past their dates and 14 unsorted drops in Sweep. Nothing has been lost.',
  plan_from: 13 * 60,
  brief_id: 'b1',
};

describe('after a tap on the brief', () => {
  it('shows the tap as the person’s reply', () => {
    const s = replyStep({ id: 'skip', label: 'Skip', action: 'skip' }, 'b1');
    expect(s).toEqual({
      role: 'user',
      content: 'Skip',
      meta: { type: 'brief-reply', button_id: 'skip', action: 'skip', brief_id: 'b1' },
    });
    expect(typedAnswerStep("It's next Tuesday", 'b1').meta).toMatchObject({
      type: 'brief-reply',
      action: 'answer',
    });
  });

  it('thanks them for an answer and adds a Saved line', () => {
    const steps = afterAnswer(true, 'morning', 'b1');
    expect(steps.map((s) => s.content)).toEqual([BRIEF_COPY.answered, BRIEF_COPY.saved]);
    expect(steps[1]).toMatchObject({
      role: 'system',
      meta: { type: 'brief-event', icon: 'saved' },
    });
  });

  it('says so when the answer could not be saved, with no Saved line', () => {
    const steps = afterAnswer(false, 'morning');
    expect(steps).toHaveLength(1);
    expect(steps[0].content).toBe(BRIEF_COPY.answerFailed);
  });

  it('lets a skip go kindly', () => {
    expect(afterSkip('morning')[0].content).toBe(BRIEF_COPY.skipped);
  });

  it('shows the held offer again with the same words and buttons', () => {
    const step = revealStep({
      id: 'held-1',
      content: 'Want to sweep first?',
      meta: { ...RETURN_OFFER, kind: 'sweep', held: true },
    });
    expect(step.content).toBe('Want to sweep first?');
    expect(step.meta).toMatchObject({
      type: 'brief-offer',
      kind: 'sweep',
      revealed_from: 'held-1',
    });
    expect((step.meta as BriefOfferMeta).held).toBeUndefined();
    expect((step.meta as BriefOfferMeta).buttons).toHaveLength(3);
  });

  it('catches them up with the counts, then offers Sweep first or Just today', () => {
    const steps = afterCatchUp(RETURN_OFFER, 'morning');
    expect(steps[0].content).toBe(RETURN_OFFER.catch_up);
    const offer = steps[1].meta as BriefOfferMeta;
    expect(offer.buttons.map((b) => b.label)).toEqual(['Sweep first', 'Just today']);
    expect(offer.plan_from).toBe(13 * 60);
    expect(afterCatchUp({ ...RETURN_OFFER, catch_up: undefined }, 'morning')[0].content).toBe(
      BRIEF_COPY.catchUpFallback,
    );
  });

  it('keeps to today and offers to plan the clear stretch ahead', () => {
    const [step] = afterJustToday(RETURN_OFFER, 9 * 60);
    expect(step.content).toBe(
      "Then let's keep it to today. Want me to fit a few things into the afternoon?",
    );
    expect((step.meta as BriefOfferMeta).buttons.map((b) => b.label)).toEqual([
      'Plan my afternoon',
      'Not today',
    ]);
    // later than the stretch's start: it is labelled from now
    const [late] = afterJustToday(RETURN_OFFER, 18 * 60);
    expect((late.meta as BriefOfferMeta).buttons[0].label).toBe('Plan my evening');
    // nothing to plan
    const [none] = afterJustToday({ ...RETURN_OFFER, plan_from: undefined }, 9 * 60);
    expect(none.content).toBe(BRIEF_COPY.justToday);
    expect(none.meta.type).toBe('brief-text');
  });

  it('accepts Not today without fuss', () => {
    expect(afterNotToday('evening')[0].content).toBe(BRIEF_COPY.notToday);
  });

  it('labels planning by when the stretch starts', () => {
    expect(planLabel(9 * 60)).toBe('Plan my day');
    expect(planLabel(13 * 60)).toBe('Plan my afternoon');
    expect(planLabel(17 * 60)).toBe('Plan my evening');
  });
});

describe('the offer held for the question', () => {
  const question = msg('q', 'assistant', {
    type: 'brief-offer',
    kind: 'question',
    question_id: 'qq',
    buttons: [{ id: 'skip', label: 'Skip', action: 'skip' }],
  });
  const held = msg('h', 'assistant', { ...RETURN_OFFER, kind: 'sweep', held: true });

  it('is hidden, so the question’s buttons are the live ones', () => {
    const visible = visibleThreadMessages([question, held]);
    expect(visible.map((m) => m.id)).toEqual(['q']);
    expect(liveOfferId(visible)).toBe('q');
    expect(heldOffer([question, held])?.id).toBe('h');
  });

  it('is found once only: after it has been shown again it is not held any more', () => {
    const shown = msg('h2', 'assistant', { ...RETURN_OFFER, kind: 'sweep', revealed_from: 'h' });
    expect(heldOffer([question, held, shown])).toBeNull();
  });
});

describe('the plan offer brought back', () => {
  const offer = {
    id: 'plan-shown',
    meta: {
      type: 'brief-offer' as const,
      kind: 'plan' as const,
      brief_id: 'b1',
      plan_from: 788,
      revealed_from: 'plan-held',
      buttons: [
        { id: 'plan', label: 'Plan my afternoon', action: 'plan' as const, primary: true },
        { id: 'not_today', label: 'Not today', action: 'not_today' as const },
      ],
    },
  };

  it('asks about what is left of the day, with the plan button for now', () => {
    const step = backToPlanStep(offer, 18 * 60 + 5);
    expect(step.content).toBe('Want to plan the rest of your evening now?');
    const meta = step.meta as any;
    expect(meta.buttons[0].label).toBe('Plan my evening');
    expect(meta.buttons[1].label).toBe('Not today');
    expect(meta).toMatchObject({
      type: 'brief-offer',
      kind: 'plan',
      brought_back_from: 'plan-shown',
    });
    expect(meta.revealed_from).toBeUndefined();
  });

  it('keeps the afternoon wording in the afternoon', () => {
    expect(backToPlanStep(offer, 14 * 60).content).toBe(
      'Want to plan the rest of your afternoon now?',
    );
  });
});

describe('after the habit check in', () => {
  const riding: BriefOfferMeta = {
    type: 'brief-offer',
    kind: 'plan',
    brief_id: 'b1',
    plan_from: 540,
    held: true,
    chosen: { id: 'habit_keep', at: 'now' },
    checkin: { habit_id: 'h1', title: 'Strength', asked: true },
    review_offer: true,
    buttons: [
      { id: 'plan', label: 'Plan my day', action: 'plan', primary: true },
      { id: 'not_today', label: 'Not today', action: 'not_today' },
    ],
  };

  it("draws the habit's week under Gremly's reply when there is one to show", () => {
    const step = checkInReplyStep('Nice.', 'morning', 'b1', { habit_id: 'h1', day: '2026-10-08' });
    expect(step).toEqual({
      role: 'assistant',
      content: 'Nice.',
      meta: {
        type: 'brief-text',
        part: 'morning',
        ids: [],
        brief_id: 'b1',
        habit_week: { habit_id: 'h1', day: '2026-10-08' },
      },
    });
    const plain = checkInReplyStep('Not saved.', 'morning', 'b1', null);
    expect(plain.meta).not.toHaveProperty('habit_week');
  });

  it('shows the offer it rode on as a new message: same words and buttons, no check in', () => {
    const step = afterCheckInStep({ id: 'offer', content: 'Want to plan?', meta: riding });
    expect(step.role).toBe('assistant');
    expect(step.content).toBe('Want to plan?');
    expect(step.meta).toEqual({
      type: 'brief-offer',
      kind: 'plan',
      brief_id: 'b1',
      plan_from: 540,
      review_offer: true,
      buttons: riding.buttons,
      revealed_from: 'offer',
    });
  });

  it('never brings a plan offer back as the check in', () => {
    const waiting: BriefOfferMeta = { ...riding, held: undefined, chosen: undefined };
    waiting.checkin = { habit_id: 'h1', title: 'Strength' };
    const step = backToPlanStep({ id: 'offer', meta: waiting }, 10 * 60);
    expect(step.meta).not.toHaveProperty('checkin');
    expect((step.meta as BriefOfferMeta).brought_back_from).toBe('offer');
  });
});
