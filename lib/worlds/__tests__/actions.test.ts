import { createWorldsActions, openPhase, type WorldsData } from '../actions';
import type { Chapter, DropChapterLink, DropWorldLink, World } from '../../supabase/types';

type Op = { table: string; kind?: string; payload?: unknown; where: Array<[string, unknown]> };
const mockOps: Op[] = [];
const mockFail = { kind: null as string | null };
const mockTold: Array<{ table: string; id: string }> = [];

jest.mock('../../supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const op: Op = { table, where: [] };
      mockOps.push(op);
      const chain: Record<string, unknown> = {};
      const set = (kind: string) => (payload?: unknown) => {
        op.kind = kind;
        if (payload !== undefined) op.payload = payload;
        return chain;
      };
      Object.assign(chain, {
        update: set('update'),
        insert: set('insert'),
        upsert: set('upsert'),
        delete: set('delete'),
        select: () => chain,
        single: () => chain,
        eq: (k: string, v: unknown) => {
          op.where.push([k, v]);
          return chain;
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          const out =
            mockFail.kind === op.kind
              ? { data: null, error: { message: 'the write failed' } }
              : op.kind === 'insert'
                ? {
                    data: {
                      id: `new-${op.table}`,
                      created_at: '2026-10-08T00:00:00Z',
                      ...(op.payload as object),
                    },
                    error: null,
                  }
                : { data: null, error: null };
          return Promise.resolve(out).then(res, rej);
        },
      });
      return chain;
    },
  },
}));

jest.mock('../../cortex/CortexClient', () => ({
  callWorldsChanged: (x: { table: string; id: string }) => {
    mockTold.push(x);
    return Promise.resolve({ ok: true });
  },
  callChapterMemory: () =>
    Promise.resolve({ ok: true, data: { ok: true, memory: 'You went.', field: 'epigraph' } }),
}));

const world = (o: Partial<World>): World =>
  ({
    id: 'w1',
    name: 'Home',
    display_name: 'Home',
    phase: 'active',
    mascot_slug: 'cozy_gremly',
    card_subtitle: 'Old line',
    card_subtitle_source: 'words',
    card_subtitle_offered: null,
    ...o,
  }) as World;
const chapter = (o: Partial<Chapter>): Chapter =>
  ({
    id: 'c1',
    title: 'Trip',
    phase: 'active',
    closed_at: null,
    start_date: null,
    end_date: null,
    primary_world_id: 'w1',
    ...o,
  }) as Chapter;

function store(init: Partial<WorldsData>) {
  let state: WorldsData = {
    userId: 'u1',
    worlds: [],
    chapters: [],
    dropWorldLinks: [],
    dropChapterLinks: [],
    ...init,
  };
  const set = (fn: (s: WorldsData) => Partial<WorldsData>) => {
    state = { ...state, ...fn(state) };
  };
  const get = () => state;
  return { actions: createWorldsActions(set, get), get };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockOps.length = 0;
  mockTold.length = 0;
  mockFail.kind = null;
});

describe('changing a World by hand', () => {
  it('renames it at once, writes it, tells Gremly, and Undo puts the old name back', async () => {
    const { actions, get } = store({ worlds: [world({})] });
    const undo = await actions.renameWorld('w1', '  Our   home ');
    expect(get().worlds[0].display_name).toBe('Our home');
    expect(mockOps[0]).toMatchObject({
      table: 'worlds',
      kind: 'update',
      payload: { name: 'Our home', display_name: 'Our home' },
    });
    await flush();
    expect(mockTold).toEqual([{ table: 'worlds', id: 'w1' }]);
    await undo();
    expect(get().worlds[0].display_name).toBe('Home');
  });

  it('puts the screen back and says so when the write fails', async () => {
    const { actions, get } = store({ worlds: [world({})] });
    mockFail.kind = 'update';
    await expect(actions.renameWorld('w1', 'Elsewhere')).rejects.toThrow('the write failed');
    expect(get().worlds[0].display_name).toBe('Home');
  });

  it('marks words the person wrote as theirs, and can take Gremly’s offered version instead', async () => {
    const { actions, get } = store({ worlds: [world({})] });
    await actions.setWorldWords('w1', 'Mine now');
    expect(get().worlds[0]).toMatchObject({
      card_subtitle: 'Mine now',
      card_subtitle_source: 'user',
    });
    const offered = store({
      worlds: [world({ card_subtitle_source: 'user', card_subtitle_offered: 'His idea' })],
    });
    await offered.actions.takeOfferedWorldWords('w1');
    expect(offered.get().worlds[0]).toMatchObject({
      card_subtitle: 'His idea',
      card_subtitle_source: 'words',
      card_subtitle_offered: null,
    });
  });

  it('hides a World by archiving it', async () => {
    const { actions, get } = store({ worlds: [world({})] });
    const undo = await actions.hideWorld('w1');
    expect(get().worlds[0].phase).toBe('archived');
    await undo();
    expect(get().worlds[0].phase).toBe('active');
  });

  it('deletes a World without losing its Chapters, and Undo brings it all back', async () => {
    const links = [{ drop_id: 'n1', drop_type: 'note', world_id: 'w1' }] as DropWorldLink[];
    const { actions, get } = store({
      worlds: [world({}), world({ id: 'w2', name: 'Work', display_name: 'Work' })],
      chapters: [chapter({})],
      dropWorldLinks: links,
    });
    const undo = await actions.deleteWorld('w1', 'w2');
    expect(get().worlds.map((w) => w.id)).toEqual(['w2']);
    expect(get().chapters[0].primary_world_id).toBe('w2');
    expect(get().dropWorldLinks).toEqual([]);
    await undo();
    expect(
      get()
        .worlds.map((w) => w.id)
        .sort(),
    ).toEqual(['w1', 'w2']);
    expect(get().chapters[0].primary_world_id).toBe('w1');
    expect(get().dropWorldLinks).toHaveLength(1);
  });

  it('merges two Worlds into the one kept, and Undo separates them again', async () => {
    const { actions, get } = store({
      worlds: [world({}), world({ id: 'w2', name: 'Home too', display_name: 'Home too' })],
      chapters: [chapter({ primary_world_id: 'w2' })],
      dropWorldLinks: [
        { drop_id: 'a', drop_type: 'todo', world_id: 'w2', assigned_by: 'classifier' },
        { drop_id: 'b', drop_type: 'todo', world_id: 'w2', assigned_by: 'user' },
        { drop_id: 'b', drop_type: 'todo', world_id: 'w1', assigned_by: 'classifier' },
      ] as DropWorldLink[],
    });
    const undo = await actions.mergeWorlds('w1', 'w2');
    expect(get().worlds.map((w) => w.id)).toEqual(['w1']);
    expect(get().chapters[0].primary_world_id).toBe('w1');
    expect(
      get()
        .dropWorldLinks.map((l) => `${l.drop_id}:${l.world_id}`)
        .sort(),
    ).toEqual(['a:w1', 'b:w1']);
    await undo();
    expect(get().worlds).toHaveLength(2);
    expect(get().chapters[0].primary_world_id).toBe('w2');
    expect(
      get()
        .dropWorldLinks.map((l) => `${l.drop_id}:${l.world_id}`)
        .sort(),
    ).toEqual(['a:w2', 'b:w1', 'b:w2']);
  });
});

describe('Chapters by hand', () => {
  it('makes a Chapter set for later, with the items that belong placed as the person’s', async () => {
    const { actions, get } = store({ worlds: [world({})] });
    const { chapter: made, undo } = await actions.makeChapter({
      title: 'Lisbon',
      worldId: 'w1',
      startDate: '2099-05-01',
      endDate: '2099-05-05',
      items: [{ id: 't1', type: 'todo' }],
    });
    expect(made).toMatchObject({
      title: 'Lisbon',
      phase: 'upcoming',
      title_source: 'user',
      source: 'user',
    });
    expect(get().dropChapterLinks).toMatchObject([
      { drop_id: 't1', chapter_id: made.id, assigned_by: 'user' },
    ]);
    expect(get().dropWorldLinks).toMatchObject([
      { drop_id: 't1', world_id: 'w1', assigned_by: 'user' },
    ]);
    await undo();
    expect(get().chapters).toEqual([]);
    expect(get().dropChapterLinks).toEqual([]);
    expect(get().dropWorldLinks).toEqual([]);
  });

  it('closes a Chapter, writes its memory when asked, and reopens it', async () => {
    const { actions, get } = store({ chapters: [chapter({ phase: 'active' })] });
    const undo = await actions.closeChapter('c1');
    expect(get().chapters[0].phase).toBe('closed');
    expect(get().chapters[0].closed_at).toBeTruthy();
    expect(await actions.askForMemory('c1')).toBe('You went.');
    expect(get().chapters[0]).toMatchObject({ epigraph: 'You went.', epigraph_source: 'memory' });
    await undo();
    expect(get().chapters[0]).toMatchObject({ phase: 'active', closed_at: null });
  });

  it('reopens by its dates, and refuses an end before the start', async () => {
    const { actions, get } = store({
      chapters: [chapter({ phase: 'closed', closed_at: 'x', start_date: '2099-01-01' })],
    });
    await actions.reopenChapter('c1');
    expect(get().chapters[0].phase).toBe('upcoming');
    await expect(actions.setChapterDates('c1', '2099-02-01', '2099-01-01')).rejects.toThrow(
      'The end comes before the start',
    );
  });

  it('deletes a Chapter but nothing in it, and Undo puts it back with its links', async () => {
    const links = [{ drop_id: 't1', drop_type: 'todo', chapter_id: 'c1' }] as DropChapterLink[];
    const { actions, get } = store({ chapters: [chapter({})], dropChapterLinks: links });
    const undo = await actions.deleteChapter('c1');
    expect(get().chapters).toEqual([]);
    expect(get().dropChapterLinks).toEqual([]);
    await undo();
    expect(get().chapters).toHaveLength(1);
    expect(get().dropChapterLinks).toHaveLength(1);
  });

  it('wears its World’s Gremly again when its own is taken off', async () => {
    const { actions, get } = store({
      chapters: [chapter({ mascot_slug: 'beach_gremly', mascot_slug_source: 'user' })],
    });
    await actions.setChapterGremly('c1', null);
    expect(get().chapters[0]).toMatchObject({ mascot_slug: null, mascot_slug_source: null });
  });
});

describe('placing an item', () => {
  it('Undo puts back the filing that was there before', async () => {
    const before = {
      drop_id: 't1',
      drop_type: 'todo',
      chapter_id: 'c1',
      assigned_by: 'classifier',
    } as DropChapterLink;
    const { actions, get } = store({
      worlds: [world({})],
      chapters: [chapter({})],
      dropChapterLinks: [before],
    });
    const undo = await actions.placeItem({ id: 't1', type: 'todo' }, { chapterId: 'c1' });
    expect(get().dropChapterLinks).toMatchObject([{ assigned_by: 'user' }]);
    await undo();
    expect(get().dropChapterLinks).toEqual([before]);
    expect(get().dropWorldLinks).toEqual([]);
  });
});

describe('the phase of an open Chapter', () => {
  it('is set for later until it starts', () => {
    expect(openPhase('2099-01-01', '2026-10-08')).toBe('upcoming');
    expect(openPhase('2026-10-08', '2026-10-08')).toBe('active');
    expect(openPhase(null, '2026-10-08')).toBe('active');
  });
});
