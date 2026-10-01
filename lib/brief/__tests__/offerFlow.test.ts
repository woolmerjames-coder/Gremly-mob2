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
