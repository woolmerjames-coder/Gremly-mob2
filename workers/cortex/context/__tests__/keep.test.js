/**
 * @jest-environment node
 */
// Save from chat (Worlds rebuild, stage 2): after a reply, a helper call
// decides whether it is worth a Save button and where it belongs. Code keeps
// only lines that are in the reply as written, and only a place of theirs.

import { judgeKeep, keepFrom, KEEP_VERSION } from '../keep.js';

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const id = (n) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;
const TRAVEL = id(1);
const HIDDEN = id(2);
const TRIP = id(3);
const DONE = id(4);

const worlds = [
  { id: TRAVEL, name: 'Travel', display_name: 'Travel', phase: 'active' },
  { id: HIDDEN, name: 'Old band', display_name: 'Old band', phase: 'archived' },
];
const chapters = [
  { id: TRIP, title: 'Lisbon trip', phase: 'active', primary_world_id: TRAVEL },
  { id: DONE, title: 'Summer move', phase: 'closed', closed_at: '2026-08-30T12:00:00Z' },
];

const REPLY = `Here is a short list to start from:
- **Tram 28** through Alfama, early
- Pastéis de Belém and the monastery
- A day out to Sintra`;

describe('the Save button from the helper’s answer', () => {
  it('keeps the lines that are in the reply, without their marks, and the Chapter named', () => {
    const out = keepFrom(
      {
        keep: true,
        kind: 'note',
        title: '  Lisbon   ideas ',
        lines: [
          '- Tram 28 through Alfama, early',
          '**Pastéis de Belém** and the monastery',
          'A day out to Sintra',
          'Fado in Bairro Alto',
        ],
        place: TRIP,
      },
      { reply: REPLY, worlds, chapters },
    );
    expect(out).toEqual({
      kind: 'note',
      title: 'Lisbon ideas',
      lines: [
        'Tram 28 through Alfama, early',
        'Pastéis de Belém and the monastery',
        'A day out to Sintra',
      ],
      place: { type: 'chapter', id: TRIP, name: 'Lisbon trip' },
      version: KEEP_VERSION,
    });
  });

  it('names a World they see, and no place that is closed, hidden or not theirs', () => {
    const base = { keep: true, kind: 'list', title: 'Lisbon', lines: ['A day out to Sintra'] };
    const ctx = { reply: REPLY, worlds, chapters };
    expect(keepFrom({ ...base, place: TRAVEL }, ctx).place).toEqual({
      type: 'world',
      id: TRAVEL,
      name: 'Travel',
    });
    expect(keepFrom({ ...base, place: HIDDEN }, ctx).place).toBeNull();
    expect(keepFrom({ ...base, place: DONE }, ctx).place).toBeNull();
    expect(keepFrom({ ...base, place: id(9) }, ctx).place).toBeNull();
    expect(keepFrom({ ...base, place: '' }, ctx).kind).toBe('list');
  });

  it('is nothing when it is not worth keeping, has no name, or none of it is in the reply', () => {
    const ctx = { reply: REPLY, worlds, chapters };
    expect(keepFrom({ keep: false, title: 'x', lines: ['A day out to Sintra'] }, ctx)).toBeNull();
    expect(keepFrom({ keep: true, title: ' ', lines: ['A day out to Sintra'] }, ctx)).toBeNull();
    expect(keepFrom({ keep: true, title: 'Lisbon', lines: ['Something made up'] }, ctx)).toBeNull();
    expect(keepFrom(null, ctx)).toBeNull();
  });
});

function fakeDb() {
  return {
    select: async (path) => {
      if (path.startsWith('worlds')) return worlds;
      if (path.startsWith('chapters')) return chapters;
      return [];
    },
  };
}

const answer = (content) => async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
});

describe('the check after a reply', () => {
  it('asks the helper with their open Chapters, the Worlds they see, the page and the card', async () => {
    const helperFetch = jest.fn(
      answer({
        keep: true,
        kind: 'note',
        title: 'Lisbon ideas',
        lines: ['A day out to Sintra'],
        place: '',
      }),
    );
    const out = await judgeKeep({
      env: {},
      userId: USER,
      message: 'Ideas for Lisbon?',
      reply: REPLY,
      page: { type: 'chapter', id: TRIP, title: 'Lisbon trip' },
      card: true,
      deps: { db: fakeDb(), helperFetch },
    });
    expect(out.lines).toEqual(['A day out to Sintra']);
    const [job, body] = helperFetch.mock.calls[0];
    expect(job).toBe('keep_offer');
    const prompt = body.messages[0].content;
    expect(prompt).toContain(`Lisbon trip (id ${TRIP}), in Travel`);
    expect(prompt).toContain(`Travel (id ${TRAVEL})`);
    expect(prompt).not.toContain('Old band');
    expect(prompt).not.toContain('Summer move');
    expect(prompt).toContain(`their Chapter Lisbon trip (id ${TRIP})`);
    expect(prompt).toContain('came with changes to their things on a card');
  });

  it('asks nothing without a person, a message or a reply', async () => {
    const helperFetch = jest.fn();
    const deps = { db: fakeDb(), helperFetch };
    expect(await judgeKeep({ env: {}, userId: null, message: 'x', reply: 'y', deps })).toBeNull();
    expect(await judgeKeep({ env: {}, userId: USER, message: ' ', reply: 'y', deps })).toBeNull();
    expect(await judgeKeep({ env: {}, userId: USER, message: 'x', reply: '', deps })).toBeNull();
    expect(helperFetch).not.toHaveBeenCalled();
  });

  it('is nothing when the helper fails, answers badly or takes too long, and never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const base = { env: {}, userId: USER, message: 'x', reply: REPLY };
    expect(
      await judgeKeep({
        ...base,
        deps: { db: fakeDb(), helperFetch: async () => ({ ok: false }) },
      }),
    ).toBeNull();
    const bad = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
    });
    expect(await judgeKeep({ ...base, deps: { db: fakeDb(), helperFetch: bad } })).toBeNull();
    const boom = async () => {
      throw new Error('down');
    };
    expect(await judgeKeep({ ...base, deps: { db: fakeDb(), helperFetch: boom } })).toBeNull();
    const slow = () => new Promise(() => {});
    expect(
      await judgeKeep({ ...base, deps: { db: fakeDb(), helperFetch: slow, waitMs: 5 } }),
    ).toBeNull();
    warn.mockRestore();
  });
});
