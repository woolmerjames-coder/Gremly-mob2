/**
 * Writing the brief into the thread, with the database and the models
 * replaced: what is written when the writer works, and that the brief still
 * arrives (in fixed words) when it does not.
 */
import { writeDailyBrief, fallbackLine, fallbackOffer } from '../index';
import { gatherBrief } from '../data';
import { writeBrief } from '../writer';
import { readLastWrap } from '../reaction';
import {
  appendMessages,
  ensureThread,
  patchThreadMeta,
  supersedeUnseen,
  threadMessages,
} from '../thread';

jest.mock('../data', () => ({ gatherBrief: jest.fn(), minutesIn: jest.fn() }));
jest.mock('../writer', () => ({ writeBrief: jest.fn(), BRIEF_PROMPT_VERSION: 'test' }));
jest.mock('../reaction', () => ({ readLastWrap: jest.fn() }));
jest.mock('../thread', () => ({
  appendMessages: jest.fn(),
  ensureThread: jest.fn(),
  patchThreadMeta: jest.fn(),
  supersedeUnseen: jest.fn(),
  threadMessages: jest.fn(),
}));
jest.mock('../../context/db', () => ({
  db: () => ({
    insertQuiet: jest.fn(async () => undefined),
    update: jest.fn(async () => undefined),
  }),
  localDate: () => '2026-10-01',
}));

function day(over = {}) {
  return {
    gremlyAge: 5,
    ritualDay: '2026-10-01',
    part: 'morning',
    now: 465,
    ret: null,
    overdue: 0,
    unsorted: 0,
    candidates: 2,
    planned: [],
    free: [{ from: 795, to: 1320 }],
    question: null,
    dcoBuilt: false,
    ...over,
  };
}

// the Workers runtime has crypto.randomUUID; the test runner may not
const realCrypto = globalThis.crypto;
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...(realCrypto || {}), randomUUID: () => 'brief-1' },
    configurable: true,
  });
});
afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
});

beforeEach(() => {
  ensureThread.mockResolvedValue({ id: 'thread-1', metadata_json: { ritual_day: '2026-10-01' } });
  threadMessages.mockResolvedValue([]);
  supersedeUnseen.mockResolvedValue(0);
  appendMessages.mockResolvedValue(undefined);
  patchThreadMeta.mockResolvedValue(undefined);
  readLastWrap.mockResolvedValue("LAST NIGHT'S WRAP UP: they finished it.");
});

const written = () => appendMessages.mock.calls[0][3];

describe('writing the brief', () => {
  it('writes the lines, the day card and the offer', async () => {
    gatherBrief.mockResolvedValue(day());
    writeBrief.mockResolvedValue({
      model: 'gemini',
      lines: [
        { text: 'Busy morning.', ids: ['c1'] },
        { text: 'Clear from 1:15pm.', ids: [] },
      ],
      dropped: [],
      offer: 'Want to plan the afternoon?',
      offerDropped: null,
      questionLine: null,
      questionChoices: [],
      catchUp: null,
    });
    const res = await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
    expect(res).toMatchObject({ ok: true, offer_kind: 'plan', lines: 2 });
    // the writer is given last night's wrap up
    expect(writeBrief.mock.calls[0][1].wrap).toBe("LAST NIGHT'S WRAP UP: they finished it.");
    expect(written().map((r) => r.metadata_json.type)).toEqual([
      'brief-text',
      'brief-text',
      'brief-day-card',
      'brief-offer',
    ]);
  });

  it('still arrives in fixed words when both models fail', async () => {
    gatherBrief.mockResolvedValue(day({ part: 'afternoon' }));
    writeBrief.mockRejectedValue(new Error('Gemini 503, then OpenAI 500'));
    const res = await writeDailyBrief({}, 'user-1', { reason: 'first_open' });
    expect(res.ok).toBe(true);
    const rows = written();
    expect(rows.map((r) => r.metadata_json.type)).toEqual([
      'brief-text',
      'brief-day-card',
      'brief-offer',
    ]);
    expect(rows[0].content).toBe("Here's the rest of today.");
    expect(rows[2].content).toBe(fallbackOffer('plan'));
  });

  it('still arrives when every line failed the check, and still asks the question', async () => {
    gatherBrief.mockResolvedValue(
      day({ question: { id: 'q1', question: 'Is the haircut Friday?', choices: ['Yes', 'No'] } }),
    );
    writeBrief.mockResolvedValue({
      model: 'gemini',
      lines: [],
      dropped: [
        { text: 'Your 3pm with Bob', bad: ['it states time 15:00 from a record it was not given'] },
      ],
      offer: null,
      offerDropped: null,
      questionLine: null,
      questionChoices: [],
      catchUp: null,
    });
    await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
    const rows = written();
    expect(rows[0].content).toBe("Here's your day.");
    const question = rows.find((r) => r.metadata_json.kind === 'question');
    expect(question.content).toBe('Is the haircut Friday?');
  });

  it("gives a question with no answers the writer's answers, but not one about someone", async () => {
    const asked = (kind) => ({
      model: 'gemini',
      lines: [{ text: 'A clear day.', ids: [] }],
      dropped: [],
      offer: null,
      offerDropped: null,
      questionLine: 'What is your brother called?',
      questionChoices: ['Tom', 'Sam'],
      catchUp: null,
      kind,
    });
    for (const [kind, want] of [
      ['fact', ['Tom', 'Sam']],
      ['person', []],
    ]) {
      appendMessages.mockClear();
      gatherBrief.mockResolvedValue(
        day({
          question: { id: 'q1', kind, question: 'What is your brother called?', choices: [] },
        }),
      );
      writeBrief.mockResolvedValue(asked(kind));
      await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      const q = written().find((r) => r.metadata_json.kind === 'question');
      const answers = q.metadata_json.buttons
        .filter((b) => b.action === 'answer')
        .map((b) => b.label);
      expect(answers).toEqual(want);
    }
  });

  describe('their week', () => {
    const wrote = (over = {}) => ({
      model: 'gemini',
      lines: [{ text: 'A clear day.', ids: [] }],
      dropped: [],
      offer: 'Want to plan the afternoon?',
      offerDropped: null,
      questionLine: null,
      questionChoices: [],
      catchUp: null,
      ...over,
    });
    const last = () => written()[written().length - 1];

    it('puts the habit check in and the review on the offer, as facts for the app', async () => {
      gatherBrief.mockResolvedValue(
        day({ checkIn: { id: 'h1', title: 'Strength', minutes: 45 }, reviewOffer: true }),
      );
      writeBrief.mockResolvedValue(wrote());
      const res = await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(res).toMatchObject({ checkin: 'h1', review_offer: true });
      expect(last().content).toBe('Want to plan the afternoon?');
      expect(last().metadata_json).toMatchObject({
        type: 'brief-offer',
        kind: 'plan',
        checkin: { habit_id: 'h1', title: 'Strength' },
        review_offer: true,
      });
      // the offer's own buttons are untouched: an app that does not know the week shows it as before
      expect(last().metadata_json.buttons.map((b) => b.action)).toEqual([
        'plan',
        'what_can_wait',
        'not_today',
      ]);
      expect(last().metadata_json.held).toBeUndefined();
    });

    it('leaves both off when there is neither', async () => {
      gatherBrief.mockResolvedValue(day({ checkIn: null, reviewOffer: false }));
      writeBrief.mockResolvedValue(wrote());
      const res = await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(res).toMatchObject({ checkin: null, review_offer: false });
      expect(last().metadata_json.checkin).toBeUndefined();
      expect(last().metadata_json.review_offer).toBeUndefined();
    });

    it('rides on a message with no words when the brief had no offer, so an older app shows nothing more', async () => {
      const quiet = { candidates: 0, free: [] };
      writeBrief.mockResolvedValue(wrote({ offer: null }));
      // nothing to offer and nothing from their week: the lines end the brief
      gatherBrief.mockResolvedValue(day(quiet));
      await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(written().map((r) => r.metadata_json.type)).toEqual(['brief-text', 'brief-day-card']);

      appendMessages.mockClear();
      gatherBrief.mockResolvedValue(day({ ...quiet, reviewOffer: true }));
      await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      // No words and no buttons: an app build that does not know the facts
      // draws nothing for it, so there is no extra sign off line there.
      expect(last().content).toBe('');
      expect(last().metadata_json).toMatchObject({
        type: 'brief-offer',
        kind: 'none',
        buttons: [],
        review_offer: true,
      });

      appendMessages.mockClear();
      gatherBrief.mockResolvedValue(day({ ...quiet, checkIn: { id: 'h1', title: 'Strength' } }));
      await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(last().content).toBe('');
      expect(last().metadata_json).toMatchObject({ kind: 'none', checkin: { habit_id: 'h1' } });

      // the writer's own sign off, when it gave one, is still the message they ride on
      appendMessages.mockClear();
      writeBrief.mockResolvedValue(wrote({ offer: 'Enjoy the quiet one.' }));
      gatherBrief.mockResolvedValue(day({ ...quiet, reviewOffer: true }));
      await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(last().content).toBe('Enjoy the quiet one.');
      expect(last().metadata_json).toMatchObject({ kind: 'none', review_offer: true });
    });

    it('waits behind the question like the offer it rides on', async () => {
      gatherBrief.mockResolvedValue(
        day({
          question: { id: 'q1', question: 'Is the haircut Friday?', choices: ['Yes', 'No'] },
          checkIn: { id: 'h1', title: 'Strength' },
        }),
      );
      writeBrief.mockResolvedValue(wrote({ questionLine: 'Is the haircut Friday?' }));
      await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(last().metadata_json).toMatchObject({ held: true, checkin: { habit_id: 'h1' } });
    });

    it('keeps a return day to its own gentle offer', async () => {
      gatherBrief.mockResolvedValue(
        day({
          ret: { days_away: 4, note: 'Good to have you back.' },
          unsorted: 2,
          checkIn: { id: 'h1', title: 'Strength' },
          reviewOffer: true,
        }),
      );
      writeBrief.mockResolvedValue(wrote({ offer: 'A quick sweep would help.' }));
      const res = await writeDailyBrief({}, 'user-1', { reason: 'scheduled' });
      expect(res).toMatchObject({ offer_kind: 'return', checkin: null, review_offer: false });
      expect(last().metadata_json.checkin).toBeUndefined();
      expect(last().metadata_json.review_offer).toBeUndefined();
    });
  });

  it('never writes for someone in their first day', async () => {
    gatherBrief.mockResolvedValue(day({ gremlyAge: 0 }));
    expect(await writeDailyBrief({}, 'user-1')).toEqual({ skipped: 'new user' });
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('welcomes a returning person in the fixed words too, without mentioning time away', () => {
    expect(fallbackLine('morning', true)).toBe("Good to see you. Here's today.");
    expect(fallbackOffer('return')).not.toMatch(/away|missed|piled/i);
  });
});
