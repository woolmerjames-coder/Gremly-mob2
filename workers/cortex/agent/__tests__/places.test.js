/**
 * @jest-environment node
 */
// Worlds and Chapters on the agent (Worlds rebuild, stage 2): what Gremly is
// told of them, with ids and the rules for working with them; propose_changes
// changing them only for an app build that can apply that; and the chat job
// left as it was.

import { PLACES_RULES, itemKeysFor, placesContext, readPlaces } from '../places.js';
import { SURFACES, surfaceOf } from '../surfaces.js';
import { runTool, toolsFor } from '../tools/index.js';

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const TODAY = '2026-10-08';
const W = (n) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const C = (n) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const TODO = '11111111-1111-4111-8111-111111111111';

const worlds = [
  {
    id: W(1),
    name: 'travel',
    display_name: 'Travel',
    phase: 'active',
    card_subtitle: 'Trips and time away',
  },
  { id: W(2), name: 'Home', display_name: null, phase: 'active' },
  { id: W(3), name: 'Old band', phase: 'archived' },
  { id: W(4), name: 'Candidate', phase: 'candidate' },
];
const chapters = [
  {
    id: C(1),
    title: 'Lisbon trip',
    phase: 'upcoming',
    start_date: '2026-11-20',
    end_date: '2026-11-22',
    primary_world_id: W(1),
    closed_at: null,
  },
  {
    id: C(2),
    title: 'Garden fence',
    phase: 'active',
    end_date: '2026-10-01',
    primary_world_id: W(2),
    closed_at: null,
  },
  {
    id: C(3),
    title: 'Summer move',
    phase: 'closed',
    end_date: '2026-08-30',
    primary_world_id: W(2),
    closed_at: '2026-09-01T00:00:00Z',
  },
  {
    id: C(4),
    title: 'Gremly only suggested this',
    phase: 'suggested',
    primary_world_id: W(2),
    closed_at: null,
  },
];

function fakeDb({ items = [] } = {}) {
  const asked = [];
  return {
    asked,
    select: async (path) => {
      asked.push(path);
      if (path.startsWith('worlds?'))
        return path.includes('select=id,name,display_name&') ? worlds : worlds;
      if (path.startsWith('chapters?')) return chapters;
      if (path.startsWith('gremly_questions?'))
        return [{ proposed_change: { type: 'start', title: 'Kitchen redo' }, topic: 'kitchen' }];
      if (path.startsWith('todos?')) return items.filter((i) => path.includes(i.id));
      return [];
    },
    rpc: async () => [],
  };
}
const ctxWith = (db, surface) => ({
  userId: USER,
  today: TODAY,
  timezone: 'UTC',
  db,
  cache: new Map(),
  surface,
});

describe('what Gremly is told', () => {
  it('names their Worlds and Chapters with ids, how he works with them, and what they said no to', async () => {
    const places = await readPlaces(ctxWith(fakeDb()));
    const text = placesContext(places, TODAY);
    expect(text).toContain(PLACES_RULES);
    expect(text).toContain(`- Travel (id ${W(1)}): Trips and time away`);
    expect(text).toContain(`- Home (id ${W(2)})`);
    expect(text).toContain(`Worlds they hid: Old band (id ${W(3)})`);
    // the old classifier's candidates and suggested Chapters are not theirs yet
    expect(text).not.toContain('Candidate');
    expect(text).not.toContain('only suggested');
    expect(text).toContain(`- Lisbon trip (id ${C(1)}), in Travel, Fri 20 Nov to Sun 22 Nov`);
    expect(text).toContain(`- Garden fence (id ${C(2)}), in Home, its date passed on Thu 1 Oct`);
    expect(text).toContain(
      `Chapters closed, most recent first:\n- Summer move (id ${C(3)}), in Home`,
    );
    expect(text).toContain('Chapters Gremly offered that they said no to: Kitchen redo');
  });

  it('reads them once a turn', async () => {
    const db = fakeDb();
    const ctx = ctxWith(db);
    await readPlaces(ctx);
    await readPlaces(ctx);
    expect(db.asked.filter((p) => p.startsWith('worlds?'))).toHaveLength(1);
  });

  it('keeps the chat job as it is, and changes only the tool set for a build that can apply them', () => {
    const plain = surfaceOf('chat');
    const withPlaces = surfaceOf('chat', undefined, { places: true });
    expect(withPlaces.job).toBe(plain.job);
    expect(withPlaces.toolSet).toBe('chat_places');
    expect(surfaceOf('chat', 'week_ease', { places: true }).toolSet).toBe('chat_ease_places');
    expect(surfaceOf('chat', 'week', { places: true }).toolSet).toBe('chat_places');
    // today's thread is not offered them
    expect(surfaceOf('brief', undefined, { places: true })).toBe(SURFACES.brief);
  });
});

describe('propose_changes', () => {
  const describedTypes = (surface) => {
    const tool = toolsFor(['propose_changes'], surface)[0];
    return tool.parameters.properties.changes.items.properties.type.enum;
  };

  it('offers Worlds and Chapters only to a build that can apply them', () => {
    expect(describedTypes('chat')).toEqual(['todo', 'habit', 'note']);
    expect(describedTypes('chat_places')).toEqual(['todo', 'habit', 'note', 'chapter', 'world']);
    expect(describedTypes('chat_ease_places')).toContain('world');
    const ops = toolsFor(['propose_changes'], 'chat_places')[0].parameters.properties.changes.items
      .properties.op.enum;
    expect(ops).toEqual(expect.arrayContaining(['close', 'merge']));
    expect(ops).not.toContain('delete');
  });

  it('puts a new Chapter with what belongs in it on the card', async () => {
    const db = fakeDb({ items: [{ id: TODO }] });
    const r = await runTool(ctxWith(db, 'chat_places'), 'propose_changes', {
      changes: [
        {
          op: 'add',
          type: 'chapter',
          fields: {
            name: 'Half marathon',
            world: W(2),
            end_day: '2026-11-15',
            items: [{ type: 'todo', id: TODO }],
          },
        },
        { op: 'close', type: 'chapter', id: C(2) },
        { op: 'merge', type: 'world', id: W(2), into: W(3) },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.result.changes.map((c) => [c.op, c.type])).toEqual([
      ['add', 'chapter'],
      ['close', 'chapter'],
    ]);
    expect(r.result.dropped).toEqual([{ cid: 'c3', reason: 'hidden_world' }]);
    expect(r.text).toContain(
      'add chapter “Half marathon”: in Home; date Sun 15 Nov; gathering 1 of their items',
    );
    expect(r.text).toContain('close chapter “Garden fence”');
    expect(r.text).toContain('that World is hidden');
  });

  it('drops them for a build that cannot apply them', async () => {
    const r = await runTool(ctxWith(fakeDb(), 'chat'), 'propose_changes', {
      changes: [{ op: 'close', type: 'chapter', id: C(2) }],
    });
    expect(r.result.changes).toEqual([]);
    expect(r.result.dropped[0].reason).toBe('unknown_type');
  });

  it('only gathers items of theirs', async () => {
    const db = fakeDb({ items: [{ id: TODO }] });
    const keys = await itemKeysFor(ctxWith(db), [
      { type: 'todo', id: TODO },
      { type: 'todo', id: 'not-an-id' },
      { type: 'world', id: TODO },
    ]);
    expect([...keys]).toEqual([`todo:${TODO}`]);
  });
});
