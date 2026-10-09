/**
 * Changes to Worlds and Chapters on a card (lib/changes/places): the words on
 * the card, and each one applied with the Worlds screens' own actions, with
 * one Undo, nothing written over that changed since, and nothing deleted.
 */
const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(async () => null),
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ thread: null, patchMeta: () => {} }) },
}));

import { applyChanges } from '../apply';
import { checkChange, type Change } from '../model';
import { buttonWords, doneWords, rowWords } from '../words';
import { clearWorldsNew, useWorldsDot } from '../../worlds/dot';

const undone: string[] = [];
const undo = (what: string) => jest.fn(async () => void undone.push(what));

function fresh() {
  undone.length = 0;
  Object.assign(mockState, {
    worlds: [
      { id: 'w1', name: 'Travel', display_name: 'Travel', phase: 'active' },
      { id: 'w2', name: 'Home', display_name: 'Home', phase: 'active' },
    ],
    chapters: [
      {
        id: 'c1',
        title: 'Lisbon trip',
        phase: 'upcoming',
        start_date: '2026-11-20',
        end_date: '2026-11-22',
        primary_world_id: 'w1',
        closed_at: null,
      },
    ],
    makeChapter: jest.fn(async () => ({ chapter: { id: 'c9' }, undo: undo('made chapter') })),
    makeWorld: jest.fn(async () => ({ world: { id: 'w9' }, undo: undo('made world') })),
    renameChapter: jest.fn(async () => undo('rename')),
    setChapterDates: jest.fn(async () => undo('dates')),
    moveChapter: jest.fn(async () => undo('move')),
    setChapterWords: jest.fn(async () => undo('words')),
    setChapterGremly: jest.fn(async () => undo('gremly')),
    closeChapter: jest.fn(async () => undo('close')),
    reopenChapter: jest.fn(async () => undo('reopen')),
    askForMemory: jest.fn(async () => 'A memory.'),
    renameWorld: jest.fn(async () => undo('rename world')),
    setWorldWords: jest.fn(async () => undo('world words')),
    setWorldGremly: jest.fn(async () => undo('world gremly')),
    mergeWorlds: jest.fn(async () => undo('merge')),
    hideWorld: jest.fn(async () => undo('hide')),
    unhideWorld: jest.fn(async () => undo('unhide')),
  });
}
beforeEach(fresh);

const places = {
  worlds: [
    { id: 'w1', name: 'Travel' },
    { id: 'w2', name: 'Home' },
  ],
};
function checked(raw: Record<string, any>, place?: Record<string, any>): Change {
  const r = checkChange(
    { cid: 'c1', ...raw },
    { today: '2026-10-08', places, place, itemKeys: ['todo:t1', 'note:n1'] },
  );
  if (!r.ok) throw new Error(r.reason);
  return r.change;
}

describe('the words', () => {
  it('says what each change to a Chapter does', () => {
    const start = checked({
      op: 'add',
      type: 'chapter',
      fields: {
        name: 'Half marathon',
        world: 'w2',
        end_day: '2026-11-15',
        items: [
          { type: 'todo', id: 't1' },
          { type: 'note', id: 'n1' },
        ],
      },
    });
    expect(rowWords(start)).toBe(
      'Start a Chapter “Half marathon”, in Home, Sun 15 Nov, with 2 of your things',
    );
    expect(buttonWords(start)).toBe('Yes, start it');
    expect(doneWords(start)).toBe('Started Half marathon.');

    const lisbon = mockState.chapters[0];
    expect(
      rowWords(
        checked({ op: 'change', type: 'chapter', id: 'c1', fields: { name: 'Lisbon' } }, lisbon),
      ),
    ).toBe('Rename Lisbon trip to “Lisbon”');
    expect(
      rowWords(
        checked({ op: 'change', type: 'chapter', id: 'c1', fields: { world: 'w2' } }, lisbon),
      ),
    ).toBe('Move Lisbon trip into Home');
    const dates = checked(
      { op: 'change', type: 'chapter', id: 'c1', fields: { end_day: '2026-11-24' } },
      lisbon,
    );
    expect(rowWords(dates)).toBe('Lisbon trip: Fri 20 to Tue 24 Nov');
    expect(buttonWords(dates)).toBe('Yes, change the dates');
    const close = checked({ op: 'close', type: 'chapter', id: 'c1' }, lisbon);
    expect(rowWords(close)).toBe('Close Lisbon trip, so it becomes part of your story');
    expect(doneWords(close)).toBe('Lisbon trip is closed and part of your story.');
  });

  it('says what each change to a World does', () => {
    const travel = mockState.worlds[0];
    expect(rowWords(checked({ op: 'add', type: 'world', fields: { name: 'Garden' } }))).toBe(
      'Start a World “Garden”',
    );
    const merge = checked({ op: 'merge', type: 'world', id: 'w1', into: 'w2' }, travel);
    expect(rowWords(merge)).toBe('Merge Travel into Home, with everything in it');
    expect(buttonWords(merge)).toBe('Yes, merge them');
    expect(rowWords(checked({ op: 'archive', type: 'world', id: 'w1' }, travel))).toBe(
      'Hide Travel. Nothing in it is deleted',
    );
  });
});

describe('applying', () => {
  it('starts a Chapter with what belongs in it, and Undo takes it away', async () => {
    const c = checked({
      op: 'add',
      type: 'chapter',
      fields: {
        name: 'Half marathon',
        world: 'w2',
        end_day: '2026-11-15',
        items: [{ type: 'todo', id: 't1' }],
      },
    });
    clearWorldsNew();
    const { outcomes, revertAll } = await applyChanges([c], { source: 'chat' });
    // something new in Worlds: the dot on its tab
    expect(useWorldsDot.getState().on).toBe(true);
    expect(mockState.makeChapter).toHaveBeenCalledWith({
      title: 'Half marathon',
      worldId: 'w2',
      startDate: null,
      endDate: '2026-11-15',
      gremly: null,
      items: [{ type: 'todo', id: 't1' }],
    });
    expect(outcomes[0]).toMatchObject({
      ok: true,
      createdId: 'c9',
      summary: 'Started Half marathon.',
    });
    await revertAll();
    expect(undone).toEqual(['made chapter']);
  });

  it('changes several things about a Chapter as one change with one Undo', async () => {
    const c = checked(
      {
        op: 'change',
        type: 'chapter',
        id: 'c1',
        fields: { name: 'Lisbon', end_day: '2026-11-24', world: 'w2' },
      },
      mockState.chapters[0],
    );
    const { outcomes, revertAll } = await applyChanges([c], { source: 'chat' });
    expect(outcomes[0].ok).toBe(true);
    expect(mockState.renameChapter).toHaveBeenCalledWith('c1', 'Lisbon');
    expect(mockState.setChapterDates).toHaveBeenCalledWith('c1', '2026-11-20', '2026-11-24');
    expect(mockState.moveChapter).toHaveBeenCalledWith('c1', 'w2');
    await revertAll();
    expect(undone).toEqual(['move', 'dates', 'rename']);
  });

  it('puts back what was done when a later step fails, and reports it', async () => {
    mockState.moveChapter = jest.fn(async () => {
      throw new Error('offline');
    });
    const c = checked(
      { op: 'change', type: 'chapter', id: 'c1', fields: { name: 'Lisbon', world: 'w2' } },
      mockState.chapters[0],
    );
    const { outcomes } = await applyChanges([c], { source: 'chat' });
    expect(outcomes[0]).toMatchObject({ ok: false, reason: 'failed', message: 'offline' });
    expect(undone).toEqual(['rename']);
  });

  it('leaves a Chapter alone that changed since the card was made', async () => {
    const c = checked(
      { op: 'change', type: 'chapter', id: 'c1', fields: { name: 'Lisbon' } },
      mockState.chapters[0],
    );
    mockState.chapters[0] = { ...mockState.chapters[0], title: 'Portugal' };
    const { outcomes } = await applyChanges([c], { source: 'chat' });
    expect(outcomes[0]).toMatchObject({ ok: false, reason: 'stale' });
    expect(mockState.renameChapter).not.toHaveBeenCalled();
  });

  it('closes a Chapter and asks for its memory', async () => {
    const c = checked({ op: 'close', type: 'chapter', id: 'c1' }, mockState.chapters[0]);
    const { revertAll } = await applyChanges([c], { source: 'chat' });
    expect(mockState.closeChapter).toHaveBeenCalledWith('c1');
    expect(mockState.askForMemory).toHaveBeenCalledWith('c1');
    await revertAll();
    expect(undone).toEqual(['close']);
  });

  it('merges, hides and makes Worlds, and says when one has gone', async () => {
    const travel = mockState.worlds[0];
    const merge = checked({ op: 'merge', type: 'world', id: 'w1', into: 'w2' }, travel);
    const hide = { ...checked({ op: 'archive', type: 'world', id: 'w1' }, travel), cid: 'c2' };
    const make = {
      ...checked({ op: 'add', type: 'world', fields: { name: 'Garden' } }),
      cid: 'c3',
    };
    const { outcomes } = await applyChanges([merge, hide, make], { source: 'chat' });
    expect(mockState.mergeWorlds).toHaveBeenCalledWith('w2', 'w1');
    expect(mockState.hideWorld).toHaveBeenCalledWith('w1');
    expect(mockState.makeWorld).toHaveBeenCalledWith({ name: 'Garden', gremly: 'gremly-mascot' });
    expect(outcomes.every((o) => o.ok)).toBe(true);

    mockState.chapters = [];
    const gone = checked(
      { op: 'reopen', type: 'chapter', id: 'c1' },
      {
        id: 'c1',
        title: 'Lisbon trip',
        phase: 'closed',
        closed_at: '2026-10-01T00:00:00Z',
      },
    );
    const r = await applyChanges([gone], { source: 'chat' });
    expect(r.outcomes[0]).toMatchObject({
      ok: false,
      reason: 'gone',
      message: 'That Chapter is no longer here.',
    });
  });
});
