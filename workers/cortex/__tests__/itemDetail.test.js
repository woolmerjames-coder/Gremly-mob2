/**
 * @jest-environment node
 *
 * What a chat about one item is told the item holds, and the starters drawn
 * from a note when its chat opens. Plumbing only: what the reply makes of it
 * is covered by the scenario runner (data/item_detail_check.json).
 */
import {
  toDetail,
  itemDetailText,
  fetchItemDetail,
  topicsFrom,
  topicsSource,
  hasContent,
  handleItemTopics,
  ITEM_TOPICS_PROMPT,
} from '../itemDetail.js';
import { anchorPromptSection, turnItemSections } from '../entityMatch.js';
import { configureModels } from '../models.js';

const TODAY = '2026-09-30';

afterEach(() => {
  configureModels({});
  delete globalThis.fetch;
});

const note = {
  id: '7a1c3e52-1b4d-4f0a-9c2e-5d8b0f6a1e01',
  title: 'Japan Trip Plan',
  subtype: 'idea',
  body: 'Tokyo 4 nights then Kyoto 3.\nBook a ryokan.',
  list_items: [
    { id: 'a', text: 'JR pass?', checked: false },
    { id: 'b', text: 'Flights', checked: true },
    { id: 'c', text: '   ', checked: false },
  ],
  tags: ['travel', 7, ''],
  created_at: '2026-09-12T18:00:00Z',
  chat_summary: 'Talked about Kyoto first.',
  views: {},
};

test('a note in full: its text, list, kind, age and earlier chats, in words', () => {
  const d = toDetail(note, 'note', { spaceName: 'Travel', timezone: 'America/Los_Angeles' });
  expect(d.list).toEqual([
    { text: 'JR pass?', done: false },
    { text: 'Flights', done: true },
  ]);
  expect(d.tags).toEqual(['travel']);
  expect(d.created_day).toBe('2026-09-12');
  const text = itemDetailText(d, TODAY);
  expect(text).toContain('What else it holds, as it is now:');
  expect(text).toContain('- it is an idea');
  expect(text).toContain('- it sits in their space "Travel"');
  expect(text).toContain('- added Saturday 12 September, 18 days ago');
  expect(text).toContain('- what it says: "Tokyo 4 nights then Kyoto 3. / Book a ryokan."');
  expect(text).toContain('- its list: JR pass?; Flights (ticked)');
  expect(text).toContain('- tagged travel');
  expect(text).toContain('- what earlier chats about it covered: Talked about Kyoto first.');
});

test('a todo in full: notes, estimate, commitment, Sweep and the changes made to it', () => {
  const d = toDetail(
    {
      id: 't1',
      name: 'Renew Car Insurance',
      notes: 'Policy ends 14 Oct.',
      time_estimate_minutes: 90,
      time_window: 'morning',
      commitment: true,
      commitment_note: null,
      sweep_reschedule_count: 3,
      due_day: '2026-10-09',
      due_time: '09:30:00',
      created_at: '2026-09-02T17:00:00Z',
      views: {
        change_log: [
          { field: 'due_day', from: '2026-09-25', to: '2026-10-09', now: 'Fri 9 Oct', at: '2026-09-24T20:00:00Z' },
          { field: 'name', from: 'Insurance', to: 'Renew Car Insurance', at: '2026-09-20T20:00:00Z' },
        ],
      },
    },
    'todo',
  );
  expect(d.due_time).toBe('09:30');
  const text = itemDetailText(d, TODAY);
  expect(text).toContain('- its notes: "Policy ends 14 Oct."');
  expect(text).toContain('- takes about 1 hour 30 minutes');
  expect(text).toContain('- best done in the morning');
  expect(text).toContain('- they committed to it');
  expect(text).toContain('- put off in Sweep 3 times');
  expect(text).toContain(
    '- changes made to it: moved from Friday 25 September to Friday 9 October (Thursday 24 September); renamed to "Renew Car Insurance" (Sunday 20 September)',
  );
});

test('a habit in full: what counts at the least, and its check-ins over four weeks', () => {
  const row = {
    id: 'h1',
    name: 'Morning Stretch',
    subtype: 'break_habit',
    frequency: 'daily',
    floor_note: 'Two minutes of rolls',
    replacement_text: 'A glass of water',
    created_at: '2026-09-01T15:00:00Z',
    last_completed_at: '2026-08-20T15:00:00Z',
  };
  const logged = toDetail(row, 'habit', { loggedDays: ['2026-09-14', '2026-09-28', '2026-09-28', '2026-08-01'] });
  const text = itemDetailText(logged, TODAY);
  expect(text).toContain('- it is a habit they are trying to stop');
  expect(text).toContain('- what they do instead: "A glass of water"');
  expect(text).toContain('- the smallest version that still counts: "Two minutes of rolls"');
  expect(text).toContain('- checked in 2 times in the last four weeks, last Monday 28 September');
  const none = itemDetailText(toDetail(row, 'habit', {}), TODAY);
  expect(none).toContain('- no check-ins in the last four weeks; last done Thursday 20 August');
});

test('an item with nothing more than its title adds nothing', () => {
  expect(itemDetailText(toDetail({ id: 'n', title: 'Packing' }, 'note'), TODAY)).toBe('');
  expect(itemDetailText(null, TODAY)).toBe('');
  expect(toDetail(null, 'note')).toBeNull();
  expect(toDetail({ id: 'x' }, 'space')).toBeNull();
});

test('the chat about an item works from what it holds; a habit has nothing to add to', () => {
  const anchor = { id: note.id, type: 'note', title: 'Japan Trip Plan' };
  const detailText = itemDetailText(toDetail(note, 'note'), TODAY);
  const s = anchorPromptSection(anchor, TODAY, { detailText });
  expect(s).toContain('=== WHAT THIS CHAT IS ABOUT ===');
  expect(s).toContain('- what it says:');
  expect(s).toContain('Work from what it already holds');
  expect(s).toContain('the app offers that after your reply');
  const habit = anchorPromptSection({ id: 'h1', type: 'habit', title: 'Run' }, TODAY, {
    detailText: '- checked in',
  });
  expect(habit).toContain('Work from what it already holds');
  expect(habit).not.toContain('the app offers that after your reply');
  // nothing read, nothing said; and a card turn stays short
  expect(anchorPromptSection(anchor, TODAY, {})).not.toContain('Work from');
  expect(anchorPromptSection(anchor, TODAY, { mode: 'entity_card', detailText })).not.toContain(
    'what it says',
  );
  // a gone item is not described
  expect(anchorPromptSection({ ...anchor, gone: true }, TODAY, { detailText })).not.toContain(
    'what it says',
  );
  const all = turnItemSections({ match: null, card: null, recent: null, anchor, mode: 'general', todayIso: TODAY, detailText });
  expect(all).toContain('- what it says:');
});

test('the item is read fresh, with its space and check-ins; a failed read gives nothing', async () => {
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    const u = String(url);
    if (u.includes('/rest/v1/habits?')) return new Response(JSON.stringify([{ id: 'h1', name: 'Run', space_id: 's1', frequency: 'daily' }]));
    if (u.includes('/rest/v1/spaces?')) return new Response(JSON.stringify([{ name: 'Health' }]));
    if (u.includes('/rest/v1/habit_progress?')) return new Response(JSON.stringify([{ occurred_day: '2026-09-29' }]));
    return new Response('[]');
  };
  const env = { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_KEY: 'k' };
  const d = await fetchItemDetail(env, 'u1', { id: 'h1', type: 'habit', title: 'Run' }, { todayIso: TODAY });
  expect(d.space).toBe('Health');
  expect(d.logged_days).toEqual(['2026-09-29']);
  expect(seen[0]).toContain('habits?id=eq.h1&owner_id=eq.u1&select=');
  expect(seen.some((u) => u.includes('occurred_day=gte.2026-09-03'))).toBe(true);
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  expect(await fetchItemDetail(env, 'u1', { id: 'h1', type: 'habit', title: 'Run' }, { todayIso: TODAY })).toBeNull();
  expect(await fetchItemDetail(env, null, { id: 'h1', type: 'habit', title: 'Run' })).toBeNull();
});

test('topics: what the model sends back becomes at most four starters, each with a label and a message', () => {
  expect(topicsFrom(null)).toEqual([]);
  expect(
    topicsFrom({
      topics: [
        { label: 'Sort the ryokan', message: 'Can we pick the ryokan in Kyoto?' },
        { label: '', message: 'no label' },
        { label: 'x'.repeat(41), message: 'too long a label' },
        { label: 'JR pass', message: 'Do I need the JR pass?' },
        { label: 'Osaka', message: 'Is the Osaka day trip worth it?' },
        { label: 'Food', message: 'Which food tour?' },
        { label: 'Fifth', message: 'one too many' },
      ],
    }).map((t) => t.label),
  ).toEqual(['Sort the ryokan', 'JR pass', 'Osaka', 'Food']);
  const d = toDetail(note, 'note');
  expect(hasContent(d)).toBe(true);
  expect(hasContent(toDetail({ id: 'n', title: 'Just a title' }, 'note'))).toBe(false);
  expect(topicsSource(d)).toContain('What it says: Tokyo 4 nights');
  expect(topicsSource(d)).toContain('- Flights (ticked)');
  expect(topicsSource(toDetail({ id: 't', name: 'A todo', notes: 'x' }, 'todo'))).toBe('');
});

test('topics are asked for once per version of the note, and kept', async () => {
  configureModels({ OPENAI_API_KEY: 'k' });
  const store = new Map();
  const env = {
    SUPABASE_URL: 'https://db',
    SUPABASE_SERVICE_KEY: 'k',
    CONTEXT_CACHE: {
      get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
    },
  };
  let row = { ...note };
  let calls = 0;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/rest/v1/notes?')) return new Response(JSON.stringify([row]));
    if (u.includes('/rest/v1/')) return new Response('[]');
    calls += 1;
    sent = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"topics":[{"label":"JR pass","message":"Do I need the JR pass?"}]}' } }],
      }),
    );
  };
  const body = { itemId: note.id, itemType: 'note' };
  const first = await handleItemTopics(body, env, 'u1');
  expect(first).toEqual({ ok: true, topics: [{ label: 'JR pass', message: 'Do I need the JR pass?' }] });
  expect(sent.messages[0].content).toBe(ITEM_TOPICS_PROMPT);
  expect(sent.messages[1].content).toContain('Title: Japan Trip Plan');
  expect(calls).toBe(1);
  const again = await handleItemTopics(body, env, 'u1');
  expect(again.cached).toBe(true);
  expect(calls).toBe(1);
  // the note changes: asked again
  row = { ...note, body: 'Tokyo only now.' };
  await handleItemTopics(body, env, 'u1');
  expect(calls).toBe(2);
  // nothing to suggest from, not a note, or no user: no call, the usual starters
  row = { ...note, body: null, list_items: [] };
  expect(await handleItemTopics(body, env, 'u1')).toEqual({ ok: true, topics: [] });
  expect(await handleItemTopics({ itemId: note.id, itemType: 'todo' }, env, 'u1')).toEqual({ ok: true, topics: [] });
  expect(await handleItemTopics(body, env, null)).toEqual({ ok: true, topics: [] });
  expect(calls).toBe(2);
});
