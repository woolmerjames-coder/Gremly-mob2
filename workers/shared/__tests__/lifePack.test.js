/**
 * @jest-environment node
 *
 * Their life right now (workers/shared/lifePack.js, data fabric stage 4d):
 * code gathers, dates and counts what a friend would know on a day; which of
 * it matters is always the writer's. Every name and record here is made up.
 */
import { JUST_HAPPENED_RULE, loadLifePack, lifePackText } from '../lifePack.js';
import { memoryDb } from '../../inngest-jobs/context/__tests__/memoryDb.js';

const U = 'u-1';
const TODAY = '2026-11-12';
const fact = (id, statement, over = {}) => ({
  id,
  user_id: U,
  statement,
  kind: 'event',
  timing: 'day',
  about_date: null,
  about_date_end: null,
  state: 'current',
  private: false,
  health: false,
  observed_at: '2026-10-01T09:00:00Z',
  last_confirmed_at: '2026-10-01T09:00:00Z',
  item_table: null,
  item_done: false,
  item_cancelled: false,
  ...over,
});

function tables() {
  return {
    life_facts: [
      // said a year ago: back on its day
      fact('f-anniv', 'Their anniversary with Eli.', {
        timing: 'yearly',
        about_date: '2025-11-12',
      }),
      fact('f-gig', 'A gig at the Anthem.', { about_date: '2026-11-11', state: 'planned' }),
      fact('f-trip', 'A work trip to Lisbon.', {
        timing: 'span',
        about_date: '2026-11-17',
        about_date_end: '2026-11-20',
        state: 'planned',
      }),
      fact('f-far', 'A wedding in the spring.', { about_date: '2027-04-10', state: 'planned' }),
      // a standing fact keeps the day it was said, and is read with none
      fact('f-swim', 'Swims before work.', {
        kind: 'routine',
        timing: 'standing',
        about_date: '2026-10-19',
      }),
      fact('f-worry', 'Waiting to hear about a grant.', {
        kind: 'situation',
        timing: 'span',
        observed_at: '2026-11-08T09:00:00Z',
      }),
      fact('f-old', 'Something said long ago.', { observed_at: '2026-09-01T09:00:00Z' }),
      fact('f-dentist', 'A dentist check up.', {
        about_date: '2026-11-14',
        state: 'planned',
        health: true,
      }),
    ],
    synced_calendar_events: [
      {
        id: 'c-gig',
        owner_id: U,
        title: 'Big night out',
        start_at: '2026-11-12T01:00:00Z',
        end_at: '2026-11-12T04:00:00Z',
        is_all_day: false,
        archived: false,
        cancelled_at: null,
      },
    ],
    life_people: [
      {
        id: 'p-eli',
        user_id: U,
        name: 'Eli',
        relationship: null,
        merged_into: null,
        hidden_at: null,
      },
      {
        id: 'p-mira',
        user_id: U,
        name: 'Mira',
        relationship: 'sister',
        merged_into: null,
        hidden_at: null,
      },
      {
        id: 'p-none',
        user_id: U,
        name: 'Kit',
        relationship: null,
        merged_into: null,
        hidden_at: null,
      },
      {
        id: 'p-mum',
        user_id: U,
        name: null,
        relationship: 'mum',
        merged_into: null,
        hidden_at: null,
      },
    ],
    life_fact_people: [
      { user_id: U, fact_id: 'f-anniv', person_id: 'p-eli' },
      { user_id: U, fact_id: 'f-gig', person_id: 'p-eli' },
      { user_id: U, fact_id: 'f-worry', person_id: 'p-mira' },
      { user_id: U, fact_id: 'f-trip', person_id: 'p-mum' },
    ],
  };
}

const VIEWS = { life_facts_now: 'life_facts' };
function client(t) {
  const mem = memoryDb(t);
  const route = (path) => {
    const [table, q] = path.split('?');
    return `${VIEWS[table] || table}?${q || ''}`;
  };
  return { select: (path) => mem.select(route(path)) };
}

describe('what is no longer so, and what comes round', () => {
  const at = (rows) => ({
    life_facts: rows,
    synced_calendar_events: [],
    life_people: [],
    life_fact_people: [],
  });

  it('leaves out what a gone, archived or cancelled item said, and tells an item once', async () => {
    const t = at([
      fact('f-new', 'Dentist moved to Friday.', {
        about_date: '2026-11-13',
        state: 'planned',
        item_table: 'todos',
        item_id: 't-1',
        last_confirmed_at: '2026-11-10T09:00:00Z',
      }),
      fact('f-old', 'Dentist on Thursday.', {
        about_date: '2026-11-12',
        state: 'planned',
        item_table: 'todos',
        item_id: 't-1',
        last_confirmed_at: '2026-11-01T09:00:00Z',
      }),
      fact('f-gone', 'Pick up the parcel.', {
        about_date: '2026-11-14',
        state: 'planned',
        item_table: 'todos',
        item_id: 't-2',
        item_gone: true,
      }),
      fact('f-archived', 'Paint the hall.', {
        about_date: '2026-11-15',
        state: 'planned',
        item_table: 'todos',
        item_id: 't-3',
        item_archived: true,
      }),
      fact('f-done', 'Renew the passport.', {
        about_date: '2026-11-16',
        state: 'planned',
        item_table: 'todos',
        item_id: 't-4',
        item_done: true,
      }),
    ]);
    // latest first, as the read orders them
    t.life_facts.sort((a, b) => b.last_confirmed_at.localeCompare(a.last_confirmed_at));
    const pack = await loadLifePack(client(t), U, { today: TODAY, tz: 'America/New_York' });
    const all = [...pack.yesterday.facts, ...pack.today_facts, ...pack.ahead, ...pack.lately].map(
      (f) => f.id,
    );
    expect(all).toContain('f-new');
    expect(all).not.toContain('f-old');
    expect(all).not.toContain('f-gone');
    expect(all).not.toContain('f-archived');
    expect(pack.ahead.map((f) => f.id)).not.toContain('f-done');
  });

  it('gives a yearly day that fell yesterday to yesterday, and keeps one said lately that is far off', async () => {
    const pack = await loadLifePack(
      client(
        at([
          fact('f-bday', "Ana's birthday.", { timing: 'yearly', about_date: '2024-11-11' }),
          fact('f-far', "Mum's birthday.", {
            timing: 'yearly',
            about_date: '2026-03-03',
            observed_at: '2026-11-10T09:00:00Z',
          }),
        ]),
      ),
      U,
      { today: TODAY, tz: 'America/New_York' },
    );
    expect(pack.yesterday.facts.map((f) => [f.id, f.about_date, f.every_year])).toEqual([
      ['f-bday', '2026-11-11', true],
    ]);
    expect(pack.lately.map((f) => [f.id, f.about_date])).toEqual([['f-far', '2027-03-03']]);
  });
});

describe('their life right now', () => {
  it('brings a yearly date round on its day, and reads a standing fact with no date', async () => {
    const pack = await loadLifePack(client(tables()), U, { today: TODAY, tz: 'America/New_York' });
    expect(pack.today_facts.map((f) => [f.id, f.about_date, f.every_year])).toEqual([
      ['f-anniv', '2026-11-12', true],
    ]);
    expect(pack.standing.map((f) => [f.id, f.about_date])).toEqual([['f-swim', null]]);
  });

  it('gives yesterday its calendar and what ended then, and what is close ahead in date order', async () => {
    const pack = await loadLifePack(client(tables()), U, { today: TODAY, tz: 'America/New_York' });
    expect(pack.yesterday.calendar.map((c) => c.title)).toEqual(['Big night out']);
    expect(pack.yesterday.facts.map((f) => f.id)).toEqual(['f-gig']);
    expect(pack.ahead.map((f) => f.id)).toEqual(['f-dentist', 'f-trip']);
  });

  it('keeps what was said lately, and leaves out what is long past or far ahead', async () => {
    const pack = await loadLifePack(client(tables()), U, { today: TODAY, tz: 'America/New_York' });
    expect(pack.lately.map((f) => f.id)).toEqual(['f-worry']);
    const all = [
      ...pack.yesterday.facts,
      ...pack.today_facts,
      ...pack.ahead,
      ...pack.lately,
      ...pack.standing,
    ].map((f) => f.id);
    expect(all).not.toContain('f-old');
    expect(all).not.toContain('f-far');
    // each fact in one place
    expect(new Set(all).size).toBe(all.length);
  });

  it('counts the people who come up most, and leaves out anyone no fact is about', async () => {
    const pack = await loadLifePack(client(tables()), U, { today: TODAY, tz: 'America/New_York' });
    expect(pack.people.map((p) => [p.name || p.relationship, p.facts])).toEqual([
      ['Eli', 2],
      ['Mira', 1],
      ['mum', 1],
    ]);
  });

  it('says it all in plain lines, dated, with private facts marked', async () => {
    const text = lifePackText(
      await loadLifePack(client(tables()), U, { today: TODAY, tz: 'America/New_York' }),
    );
    expect(text).toContain('Yesterday, Wednesday 2026-11-11, already past:');
    expect(text).toContain('- on their calendar yesterday: Big night out, 8pm to 11pm');
    expect(text).toContain('Falls on today, Thursday 2026-11-12:');
    expect(text).toContain('- 2026-11-12, every year: Their anniversary with Eli.');
    expect(text).toContain('- 2026-11-14: A dentist check up. [private]');
    expect(text).toContain('- Mira, sister');
    expect(text).toContain('- their mum (no name given yet)');
    expect(lifePackText(null)).toBe('');
  });
});

describe('all of it, for the surfaces they talk with (data fabric stage 4e)', () => {
  it('compact is a screen worth, with nothing more', async () => {
    const pack = await loadLifePack(client(tables()), U, { today: TODAY, tz: 'America/New_York' });
    expect(pack.rest).toEqual([]);
    expect(lifePackText(pack)).not.toContain('Everything else');
  });

  it('full holds everything else they have said, newest first, saying where each stands', async () => {
    const pack = await loadLifePack(client(tables()), U, {
      today: TODAY,
      tz: 'America/New_York',
      size: 'full',
    });
    expect(pack.rest.map((f) => f.id)).toEqual(expect.arrayContaining(['f-old', 'f-far']));
    // each fact in one place, here too
    const all = [
      ...pack.yesterday.facts,
      ...pack.today_facts,
      ...pack.ahead,
      ...pack.lately,
      ...pack.standing,
      ...pack.rest,
    ].map((f) => f.id);
    expect(new Set(all).size).toBe(all.length);
    const text = lifePackText(pack);
    expect(text).toContain('Everything else they have told Gremly, newest first:');
    expect(text).toContain('- 2027-04-10, planned: A wedding in the spring.');
    expect(text).toContain('- Something said long ago.');
    // last, so a surface short of room loses the oldest first
    expect(text.trim().split('\n').at(-1)).toMatch(/^- /);
    expect(text.indexOf('Everything else')).toBeGreaterThan(
      text.indexOf('The people who come up most'),
    );
    expect(lifePackText(pack, { leave: ['rest'] })).not.toContain('Everything else');
  });

  it('says a plan whose day has passed was never confirmed, rather than that it is ahead', async () => {
    const t = tables();
    t.life_facts.push(
      fact('f-passed', 'A drinks night with work.', {
        about_date: '2026-10-02',
        state: 'planned',
        observed_at: '2026-09-20T09:00:00Z',
      }),
    );
    const text = lifePackText(
      await loadLifePack(client(t), U, { today: TODAY, tz: 'America/New_York', size: 'full' }),
    );
    expect(text).toContain('- 2026-10-02, was planned, never confirmed: A drinks night with work.');
  });

  it('holds far more standing facts than a screen', async () => {
    const t = tables();
    for (let i = 0; i < 30; i++)
      t.life_facts.push(
        fact(`f-s${i}`, `A standing thing ${i}.`, { kind: 'preference', timing: 'standing' }),
      );
    const compact = await loadLifePack(client(t), U, { today: TODAY, tz: 'America/New_York' });
    const full = await loadLifePack(client(t), U, {
      today: TODAY,
      tz: 'America/New_York',
      size: 'full',
    });
    expect(compact.standing).toHaveLength(12);
    expect(full.standing).toHaveLength(31);
  });

  it('gives a writer the same rule for what has just happened, with no dashes', () => {
    expect(JUST_HAPPENED_RULE).toMatch(/asks after it/);
    expect(JUST_HAPPENED_RULE).not.toMatch(/\s[-–—]\s|—/);
  });
});
