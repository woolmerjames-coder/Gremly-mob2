/**
 * @jest-environment node
 *
 * Dated things ahead for chat (workers/cortex/context/datedAhead.js): the
 * ledger's plans, events and deadlines still ahead or under way, read from
 * public.dated_ahead in place of the anchors list.
 */
import { fetchDatedAhead, formatDatedAhead, whenWords } from '../context/datedAhead.js';

const ENV = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'k' };

describe('how far ahead, in words', () => {
  it('counts from their day', () => {
    expect(whenWords('2026-10-07', '2026-10-07')).toBe('today');
    expect(whenWords('2026-10-08', '2026-10-07')).toBe('tomorrow');
    expect(whenWords('2026-10-12', '2026-10-07')).toBe('in 5 days');
    expect(whenWords('2026-11-01', '2026-10-07')).toBe('in about 4 weeks');
  });
});

describe('the block chat is given', () => {
  const read = {
    day: '2026-10-07',
    rows: [
      {
        statement: 'Alex is flying to Porto.',
        about_date: '2026-11-01',
        about_date_end: '2026-11-04',
        state: 'planned',
        private: false,
      },
      {
        statement: 'Alex has the review at work.',
        about_date: '2026-10-08',
        about_date_end: null,
        state: 'unconfirmed',
        private: false,
      },
      {
        statement: 'Alex is between flats.',
        about_date: '2026-10-01',
        about_date_end: '2026-10-20',
        state: 'current',
        private: true,
      },
    ],
  };

  it('gives each dated thing with its days, how far off it is and how it stands', () => {
    const block = formatDatedAhead(read);
    expect(block).toContain('=== DATED THINGS AHEAD');
    expect(block).toContain(
      '- 2026-11-01 to 2026-11-04 (in about 4 weeks) | planned | Alex is flying to Porto.',
    );
    expect(block).toContain('- 2026-10-08 (tomorrow) | unconfirmed | Alex has the review at work.');
  });

  it('says a thing that began before today is under way, and marks what is private', () => {
    const block = formatDatedAhead(read);
    expect(block).toContain(
      '- 2026-10-01 to 2026-10-20 (under way) | current | Alex is between flats. [private:',
    );
  });

  it('is nothing when there is nothing ahead', () => {
    expect(formatDatedAhead({ day: '2026-10-07', rows: [] })).toBe('');
    expect(formatDatedAhead(null)).toBe('');
  });
});

describe('reading it', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('asks the ledger from their day on, and keeps it for five minutes', async () => {
    const puts = [];
    const env = {
      ...ENV,
      CONTEXT_CACHE: {
        get: async () => null,
        put: async (k, v, o) => puts.push([k, JSON.parse(v), o]),
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => [{ statement: 'x', about_date: '2026-10-09' }],
    }));
    global.fetch = fetchMock;
    const out = await fetchDatedAhead('u-1', env, { today: '2026-10-07' });
    expect(out.rows).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://db.test/rest/v1/rpc/dated_ahead');
    expect(JSON.parse(init.body)).toMatchObject({ p_user: 'u-1', p_from: '2026-10-07' });
    expect(puts[0][0]).toBe('dated-ahead:u-1');
    expect(puts[0][2]).toEqual({ expirationTtl: 300 });
  });

  it('does not use a kept read from another day', async () => {
    const env = {
      ...ENV,
      CONTEXT_CACHE: {
        get: async () => JSON.stringify({ day: '2026-10-06', rows: [] }),
        put: async () => {},
      },
    };
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => [] }));
    global.fetch = fetchMock;
    await fetchDatedAhead('u-1', env, { today: '2026-10-07' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('gives nothing, and says so in the log, when the ledger cannot be read', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await fetchDatedAhead('u-1', ENV, { today: '2026-10-07' })).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
