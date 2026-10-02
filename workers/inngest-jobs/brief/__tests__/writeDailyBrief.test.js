/**
 * Writing the brief into the thread, with the database and the models
 * replaced: what is written when the writer works, and that the brief still
 * arrives (in fixed words) when it does not.
 */
import { writeDailyBrief, fallbackLine, fallbackOffer } from '../index';
import { gatherBrief } from '../data';
import { writeBrief } from '../writer';
import {
  appendMessages,
  ensureThread,
  patchThreadMeta,
  supersedeUnseen,
  threadMessages,
} from '../thread';

jest.mock('../data', () => ({ gatherBrief: jest.fn(), minutesIn: jest.fn() }));
jest.mock('../writer', () => ({ writeBrief: jest.fn(), BRIEF_PROMPT_VERSION: 'test' }));
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

  it('still arrives when every line failed the ID check, and still asks the question', async () => {
    gatherBrief.mockResolvedValue(
      day({ question: { id: 'q1', question: 'Is the haircut Friday?', choices: ['Yes', 'No'] } }),
    );
    writeBrief.mockResolvedValue({
      model: 'gemini',
      lines: [],
      dropped: [{ text: 'Your 3pm with Bob', bad: ['c9'] }],
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
