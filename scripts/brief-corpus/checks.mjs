/**
 * Checks on one written brief. "fail" is a rule the brief must keep; "look"
 * points a reviewer at something code cannot judge.
 */

const SENTENCE_END = /[.!?](\s|$)/g;
// Times such as 11:00, 9am or 3:30pm; any other number is a count
const TIMES = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)|\b\d{1,2}:\d{2}\b/gi;
const hasCount = (text) => /\d/.test(text.replace(TIMES, ''));
const REF = /\b[cthr]\d+\b/;

export function checkBrief(g, offer, out) {
  const results = [];
  const add = (level, name, ok, detail = '') => results.push({ level, name, ok, detail });
  const texts = [...out.lines.map((l) => l.text), out.offer || '', out.questionLine || ''];

  const fewest = offer.kind === 'none' ? 1 : 2;
  add(
    'fail',
    offer.kind === 'none' ? 'One to three lines' : 'Two or three lines',
    out.lines.length >= fewest && out.lines.length <= 3,
    `${out.lines.length} lines`,
  );
  const withRefs = texts.filter((t) => REF.test(t));
  add('fail', 'No refs in the text', withRefs.length === 0, withRefs.join(' | '));
  add(
    'fail',
    'Every line passed the ID check',
    out.dropped.length === 0,
    out.dropped.map((d) => `dropped "${d.text}" (refs ${d.bad.join(', ')})`).join('; '),
  );
  add(
    'fail',
    offer.kind === 'none' ? 'Signs off' : 'Offer present and passed the ID check',
    (offer.kind === 'none' ? true : !!out.offer) && !out.offerDropped,
    out.offerDropped ? `bad refs ${out.offerDropped.bad.join(', ')}` : '',
  );
  for (const words of g.forbid || []) {
    const hit = texts.filter((t) => t.toLowerCase().includes(words.toLowerCase()));
    add('fail', `Never says "${words}"`, hit.length === 0, hit.join(' | '));
  }
  if (Number.isFinite(g.sweepWaiting) && ['sweep', 'return'].includes(offer.kind)) {
    const counts = (out.offer || '').replace(TIMES, '').match(/\d+/g) || [];
    // the total the day card shows, or one of its parts as given
    const s = g.sweep || {};
    const allowed = new Set(
      [g.sweepWaiting, s.pastDay, s.noDay, s.other, s.notes, s.newSince].filter(Number.isFinite),
    );
    add(
      'fail',
      `Any Sweep number named is ${g.sweepWaiting} (as the day card shows) or one of its parts`,
      counts.every((n) => allowed.has(Number(n))),
      out.offer || '',
    );
  }
  const should = texts.filter((t) => /\bshould\b/i.test(t));
  add('fail', 'Never says "should"', should.length === 0, should.join(' | '));

  const asking = !!(g.question && !g.ret);
  add('fail', asking ? 'Asks the question' : 'Asks no question', asking ? !!out.questionLine : !out.questionLine, out.questionLine || '');
  if (asking && !(g.question.choices || []).length) {
    const ch = out.questionChoices || [];
    add(
      'fail',
      'Adds 2 to 4 short answers for a question that has none',
      ch.length >= 2 && ch.length <= 4 && ch.every((c) => c.split(/\s+/).length <= 6),
      ch.join(' / '),
    );
  }
  add('fail', g.ret ? 'Has a catch-up' : 'Has no catch-up', g.ret ? !!out.catchUp : !out.catchUp, out.catchUp || '');

  if (g.ret) {
    const counted = [...out.lines.map((l) => l.text), out.offer || ''].filter((t) => hasCount(t));
    add('fail', 'Return day: no counts outside the catch-up', counted.length === 0, counted.join(' | '));
  }
  const over = new Set(g.meetings.filter((m) => m.end <= g.now).map((m) => m.id));
  const citesOver = out.lines.filter((l) => l.ids.some((id) => over.has(id)));
  add('look', 'Does not cite meetings that are over', citesOver.length === 0, citesOver.map((l) => l.text).join(' | '));
  const long = out.lines.filter((l) => (l.text.match(SENTENCE_END) || []).length > 2);
  add('look', 'Each line is one or two sentences', long.length === 0, long.map((l) => l.text).join(' | '));
  if (g.reach) {
    const named = out.lines.some((l) => l.ids.includes(g.reach.id));
    add('look', 'Mentions the reach', named);
  }
  const ahead = g.clashes.filter(([a, b]) => a.end > g.now && b.end > g.now);
  if (ahead.length) {
    const ids = new Set(ahead.flat().map((m) => m.id));
    add('look', 'Mentions the clash', out.lines.some((l) => l.ids.filter((id) => ids.has(id)).length >= 2 || /clash|overlap|same time|double/i.test(l.text)));
  }
  return results;
}
