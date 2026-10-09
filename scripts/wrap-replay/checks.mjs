/**
 * The rules every line of Gremly's wrap up words keeps, for the replay
 * (run.mjs) and the writer test (writers.mjs).
 */

// ── the rules every line keeps ───────────────────────────────────────────────
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const DASH = /\s[-–—]\s|[–—]/;
const NIGHT = /\b(tonight|night|sleep|bed)\b/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function checks(moment, f, out, expect = {}) {
  const c = [];
  const add = (name, ok, detail = '') => c.push({ name, ok: !!ok, detail });
  if (!out) {
    add('An answer', false);
    return c;
  }
  if (moment === 'questions') {
    const ids = out.ask.map((q) => q.id);
    add(`At most ${expect.most ?? 2}`, ids.length <= (expect.most ?? 2), ids.join(', '));
    if (expect.notAsked) add('Nothing settled tonight', !ids.some((id) => expect.notAsked.includes(id)), ids.join(', '));
    for (const q of out.ask) {
      add(`No dashes: ${q.id}`, !DASH.test(q.question), q.question);
      add(`A question: ${q.id}`, /\?$/.test(q.question), q.question);
    }
    // the line before them, in his words
    if (ids.length) {
      const intro = out.intro || '';
      add('A line before them', !!intro, intro);
      add('Intro short (16 words)', words(intro) <= 19, intro);
      add('Intro without dashes', !DASH.test(intro), intro);
    }
    return c;
  }
  if (moment === 'journal_reply') {
    add('Knows a journal entry', out.journal === expect.journal, String(out.journal));
    if (!out.journal) return c;
    // the moods it carries: the app's own, two at most, one of those that fit when the entry shows how they feel
    const moods = out.moods || [];
    add('Two moods at most, the app\'s own', moods.length <= 2, moods.join(', '));
    if (expect.moods) add('Moods that fit', moods.length > 0 && moods.every((m) => expect.moods.includes(m)), moods.join(', '));
  }
  const text = out.line ?? out.reply ?? '';
  // what this evening's line must leave out, or must say
  for (const w of expect.notNamed || []) add(`Leaves out ${w}`, !text.toLowerCase().includes(w.toLowerCase()), text);
  if (expect.mentions) add(`Says ${expect.mentions}`, new RegExp(expect.mentions, 'i').test(text), text);
  add('No dashes', !DASH.test(text), text);
  add('No emoji', !EMOJI.test(text), text);
  const cap = { open: 40, journal_ask: 18, journal_reply: 38, sorted: 22, habits: 28, close: 45, night: 20 }[moment] ?? 40;
  add(`Short (${cap} words)`, words(text) <= cap + 3, words(text));
  if (moment === 'journal_ask') add('Asks one question', (text.match(/\?/g) || []).length === 1, text);
  else add('Asks nothing', !/\?/.test(text), text);
  if (f.part === 'early') {
    // a habit's own words are not about the night, even when the line rewords the habit
    const t = f.tonight || {};
    const habits = [...(t.logged || []), ...(t.held || []), ...(t.not_held || [])];
    const own = new Set(habits.flatMap((h) => h.toLowerCase().split(/\W+/)));
    const night = (text.match(new RegExp(NIGHT.source, 'gi')) || []).filter((w) => !own.has(w.toLowerCase()));
    add('Nothing about tonight', night.length === 0, text);
  }
  if (f.part === 'late' && moment !== 'journal_reply') add('Names the next day', !/\btomorrow\b/i.test(text), text);
  if (moment === 'close') add('No goodnight', !/good ?night|sleep well/i.test(text), text);
  // the close turns them to rest (before the evening, to the rest of their day)
  if (moment === 'close' && f.part !== 'early') {
    add('Turns to rest', /\b(rest|sleep|bed|unwind|wind down|switch off|recharge|night)\b/i.test(text.replace(/good ?night/gi, '')), text);
  }
  if (moment === 'close') add('Two sentences at most', (text.match(/[.!?](\s|$)/g) || []).length <= 2, text);
  if (moment === 'journal_reply') add('Says it is saved', /journal|saved/i.test(text), text);
  return c;
}
