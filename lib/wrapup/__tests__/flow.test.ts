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
  journalSavedMsgs,
  nightMsgs,
  notTonightMsgs,
  offerButtons,
  openingMsgs,
  partialMsgs,
  questionsStartMsgs,
  skippedMsgs,
  sortedMsgs,
  type WrapMsg,
  closeButtons,
  nightOnlyMsgs,
  toWeekMsgs,
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
    // planning the week is offered at the close, not here
    expect(offer.buttons.map((b) => b.action)).toEqual(['sweep', 'sweep_skip', 'not_tonight']);
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
    expect(buttons.map((b) => b.action)).toEqual(['sweep', 'not_tonight']);
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

  it('asks about the day with the four ways to answer', () => {
    const [ask] = journalAskMsgs(false);
    expect(ask.content).toBe('How was today?');
    expect(offerOf(ask).buttons.map((b) => b.action)).toEqual([
      'journal_write',
      'journal_page',
      'journal_mood',
      'journal_skip',
    ]);
    expect(offerOf(ask).buttons[1].label).toBe('Open my journal');
    expect(journalAskMsgs(true)[0].content).toBe('Of course. How was today?');
  });

  it('shows an entry written on the journal page with its answers and picked moods', () => {
    const [, saved] = journalSavedMsgs({
      day: '2026-09-30',
      noteId: 'n1',
      title: 'Wednesday evening',
      text: 'Thorn: the hard part\nThe budget review.',
      moods: ['calm'],
      parts: [{ q: 'Thorn: the hard part', text: 'The budget review.' }],
    });
    expect(saved.meta).toMatchObject({
      type: 'sweep-journal',
      status: 'saved',
      moods: ['calm'],
      parts: [{ q: 'Thorn: the hard part', text: 'The budget review.' }],
    });
    // a quick reply has no parts, and no moods until they are read
    const [, quick] = journalSavedMsgs({ day: '2026-09-30', noteId: 'n1', title: 't', text: 'Hi' });
    expect(quick.meta).toMatchObject({ moods: [] });
    expect('parts' in quick.meta).toBe(false);
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
    expect(msgs[0].content).toBe("One quick thing I'd like to get right, then you're done.");
    const q = offerOf(msgs[1]);
    expect(q).toMatchObject({ kind: 'question', question_id: 'q1', wrap: true });
    expect(q.buttons.map((b) => b.action)).toEqual(['answer', 'answer', 'answer_other', 'skip']);
  });

  it("carries a milestone's check in on its own message, with no question id", () => {
    const [, m] = questionsStartMsgs(1, {
      id: 'checkin:c1',
      question: 'You set a check in on “Run a 10k”. How is it going?',
      choices: [],
      created_at: '2026-10-08',
      asked_at: null,
      record_table: null,
      record_id: null,
      private: false,
      checkin: {
        id: 'c1',
        goal: 'Run a 10k',
        goal_date: '2026-10-20',
        date: '2026-10-08',
        title: 'How the long run went',
        status: 'open',
        row_id: 'row-1',
      },
    });
    const q = offerOf(m);
    // what settles the answer: the review that keeps it, and what the journal entry needs
    expect(q.milestone_checkin).toEqual({
      row_id: 'row-1',
      id: 'c1',
      goal: 'Run a 10k',
      goal_date: '2026-10-20',
    });
    // it is not a row among Gremly's questions, so nothing treats it as one
    expect(q.question_id).toBeUndefined();
    expect(q.buttons.map((b) => b.action)).toEqual(['answer_other', 'skip']);
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
    const [close] = closeMsgs({ day: DAY, meetings: 3, todos: ['Car service'], canPlan: true });
    expect(close.content).toBe(
      "That's Wednesday closed out, nicely done. Time to rest now. Tomorrow has three meetings, and Car service planned.",
    );
    expect(offerOf(close).buttons.map((b) => [b.label, b.action])).toEqual([
      ['Night, Gremly', 'night'],
      ['Plan tomorrow', 'plan_tomorrow'],
    ]);
  });

  describe('with their week, on the evenings the close offers it', () => {
    const close = (week: 'plan' | 'see' | null, canPlan = true) =>
      offerOf(closeMsgs({ day: DAY, meetings: 0, todos: [], canPlan, week })[0]);

    it('offers the weekly review beside good night until it is done', () => {
      const offer = close('plan');
      expect(offer.buttons.map((b) => [b.label, b.action])).toEqual([
        ['Night, Gremly', 'night'],
        ['Plan tomorrow', 'plan_tomorrow'],
        ['Plan my week', 'plan_week'],
      ]);
      // good night is still the one the close leads to
      expect(offer.buttons.filter((b) => b.primary).map((b) => b.action)).toEqual(['night']);
      expect(offer.hint).toBe("Your week isn't planned yet.");
    });

    it('offers the week they planned once the review is done', () => {
      const offer = close('see', false);
      expect(offer.buttons.map((b) => [b.label, b.action])).toEqual([
        ['Night, Gremly', 'night'],
        ['See your week', 'see_week'],
      ]);
      expect(offer.hint).toBeUndefined();
    });

    it('says nothing of the week on any other evening', () => {
      expect(close(null).buttons.map((b) => b.action)).toEqual(['night', 'plan_tomorrow']);
      expect(closeButtons(DAY, true).map((b) => b.action)).toEqual(['night', 'plan_tomorrow']);
    });

    it('keeps the week on the buttons put back, and after tomorrow is planned', () => {
      const again = buttonsAgain('close', {
        day: DAY,
        skipsLeft: 3,
        left: 0,
        journalDone: true,
        question: null,
        canPlan: false,
        week: 'plan',
      });
      expect(again[0].content).toBe('');
      expect(offerOf(again[0]).buttons.map((b) => b.action)).toEqual(['night', 'plan_week']);
      expect(offerOf(nightOnlyMsgs(DAY, 'see')[0]).buttons.map((b) => b.action)).toEqual([
        'night',
        'see_week',
      ]);
      expect(offerOf(nightOnlyMsgs(DAY)[0]).buttons.map((b) => b.action)).toEqual(['night']);
    });

    it('turns to the week when they tap Plan my week', () => {
      const msgs = toWeekMsgs({ id: 'plan_week', label: 'Plan my week', action: 'plan_week' });
      expect(types(msgs)).toEqual(['brief-reply', 'brief-text']);
      expect(msgs.map((m) => m.content)).toEqual(['Plan my week', "Let's plan your week."]);
      expect(msgs.every((m) => m.meta.wrap === true)).toBe(true);
    });
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
  });

  it("before the evening the buttons and lines use the day's words", () => {
    const EARLY: WrapDay = { ...DAY, early: true };
    const labels = (m: WrapMsg) => offerOf(m).buttons.map((b) => b.label);
    const opening = openingMsgs({
      clock: '2:10 PM',
      recap,
      day: EARLY,
      firstName: 'Sam',
      evening: false,
      cards: 5,
      skipsLeft: 3,
    });
    expect(opening[1].content).toBe("Here's your Wednesday so far, Sam.");
    expect(labels(opening[opening.length - 1])).toContain('Not now');
    expect(labels(journalAskMsgs(false, true)[0])).toEqual([
      'Write a few lines',
      'Open my journal',
      'Just pick a mood',
      'Skip',
    ]);
    expect(journalAskMsgs(false, true)[0].content).toBe('How is today going?');
    expect(labels(closeMsgs({ day: EARLY, meetings: 0, todos: [], canPlan: true })[0])).toEqual([
      'Thanks, Gremly',
      'Plan tomorrow',
    ]);
    // the buttons put back for a step keep to the same words
    const again = buttonsAgain('journal', {
      day: EARLY,
      skipsLeft: 3,
      left: 0,
      journalDone: false,
      question: null,
      canPlan: true,
    });
    expect(labels(again[0])).toContain('Skip');
    // and in the evening they are the evening's
    expect(labels(journalAskMsgs(false)[0])).toContain('Skip tonight');
    // the habits card is told, so its own words follow
    expect(
      habitsMsgs([{ id: 'h1', title: 'Run', kind: 'build' }], [], '2026-09-30', true)[1].meta,
    ).toMatchObject({ early: true });
    expect(
      (habitsMsgs([{ id: 'h1', title: 'Run', kind: 'build' }], [], '2026-09-30')[1].meta as any)
        .early,
    ).toBeUndefined();
  });
});
