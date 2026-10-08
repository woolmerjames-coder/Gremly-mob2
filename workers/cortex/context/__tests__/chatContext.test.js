/**
 * @jest-environment node
 *
 * Ask Gremly's context (chatProjection.js, data fabric stage 4d): their life
 * comes first and is never cut from the end, the people come from the people
 * records, recent chats are recent, a closed Chapter is told by its memory and
 * a fact is read by when it is true. Every name and record here is made up.
 */
import {
  buildChatContext,
  chatLifeSize,
  contextBudget,
  CONTEXT_BUDGET,
  fitContextBlocks,
  formatDailyFocusForChat,
} from '../chatProjection.js';
import { chapterLine, recallForMessage } from '../lifeContext.js';
import { memoryDb } from '../../../inngest-jobs/context/__tests__/memoryDb.js';

const U = 'u-noor';
const TODAY = '2026-11-12';
const URL_BASE = 'https://chat-context.invalid';
const ENV = { SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_KEY: 'k' };
const VIEWS = { life_facts_now: 'life_facts' };

const fact = (id, statement, over = {}) => ({
  id,
  user_id: U,
  statement,
  subject: null,
  kind: 'event',
  timing: 'day',
  about_date: null,
  about_date_end: null,
  state: 'current',
  private: false,
  health: false,
  observed_at: '2026-11-01T09:00:00Z',
  last_confirmed_at: '2026-11-01T09:00:00Z',
  item_table: null,
  item_done: false,
  item_cancelled: false,
  ...over,
});

function tables() {
  return {
    life_facts: [
      fact('f-anniv', 'Their anniversary with Eli.', {
        timing: 'yearly',
        about_date: '2025-11-12',
      }),
      fact('f-swim', 'Swims before work.', {
        kind: 'routine',
        timing: 'standing',
        about_date: '2026-10-19',
      }),
      fact('f-grant', 'Waiting to hear about a grant.', {
        kind: 'situation',
        timing: 'span',
        observed_at: '2026-11-09T09:00:00Z',
      }),
    ],
    life_people: [
      {
        id: 'p-eli',
        user_id: U,
        name: 'Eli',
        relationship: 'partner',
        merged_into: null,
        hidden_at: null,
      },
    ],
    life_fact_people: [{ user_id: U, fact_id: 'f-anniv', person_id: 'p-eli' }],
    synced_calendar_events: [],
    notes: [],
    quick_events: [],
    todos: [],
    habits: [],
    habit_progress: [],
    user_life_map: [
      // memoryDb does not project, so the story stands where the select would put it
      {
        user_id: U,
        life_map: { domains: [] },
        story: { story_so_far: 'Noor runs a small studio.' },
      },
    ],
    user_daily_state: [
      {
        user_id: U,
        date: TODAY,
        dco: {
          tone: 'celebratory',
          brief_headline: 'A day for you and Eli',
          lead_story: {
            what: 'Their anniversary falls today.',
            why_today: 'It is the day itself.',
          },
          today_focus: ['Book the table.'],
          also_matters: ['The grant decision could land this week.'],
          voice_note: 'Warm and light.',
          // the old shape, which nothing writes now: never read as people
          named_anchors: [{ type: 'person', label: 'Somebody Old' }],
        },
      },
    ],
    chapters: [
      {
        owner_id: U,
        title: 'The studio year',
        phase: 'closed',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        card_subtitle: 'Getting the studio off the ground',
        epigraph: 'The year the studio found its feet.',
      },
    ],
    gremly_questions: [],
    scope_chats: [
      {
        id: 'c-now',
        user_id: U,
        running_summary: 'This chat.',
        auto_title: 'Now',
        updated_at: '2026-11-12T08:00:00Z',
      },
      {
        id: 'c-week',
        user_id: U,
        running_summary: 'Talked through the grant.',
        auto_title: 'Grant',
        updated_at: '2026-11-08T08:00:00Z',
      },
      {
        id: 'c-old',
        user_id: U,
        running_summary: 'A chat from spring.',
        auto_title: 'Spring',
        updated_at: '2026-04-01T08:00:00Z',
      },
    ],
  };
}

function fetchFor(t, rpc = {}) {
  const mem = memoryDb(t);
  return async (url, init = {}) => {
    const u = new URL(url);
    const rest = u.pathname.replace(/^\/rest\/v1\//, '');
    const json = (v) =>
      new Response(JSON.stringify(v), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (rest.startsWith('rpc/')) {
      const fn = rest.slice(4);
      return json(rpc[fn] ? rpc[fn](JSON.parse(init.body || '{}')) : null);
    }
    const table = VIEWS[rest] || rest;
    return json(await mem.select(`${table}?${u.search.slice(1)}`));
  };
}

let realFetch;
beforeEach(() => {
  realFetch = global.fetch;
  jest.useFakeTimers({
    now: new Date('2026-11-12T14:00:00Z'),
    doNotFake: ['nextTick', 'setImmediate'],
  });
});
afterEach(() => {
  global.fetch = realFetch;
  jest.useRealTimers();
});

describe('fitting the blocks to the budget', () => {
  const blocks = [
    { key: 'life', text: `LIFE\n${'a'.repeat(40)}\n${'b'.repeat(40)}`, keep: true },
    {
      key: 'week',
      text: `WEEK\n${Array.from({ length: 8 }, (_, i) => `day ${i} ${'w'.repeat(30)}`).join('\n')}`,
    },
    { key: 'recall', text: 'RECALL\nwhat bears on the message', keep: true },
  ];

  it('keeps everything, in order, when it fits', () => {
    const { text, cut } = fitContextBlocks(blocks, 10000);
    expect(cut).toEqual([]);
    expect(text.indexOf('LIFE')).toBeLessThan(text.indexOf('WEEK'));
    expect(text.indexOf('WEEK')).toBeLessThan(text.indexOf('RECALL'));
  });

  it('takes whole lines from the unprotected blocks, says so, and never cuts from the end', () => {
    const { text, cut } = fitContextBlocks(blocks, 200);
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text).toContain('b'.repeat(40));
    expect(text).toContain('what bears on the message');
    expect(text).toContain('day 0');
    expect(text).toContain('(more not shown)');
    expect(cut.map((c) => c.key)).toEqual(['week']);
  });

  it('cuts a protected block only when the protected blocks alone are over', () => {
    const { cut } = fitContextBlocks(blocks, 80);
    expect(cut.map((c) => c.key)).toContain('life');
  });

  it('gives Ask Gremly far more room than before, and lets a Worker var set it', () => {
    expect(contextBudget('general', {})).toBe(CONTEXT_BUDGET.general);
    expect(CONTEXT_BUDGET.general).toBeGreaterThan(26000);
    expect(contextBudget('general', { CHAT_CONTEXT_CHARS: '26000' })).toBe(26000);
    expect(contextBudget('world', {})).toBe(CONTEXT_BUDGET.scoped);
  });
});

describe("today's picture", () => {
  const focus = {
    date: TODAY,
    tone: 'celebratory',
    briefHeadline: 'A day for you and Eli',
    leadStory: { what: 'Their anniversary falls today.', why_today: 'It is the day itself.' },
    todayFocus: ['Book the table.'],
    alsoMatters: ['The grant decision could land this week.'],
    voiceNote: 'Warm and light.',
    namedAnchors: [{ type: 'person', label: 'Somebody Old' }],
  };

  it('gives what leads, the headline, the focus, what else matters and how to sound, and no people', () => {
    const text = formatDailyFocusForChat(focus, TODAY);
    expect(text).toContain(
      'What leads the day: Their anniversary falls today. It is the day itself.',
    );
    expect(text).toContain('Also matters: The grant decision could land this week.');
    expect(text).toContain('How to sound: Warm and light.');
    expect(text).not.toContain('Somebody Old');
    expect(text).not.toMatch(/[–—]/);
  });

  it('says when the latest morning read is not today', () => {
    expect(formatDailyFocusForChat({ ...focus, date: '2026-11-11' }, TODAY)).toContain(
      'for 2026-11-11, not today',
    );
  });
});

describe('a closed Chapter', () => {
  it('is told by its memory, and an open one by its card line', () => {
    const closed = {
      title: 'The studio year',
      phase: 'closed',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      card_subtitle: 'Getting going',
      epigraph: 'The year the studio found its feet.',
    };
    expect(chapterLine(closed)).toContain('remembered as: The year the studio found its feet.');
    expect(chapterLine({ ...closed, phase: 'active', end_date: null })).toContain('Getting going');
    expect(chapterLine({ ...closed, epigraph: null })).toContain('Getting going');
  });
});

describe('what Gremly remembers for a message', () => {
  it('reads a yearly fact on its next day and a standing one with no date', async () => {
    const t = tables();
    global.fetch = fetchFor(t, {
      recall_life_now: () => [
        {
          source: 'fact',
          id: 'f-anniv',
          title: null,
          body: 'Their anniversary with Eli.',
          about_date: '2025-11-12',
          about_date_end: null,
          state: 'current',
          private: false,
        },
        {
          source: 'fact',
          id: 'f-swim',
          title: null,
          body: 'Swims before work.',
          about_date: '2026-10-19',
          about_date_end: null,
          state: 'current',
          private: false,
        },
      ],
    });
    const text = await recallForMessage(U, 'what is on for eli', ENV, {
      today: TODAY,
      timezone: 'America/New_York',
    });
    expect(text).toContain('2026-11-12, every year');
    expect(text).not.toContain('2025-11-12');
    expect(text).not.toContain('2026-10-19');
    expect(text).toContain('holds with no date of its own');
  });
});

describe('the whole context for Ask Gremly', () => {
  it('puts their life first, people from the people records, only recent other chats', async () => {
    const t = tables();
    global.fetch = fetchFor(t, {
      dated_ahead: () => [],
      recall_life_now: () => [],
      usage_rollup: () => null,
      absence_snapshot: () => null,
    });
    const text = await buildChatContext(
      U,
      'general',
      { timezone: 'America/New_York', currentChatId: 'c-now', today: TODAY, message: '' },
      ENV,
    );
    expect(text).toContain("=== TODAY'S PICTURE");
    expect(text).toContain('THEIR LIFE RIGHT NOW');
    expect(text).toContain('- 2026-11-12, every year: Their anniversary with Eli.');
    expect(text).toContain('- Eli, partner');
    expect(text).not.toContain('Somebody Old');
    expect(text.indexOf("TODAY'S PICTURE")).toBeLessThan(text.indexOf('THEIR LIFE RIGHT NOW'));
    expect(text.indexOf('THEIR LIFE RIGHT NOW')).toBeLessThan(text.indexOf('WHO THEY ARE'));
    expect(text).toContain('remembered as: The year the studio found its feet.');
    expect(text).toContain('Talked through the grant.');
    expect(text).not.toContain('This chat.');
    expect(text).not.toContain('A chat from spring.');
  });
});

describe('how much of their life Ask Gremly reads (data fabric stage 4e)', () => {
  const run = async (env, cache = null) => {
    const t = tables();
    t.life_facts.push(
      fact('f-old', 'Spent two weeks walking in the hills.', {
        state: 'happened',
        about_date: '2026-08-01',
        observed_at: '2026-08-09T09:00:00Z',
      }),
    );
    global.fetch = fetchFor(t, {
      dated_ahead: () => [],
      recall_life_now: () => [],
      usage_rollup: () => null,
      absence_snapshot: () => null,
    });
    return buildChatContext(
      U,
      'general',
      { timezone: 'America/New_York', currentChatId: 'c-now', today: TODAY, message: '' },
      { ...ENV, ...env, ...(cache ? { CONTEXT_CACHE: cache } : {}) },
    );
  };

  it('is all of it, unless CHAT_LIFE says compact', async () => {
    expect(chatLifeSize({})).toBe('full');
    expect(chatLifeSize({ CHAT_LIFE: 'compact' })).toBe('compact');
    expect(await run({})).toContain(
      '- 2026-08-01, happened: Spent two weeks walking in the hills.',
    );
    expect(await run({ CHAT_LIFE: 'compact' })).not.toContain('walking in the hills');
  });

  it('never serves one size from the cache for the other', async () => {
    const kv = new Map();
    const cache = {
      get: async (k) => kv.get(k) ?? null,
      put: async (k, v) => void kv.set(k, v),
    };
    expect(await run({ CHAT_LIFE: 'compact' }, cache)).not.toContain('walking in the hills');
    expect(await run({}, cache)).toContain('walking in the hills');
    // both sizes kept in the one entry the pipeline drops
    const entry = JSON.parse(kv.get(`life-now:${U}`));
    expect(Object.keys(entry.sizes).sort()).toEqual(['compact', 'full']);
    expect(await run({ CHAT_LIFE: 'compact' }, cache)).not.toContain('walking in the hills');
  });
});

describe('a chat about one part of their life (data fabric stage 4e)', () => {
  it('reads the screen worth, whatever CHAT_LIFE says, as its budget is smaller', async () => {
    const t = tables();
    t.life_facts.push(
      fact('f-old', 'Spent two weeks walking in the hills.', {
        state: 'happened',
        about_date: '2026-08-01',
        observed_at: '2026-08-09T09:00:00Z',
      }),
    );
    global.fetch = fetchFor(t, {
      dated_ahead: () => [],
      recall_life_now: () => [],
      usage_rollup: () => null,
      absence_snapshot: () => null,
    });
    const text = await buildChatContext(
      U,
      'space',
      { timezone: 'America/New_York', today: TODAY, message: '' },
      ENV,
    );
    expect(text).toContain('THEIR LIFE RIGHT NOW');
    expect(text).not.toContain('walking in the hills');
  });

  it('lets the rest give way before anything else when Ask Gremly is over its budget', () => {
    const rest = ['=== WHAT ELSE', ...Array.from({ length: 50 }, (_, i) => `- old ${i}`)].join(
      '\n',
    );
    const { text, cut } = fitContextBlocks(
      [
        { key: 'life_now', text: '=== LIFE\n- today', keep: true },
        { key: 'life_rest', text: rest },
        { key: 'week', text: '=== WEEK\n- Monday: standup' },
      ],
      200,
    );
    expect(cut.map((c) => c.key)).toEqual(['life_rest']);
    expect(text).toContain('- Monday: standup');
    expect(text).toContain('- old 0');
    expect(text).not.toContain('- old 49');
  });
});
