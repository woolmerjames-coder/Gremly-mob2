/**
 * What the wrap up adds to the thread at each step (lib/wrapup/flow): the
 * order and the buttons of the approved prototype, every message marked as
 * part of the evening.
 */
import {
  answeredMsgs,
  buttonsAgain,
  closeMsgs,
  habitsMsgs,
  journalAskMsgs,
  nightMsgs,
  notTonightMsgs,
  offerButtons,
  openingMsgs,
  partialMsgs,
  questionsStartMsgs,
  skippedMsgs,
  sortedMsgs,
  type WrapMsg,
} from '../flow';
import type { BriefOfferMeta, SweepRecapMeta } from '../../brief/types';
import type { WrapDay } from '../words';

const DAY: WrapDay = { weekday: 'Wednesday', tomorrow: 'tomorrow', late: false };
const LATE: WrapDay = { weekday: 'Wednesday', tomorrow: 'Thursday', late: true };

const recap: Omit<SweepRecapMeta, 'type'> = {
  date: '2026-09-30',
  counts: { todos: 2, habits: 3, meetings: 8, drops: 3 },
  done: [{ title: 'Buy Oat Milk', kind: 'todo' }],
  missed: [{ id: 't1', title: 'Book the car service' }],
  planned: { done: 4, total: 5 },
};

const types = (msgs: WrapMsg[]) => msgs.map((m) => m.meta.type);
const offerOf = (m: WrapMsg) => m.meta as BriefOfferMeta;

describe('the wrap up in the thread', () => {
  it('opens on the day: the time, the line, the counts, what was missed, then the offer', () => {
    const msgs = openingMsgs({
      clock: '8:40 PM',
      recap,
      day: DAY,
      firstName: 'Sam',
      evening: true,
      cards: 5,
      skipsLeft: 3,
    });
    expect(types(msgs)).toEqual([
      'brief-event',
      'brief-text',
      'sweep-recap',
      'brief-text',
      'brief-offer',
    ]);
    expect(msgs[1].content).toBe("Evening, Sam. Here's your Wednesday.");
    expect(msgs[3].content).toContain('Book the car service');
    const offer = offerOf(msgs[4]);
    expect(offer.kind).toBe('wrap_up');
    expect(offer.buttons.map((b) => b.action)).toEqual([
      'sweep',
      'sweep_skip',
      'plan_week',
      'not_tonight',
    ]);
    expect(offer.hint).toBe('Moving it all uses one of your three weekly skips');
    // every message belongs to the evening
    expect(msgs.every((m) => m.meta.wrap === true)).toBe(true);
  });

  it('has no offer on a night with nothing to sort', () => {
    const msgs = openingMsgs({
      clock: '8:40 PM',
      recap: { ...recap, missed: [], planned: { done: 5, total: 5 } },
      day: DAY,
      firstName: null,
      evening: true,
      cards: 0,
      skipsLeft: 3,
    });
    expect(types(msgs)).toEqual(['brief-event', 'brief-text', 'sweep-recap', 'brief-text']);
    expect(msgs[3].content).toBe(
      "Everything you planned got done, and there's nothing to sort tonight.",
    );
  });

  it('leaves out moving it all on when no weekly skip is left', () => {
    const buttons = offerButtons(DAY, 0);
    expect(buttons.map((b) => b.action)).toEqual(['sweep', 'plan_week', 'not_tonight']);
  });

  it('names tomorrow by its weekday after midnight', () => {
    expect(offerButtons(LATE, 2)[1].label).toBe('Move it all to Thursday');
  });

  it('shows the receipt then asks to finish or leave when the cards were closed part way', () => {
    const msgs = partialMsgs(3, 2, DAY);
    expect(types(msgs)).toEqual(['sweep-receipt', 'brief-offer']);
    expect(offerOf(msgs[1]).buttons.map((b) => [b.label, b.action])).toEqual([
      ['Finish them', 'sweep'],
      ['Leave them', 'sweep_leave'],
    ]);
  });

  it('shows the receipt and says all sorted when every card is done', () => {
    const msgs = sortedMsgs(1);
    expect(types(msgs)).toEqual(['sweep-receipt', 'brief-text']);
    expect(msgs[1].content).toBe("All sorted. One let go, and that's fine.");
  });

  it('asks about habits by what is open', () => {
    const msgs = habitsMsgs(
      [
        { id: 'h1', title: 'Blinkist', kind: 'build' },
        { id: 'h2', title: 'Stretch', kind: 'build' },
        { id: 'h3', title: 'No coffee', kind: 'break' },
      ],
      ['Run'],
      '2026-09-30',
    );
    expect(msgs[0].content).toBe('Two habits are still open today. Did either happen?');
    expect(msgs[1].meta).toMatchObject({ type: 'sweep-habits', status: 'open', already: ['Run'] });
  });

  it('asks about the day with the three ways to answer', () => {
    const [ask] = journalAskMsgs(false);
    expect(ask.content).toBe('How was today?');
    expect(offerOf(ask).buttons.map((b) => b.action)).toEqual([
      'journal_write',
      'journal_mood',
      'journal_skip',
    ]);
    expect(journalAskMsgs(true)[0].content).toBe('Of course. How was today?');
  });

  it("puts Gremly's question with its choices, Something else and Skip", () => {
    const msgs = questionsStartMsgs(1, {
      id: 'q1',
      question: 'Is the dentist on Friday or Monday?',
      choices: ['Friday', 'Monday'],
      created_at: '2026-09-20T00:00:00Z',
      asked_at: null,
      record_table: 'notes',
      record_id: 'n1',
      private: false,
    });
    expect(msgs[0].content).toBe("One quick question, then you're done.");
    const q = offerOf(msgs[1]);
    expect(q).toMatchObject({ kind: 'question', question_id: 'q1', wrap: true });
    expect(q.buttons.map((b) => b.action)).toEqual(['answer', 'answer', 'answer_other', 'skip']);
  });

  it('shows the item an answer was about, to open', () => {
    const msgs = answeredMsgs(true, { id: 'n1', kind: 'note', title: 'Dentist' });
    expect(types(msgs)).toEqual(['brief-text', 'brief-event', 'sweep-item']);
    expect(answeredMsgs(true, null).map((m) => m.content)).toEqual([
      'Thanks, saved.',
      'Saved your answer',
    ]);
    expect(types(answeredMsgs(false, null))).toEqual(['brief-text']);
  });

  it('closes with tomorrow and the two buttons', () => {
    const [close] = closeMsgs({ day: DAY, meetings: 3, lined: ['Car service'], canPlan: true });
    expect(close.content).toBe(
      "That's Wednesday wrapped up. Tomorrow has three meetings, and Car service lined up.",
    );
    expect(offerOf(close).buttons.map((b) => [b.label, b.action])).toEqual([
      ['Plan tomorrow', 'plan_tomorrow'],
      ['Night, Gremly', 'night'],
    ]);
  });

  it('ends the thread on good night', () => {
    const msgs = nightMsgs(
      { id: 'night', label: 'Night, Gremly', action: 'night' },
      'Sam',
      '2026-09-30',
    );
    expect(types(msgs)).toEqual(['brief-reply', 'brief-text', 'sweep-end']);
    expect(msgs[1].content).toBe('Night, Sam. Sleep well.');
  });

  it('keeps the journal one tap away after Not tonight, unless it is written', () => {
    const b = { id: 'not_tonight', label: 'Not tonight', action: 'not_tonight' as const };
    const msgs = notTonightMsgs(b, false);
    expect(types(msgs)).toEqual(['brief-reply', 'brief-offer']);
    expect(offerOf(msgs[1]).buttons.map((x) => x.action)).toEqual(['journal_only']);
    expect(types(notTonightMsgs(b, true))).toEqual(['brief-reply', 'brief-text']);
  });

  it('says what a skip moved and what waits', () => {
    const b = { id: 'sweep_skip', label: 'Move it all to tomorrow', action: 'sweep_skip' as const };
    const msgs = skippedMsgs(b, { moved: 4, waiting: 2, skipsLeft: 2 }, DAY);
    expect(types(msgs)).toEqual(['brief-reply', 'brief-event', 'brief-text']);
    expect(msgs[1].content).toBe('Moved 4 todos to tomorrow');
    expect(msgs[2].content).toBe(
      "Done. Four todos have moved to tomorrow, and the other two will wait for your next Sweep. That's one skip used, two left this week.",
    );
  });

  it('puts the buttons back for the step it is on, with no words', () => {
    const base = {
      day: DAY,
      skipsLeft: 3,
      left: 2,
      journalDone: false,
      question: null,
      canPlan: true,
    };
    const again = (step: string, more = {}) => buttonsAgain(step, { ...base, ...more });
    expect(offerOf(again('offer')[0]).kind).toBe('wrap_up');
    expect(again('offer')[0].content).toBe('');
    expect(offerOf(again('partial')[0]).kind).toBe('wrap_partial');
    expect(offerOf(again('journal')[0]).kind).toBe('journal');
    expect(again('journal', { journalDone: true })).toEqual([]);
    expect(offerOf(again('close')[0]).kind).toBe('wrap_close');
    expect(offerOf(again('declined')[0]).kind).toBe('wrap_declined');
    // nothing to put back while a card is open
    expect(again('habits')).toEqual([]);
    expect(again('still')).toEqual([]);
  });
});
