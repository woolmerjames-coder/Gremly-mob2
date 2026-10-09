/**
 * @jest-environment node
 *
 * Gremly's read of their life as background for the narrower writers (18 Oct):
 * given only when the switch gives it to that writer, never as a record, the
 * threads that matter most first. Made up Life Maps only.
 */
import { LIFE_MAP_WRITERS, lifeMapBackgroundOn, lifeMapLines, lifeMapSection, loadLifeMapLines } from '../lifeMap';
import { readerRequest } from '../reader';
import { reviewRequest } from '../review';
import { questionSetRequest } from '../peopleQuestions';
import { closeRequest } from '../chapterQuestions';
import { renderPersonWords, personWordsPrompt } from '../personWords';
import { renderWords, wordsSystemPrompt } from '../words';
import { memorySystemPrompt } from '../memory';
import { memoryDb } from './memoryDb.js';

const MAP = {
  domains: [
    {
      name: 'Home',
      threads: [
        { name: 'The allotment', importance: 'medium', attention: 'background', status: 'steady', lifecycle: 'active', last_activity: '2026-11-01', summary: 'They grow beans on a plot by the river.', recent_update: 'They dug the beds.' },
        { name: 'Old flat', importance: 'low', status: 'done', lifecycle: 'archived', last_activity: '2026-01-01', summary: 'They moved out.' },
        { name: 'No note', importance: 'high', lifecycle: 'active', last_activity: '2026-11-05', summary: '' },
      ],
    },
    {
      name: 'Work',
      threads: [
        { name: 'The bakery', importance: 'high', attention: 'front_of_mind', status: 'busy', momentum: 'picking up', lifecycle: 'active', last_activity: '2026-11-03', summary: 'They are opening a bakery in spring.' },
        { name: 'Night classes', importance: 'medium', status: 'quiet', lifecycle: 'dormant', last_activity: '2026-11-04', summary: 'They took a pastry course.' },
      ],
    },
  ],
};

describe('the switch', () => {
  it('gives it to every writer on "on", to the writers listed, and to none otherwise', () => {
    for (const w of LIFE_MAP_WRITERS) expect(lifeMapBackgroundOn({ LIFE_MAP_BACKGROUND: 'on' }, w)).toBe(true);
    expect(lifeMapBackgroundOn({ LIFE_MAP_BACKGROUND: 'words, memory' }, 'memory')).toBe(true);
    expect(lifeMapBackgroundOn({ LIFE_MAP_BACKGROUND: 'words, memory' }, 'reader')).toBe(false);
    for (const v of [undefined, '', 'off', 'yes']) expect(lifeMapBackgroundOn({ LIFE_MAP_BACKGROUND: v }, 'words')).toBe(false);
  });

  it('reads nothing while it does not give it', async () => {
    const d = memoryDb({ user_life_map: [{ user_id: 'u', life_map: MAP }] });
    expect(await loadLifeMapLines({ LIFE_MAP_BACKGROUND: 'off' }, d, 'u', 'words')).toEqual([]);
    expect(await loadLifeMapLines({ LIFE_MAP_BACKGROUND: 'reader' }, d, 'u', 'words')).toEqual([]);
    expect(await loadLifeMapLines({ LIFE_MAP_BACKGROUND: 'on' }, d, 'u', 'words')).toHaveLength(3);
    expect(await loadLifeMapLines({ LIFE_MAP_BACKGROUND: 'on' }, d, 'nobody', 'words')).toEqual([]);
  });
});

describe('the lines', () => {
  it('are the threads still active or quiet with a note, those that matter most first, then the latest', () => {
    const lines = lifeMapLines(MAP);
    expect(lines).toEqual([
      'Work / The bakery | matters high, front of mind, busy, picking up | last active 2026-11-03 | They are opening a bakery in spring.',
      'Work / Night classes | matters medium, quiet, no recent activity | last active 2026-11-04 | They took a pastry course.',
      'Home / The allotment | matters medium, background, steady | last active 2026-11-01 | They grow beans on a plot by the river. Lately: They dug the beds.',
    ]);
    expect(lifeMapLines(MAP, { most: 1 })).toHaveLength(1);
    expect(lifeMapLines(null)).toEqual([]);
  });

  it('are given as Gremly’s read, never a record, and not at all when there are none', () => {
    expect(lifeMapSection(['x'])).toMatch(/^GREMLY'S READ OF THEIR LIFE, NEVER A RECORD/);
    expect(lifeMapSection([])).toBe('');
  });
});

describe('each writer', () => {
  const lines = lifeMapLines(MAP);
  const person = { first_name: 'Alex', pronouns: null, identity: {} };

  it('is given the read and its rules only when there is one, and nothing changes when not', () => {
    const reader = (lifeMap) => readerRequest({ today: '2026-11-08', person, chunk: [], openFacts: [], people: [], waiting: [], tz: 'Europe/London', lifeMap });
    const review = (lifeMap) => reviewRequest({ today: '2026-11-08', person, facts: [], lifeMap });
    const people = (lifeMap) => questionSetRequest({ candidates: [], person, today: '2026-11-08', lifeMap });
    const close = (lifeMap) => closeRequest({ chapters: [], records: new Map(), worlds: [], person, today: '2026-11-08', lifeMap });
    const someone = { id: 'p1', name: 'Sam', relationship: 'brother', relationship_by: 'understood' };
    const personWords = (lifeMap) => ({ system: personWordsPrompt(person, { lifeMap: lifeMap.length > 0 }), user: renderPersonWords({ someone, note: 'n', facts: [], today: '2026-11-08', lifeMap }).text });
    const words = (lifeMap) => ({
      system: wordsSystemPrompt(person, { lifeMap: lifeMap.length > 0 }),
      user: renderWords({ kind: 'world', target: { id: 'w', name: 'Work' }, items: [], facts: [], peopleOf: new Map(), today: '2026-11-08', lifeMap }).text,
    });
    const memory = (lifeMap) => ({ system: memorySystemPrompt(person, { lifeMap: lifeMap.length > 0 }), user: '' });
    const flat = (x) => (typeof x === 'string' ? x : `${x.fixed}${x.varying || ''}`);
    for (const make of [reader, review, people, close, personWords, words, memory]) {
      const off = make([]);
      const on = make(lines);
      expect(flat(off.system)).not.toMatch(/GREMLY'S READ OF THEIR LIFE/);
      expect(off.user || '').not.toMatch(/NEVER A RECORD/);
      expect(flat(on.system)).toMatch(/GREMLY'S READ OF THEIR LIFE/);
      if (make !== memory) expect(on.user).toContain(lines[0]);
    }
    // who someone is says whose it is
    expect(personWords([]).user).toContain('their brother, as Gremly understood it from the records');
  });
});
