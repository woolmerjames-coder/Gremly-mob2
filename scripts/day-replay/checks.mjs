/**
 * What every day turn must get right (the plan doc's replay checks): every
 * ask handled in one turn, no false "done", only the changes asked for, and
 * the changes the scenario needs.
 */

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// a reply that says a change is already made; the card only proposes
const CLAIMS = [
  /\b(i['’]ve|i have)\s+(\w+\s+)?(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|set|put|made|taken|skipped)\b/i,
  /\ball set\b/i,
  /^\s*done\b/i,
  // "I put it in", but not a question or an offer such as "should I put it in"
  /(?<!\b(?:should|could|would|can|shall|may|might|will|do|did)\s+)\bI\s+(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|put|made|took|skipped|set up|set aside)\b/i,
  /\b(it['’]s|that['’]s|they['’]re|is|are)\s+now\s+(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|in)\b/i,
];

export function checkTurn(s, out) {
  const checks = [];
  const add = (level, name, ok, detail = '') => checks.push({ level, name, ok: !!ok, detail });
  const e = s.expect || {};
  add('fail', `about_day is ${e.aboutDay}`, out.about_day === e.aboutDay, String(out.about_day));
  if (!out.about_day || !e.aboutDay) return checks;

  const changes = out.changes || [];
  const desc = changes.map((c) => `${c.kind}${c.id ? `:${c.id}` : ''}${c.day ? `/${c.day}` : ''}${c.start != null ? `@${c.start}` : ''}`).join(', ');
  for (const want of e.changes || []) {
    const hit = changes.some(
      (c) =>
        want.kinds.includes(c.kind) &&
        (!want.id || c.id === want.id) &&
        (!want.at || c.start === toMin(want.at)) &&
        (!want.day || c.day === want.day) &&
        (want.travel === undefined || c.travel === want.travel) &&
        (!want.title || String(c.title || '').toLowerCase().includes(want.title)),
    );
    add('fail', `Card has ${want.kinds.join('/')}${want.id ? ` ${want.id}` : ''}${want.day ? ` on ${want.day}` : ''}${want.at ? ` at ${want.at}` : ''}${want.title ? ` "${want.title}"` : ''}`, hit, desc);
  }
  for (const f of e.forbid || []) {
    const [kind, id] = f.split(':');
    const hit = changes.some((c) => c.kind === kind && (!id || c.id === id));
    add('fail', `Card has no ${f}`, !hit, desc);
  }
  if (e.maxChanges !== undefined) {
    add('fail', `At most ${e.maxChanges} changes`, changes.length <= e.maxChanges, `${changes.length}: ${desc}`);
  }
  for (const st of e.status || []) {
    add('fail', `Checklist has ${st}`, (out.checklist || []).some((a) => a.status === st), JSON.stringify(out.checklist));
  }
  if (e.dueBefore) {
    // what gets someone ready for a date is due before it; asking when is fine too
    const d = e.dueBefore;
    const forIt = changes.filter(
      (c) => c.day && ((d.id && c.id === d.id) || (d.title && String(c.title || '').toLowerCase().includes(d.title))),
    );
    const late = forIt.filter((c) => c.day >= d.before);
    const asked = (out.checklist || []).some((a) => a.status === 'needs_answer');
    // or it already sits on a day before the date, and the card leaves that day alone
    const item = (s.items || []).find((x) => (d.id && x.id === d.id) || (d.title && x.title.toLowerCase().includes(d.title)));
    const already = !!item?.due_day && item.due_day < d.before && !changes.some((c) => c.id === item.id && c.day);
    add('fail', `Nothing for it is due on or after ${d.before}`, !late.length, desc);
    add('fail', `It is due before ${d.before}, or Gremly asks when`, forIt.length > 0 || asked || already, `${desc} ${JSON.stringify(out.checklist)}`);
  }
  if (e.oneDate) {
    // a new todo has one date, unless the person named a deadline as well
    const both = changes.filter((c) => c.bothDates);
    add('fail', 'A new todo has one date', !both.length, desc);
  }
  if (e.offersEvent) {
    // the event the person mentioned is offered too, on its own day
    const ev = e.offersEvent;
    const hit = changes.some((c) => c.day === ev.day && String(c.title || '').toLowerCase().includes(ev.title));
    add('warn', `Offers the ${ev.title} itself on ${ev.day}`, hit, desc);
  }
  for (const words of e.mentions || []) {
    add('warn', `Reply covers ${words}`, String(out.reply || '').toLowerCase().includes(words), out.reply || '');
  }
  const reply = out.reply || '';
  // the worker replaces a reply that claims a change; the model is judged on its own words
  add(
    'fail',
    'Reply claims nothing as done',
    !out.reply_claimed && !CLAIMS.some((re) => re.test(reply)),
    reply,
  );
  add('fail', 'Reply is short', reply.split(/(?<=[.!?])\s+/).filter(Boolean).length <= 3, reply);
  add('warn', 'No dashes', !/[–—]/.test(reply), reply);
  const proposed = (out.checklist || []).filter((a) => a.status === 'proposed').length;
  add('warn', 'Every proposed ask has a change', !proposed || changes.length > 0, JSON.stringify(out.checklist));
  return checks;
}
