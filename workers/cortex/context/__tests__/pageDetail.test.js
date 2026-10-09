/**
 * @jest-environment node
 */
// A World's or a Chapter's own chat (Worlds rebuild, stage 2): the page the
// app sends as the chat's anchor, and what is on it in words with ids.

import { fetchPageDetail, pageAnchorFrom } from '../pageDetail.js';

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const TODAY = '2026-10-08';
const id = (n) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;
const WORLD = id(1);
const CHAPTER = id(2);

function fakeDb() {
  const asked = [];
  return {
    asked,
    select: async (path) => {
      asked.push(path);
      if (path.startsWith('chapters?id=eq.'))
        return [
          {
            id: CHAPTER,
            title: 'Lisbon trip',
            phase: 'upcoming',
            start_date: '2026-11-20',
            end_date: '2026-11-22',
            primary_world_id: WORLD,
            card_subtitle: 'Three days, then Porto',
          },
        ];
      if (path.startsWith('chapters?primary_world_id='))
        return [
          {
            id: CHAPTER,
            title: 'Lisbon trip',
            phase: 'upcoming',
            start_date: '2026-11-20',
            end_date: '2026-11-22',
          },
          { id: id(9), title: 'Rome', phase: 'closed', closed_at: '2026-05-01T00:00:00Z' },
        ];
      if (path.startsWith('worlds?id=eq.')) return [{ id: WORLD, name: 'Travel', phase: 'active' }];
      if (path.startsWith('drop_chapter_links?chapter_id='))
        return [
          { drop_id: id(3), drop_type: 'todo' },
          { drop_id: id(4), drop_type: 'todo' },
          { drop_id: id(5), drop_type: 'note' },
        ];
      if (path.startsWith('drop_chapter_links?owner_id='))
        return [{ drop_id: id(3), drop_type: 'todo' }];
      if (path.startsWith('drop_world_links?'))
        return [
          { drop_id: id(3), drop_type: 'todo' },
          { drop_id: id(6), drop_type: 'todo' },
        ];
      if (path.startsWith('todos?'))
        return [
          { id: id(3), name: 'Book flights', due_day: '2026-10-09', completed_at: null },
          { id: id(4), name: 'Renew passport', completed_at: '2026-10-01T00:00:00Z' },
          { id: id(6), name: 'Buy a map', completed_at: null },
        ].filter((t) => path.includes(t.id));
      if (path.startsWith('notes?'))
        return [{ id: id(5), title: 'Packing', list_items: [{ id: 'a' }, { id: 'b' }] }];
      return [];
    },
  };
}

describe('the page a chat is on', () => {
  it('reads a World or a Chapter anchor, and nothing else', () => {
    expect(pageAnchorFrom({ id: CHAPTER, type: 'chapter', title: ' Lisbon ' })).toEqual({
      id: CHAPTER,
      type: 'chapter',
      title: 'Lisbon',
    });
    expect(pageAnchorFrom({ id: CHAPTER, type: 'todo', title: 'x' })).toBeNull();
    expect(pageAnchorFrom({ id: 'nope', type: 'world', title: 'x' })).toBeNull();
    expect(pageAnchorFrom(null)).toBeNull();
  });

  it('says what is on a Chapter, steps with ids, open ones first', async () => {
    const text = await fetchPageDetail(
      {},
      USER,
      { id: CHAPTER, type: 'chapter', title: 'Lisbon trip' },
      TODAY,
      { db: fakeDb() },
    );
    expect(text).toContain(
      `"Lisbon trip" (id ${CHAPTER}), in their World Travel (id ${WORLD}), Fri 20 Nov to Sun 22 Nov.`,
    );
    expect(text).toContain(
      'When they say this, it or here, they mean this Chapter, and a step or a note they add here belongs in it, so it is added with chapters set to this Chapter.',
    );
    expect(text).toContain('Its words: Three days, then Porto');
    expect(text).toContain(
      `Its steps, open ones first:\n- Book flights (todo, id ${id(3)}), due Fri 9 Oct (tomorrow)\n- Renew passport (todo, id ${id(4)}), done`,
    );
    expect(text).toContain(`- Packing (note, id ${id(5)}), a list of 2`);
  });

  it('says what is in a World: its Chapters, and its own todos in none of them', async () => {
    const text = await fetchPageDetail(
      {},
      USER,
      { id: WORLD, type: 'world', title: 'Travel' },
      TODAY,
      { db: fakeDb() },
    );
    expect(text).toContain(
      `"Travel" (id ${WORLD}). When they say this, it or here, they mean this World, and something they add here belongs in it, so it is added with worlds set to this World.`,
    );
    expect(text).toContain(
      `Its Chapters now:\n- Lisbon trip (id ${CHAPTER}), Fri 20 Nov to Sun 22 Nov`,
    );
    expect(text).toContain('Its closed Chapters: Rome');
    expect(text).toContain(
      `Its own todos, in none of its Chapters:\n- Buy a map (todo, id ${id(6)})`,
    );
    expect(text).not.toContain('Book flights');
  });

  it('reads only their own rows, and leaves the section out when it cannot', async () => {
    const db = fakeDb();
    await fetchPageDetail({}, USER, { id: CHAPTER, type: 'chapter', title: 'x' }, TODAY, { db });
    expect(db.asked.every((p) => p.includes(`owner_id=eq.${USER}`))).toBe(true);
    const broken = {
      select: async () => {
        throw new Error('down');
      },
    };
    expect(
      await fetchPageDetail({}, USER, { id: CHAPTER, type: 'chapter', title: 'x' }, TODAY, {
        db: broken,
      }),
    ).toBe('');
  });
});
