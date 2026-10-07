/**
 * What every day turn must get right (the plan doc's replay checks): every
 * ask handled in one turn, no false "done", only the changes asked for, and
 * the changes the scenario needs.
 */

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const sameDays = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...b].sort());

// a reply that says a change is already made; the card only proposes
const CLAIMS = [
  /\b(i['’]ve|i have)\s+(\w+\s+)?(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|set|put|made|taken|skipped)\b/i,
  /\ball set\b/i,
  /^\s*done\b/i,
  // "I put it in", but not a question or an offer such as "should I put it in"
  /(?<!\b(?:should|could|would|can|shall|may|might|will|do|did)\s+)\bI\s+(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|put|made|took|skipped|set up|set aside)\b/i,
  /\b(it['’]s|that['’]s|they['’]re|is|are)\s+now\s+(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|in)\b/i,
];

// The same verbs said about Gremly's own reading, not about one of their items:
// where it took something from, or a mistake it made. A reply that says how
// Gremly knows something, or owns getting it wrong, uses them, and is no claim
// that a change was made. They are taken out before the claims are looked for.
const NOT_A_CHANGE = [
  /\bI(?:['’]ve| have)?\s+(?:took|taken)\s+(?:that|this|it)\s+(?:from|to mean|as)\b/gi,
  /\bI(?:['’]ve| have)?\s+(?:\w+\s+)?made\s+(?:that|this|it|something)\s+up\b/gi,
  /\bI(?:['’]ve| have)?\s+(?:\w+\s+)?made\s+an?\s+(?:\w+\s+)?(?:mistake|error|assumption|guess|leap)\b/gi,
];

/** Whether a reply says a change is already made. */
export function claimsDone(reply) {
  const said = NOT_A_CHANGE.reduce((text, re) => text.replace(re, ' '), String(reply || ''));
  return CLAIMS.some((re) => re.test(said));
}

export function checkTurn(s, out) {
  const checks = [];
  const add = (level, name, ok, detail = '') => checks.push({ level, name, ok: !!ok, detail });
  const e = s.expect || {};
  add('fail', `about_day is ${e.aboutDay}`, out.about_day === e.aboutDay, String(out.about_day));
  if (!out.about_day || !e.aboutDay) return checks;

  const changes = out.changes || [];
  const desc = changes.map((c) => `${c.kind}${c.id ? `:${c.id}` : ''}${c.day ? `/${c.day}` : ''}${c.start != null ? `@${c.start}` : ''}${c.after != null ? `>${c.after}` : ''}`).join(', ');
  for (const want of e.changes || []) {
    const hit = changes.some(
      (c) =>
        want.kinds.includes(c.kind) &&
        (!want.id || c.id === want.id) &&
        (!want.at || c.start === toMin(want.at)) &&
        (!want.day || c.day === want.day) &&
        (!want.dayBy || (!!c.day && c.day <= want.dayBy)) &&
        (!want.dayAfter || (!!c.day && c.day > want.dayAfter)) &&
        (!want.days || sameDays(c.days, want.days)) &&
        (!want.busy || want.busy.every((d) => (c.busy_days || []).includes(d))) &&
        (want.weekday === undefined || c.weekday === want.weekday) &&
        (!want.mode || c.mode === want.mode) &&
        (!want.until || c.until === want.until) &&
        (want.travel === undefined || c.travel === want.travel) &&
        (!want.title || String(c.title || '').toLowerCase().includes(want.title)),
    );
    add(
      'fail',
      `Card has ${want.kinds.join('/')}${want.id ? ` ${want.id}` : ''}${want.day ? ` on ${want.day}` : ''}${want.dayBy ? ` by ${want.dayBy}` : ''}${want.dayAfter ? ` after ${want.dayAfter}` : ''}${want.days ? ` on ${want.days.join(', ')}` : ''}${want.busy ? ` busy ${want.busy.join(', ')}` : ''}${want.weekday !== undefined ? ` weekday ${want.weekday}` : ''}${want.mode ? ` ${want.mode}` : ''}${want.until ? ` until ${want.until}` : ''}${want.at ? ` at ${want.at}` : ''}${want.title ? ` "${want.title}"` : ''}`,
      hit,
      desc,
    );
  }
  // the weekly review: whether Gremly held the review on its step, offered the
  // week's button, and used the tools the turn needs
  if (e.hold !== undefined) add('fail', e.hold ? 'Holds the review' : 'Lets the review carry on', !!out.hold === e.hold, `hold ${!!out.hold}`);
  if (e.offer !== undefined) add('fail', e.offer ? "Offers the week's button" : "Does not offer the week's button", !!out.offer === e.offer, `offer ${!!out.offer}`);
  for (const tool of e.tools || []) add('fail', `Uses ${tool}`, (out.tools || []).includes(tool), (out.tools || []).join(', '));
  for (const c of e.check ? e.check(changes, out) : []) add(c.level || 'fail', c.name, c.ok, c.detail || '');
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
  if (e.structureOnly) {
    // the week's scenarios are checked on what was proposed, never on the reply's wording
    add('warn', 'No dashes', !/[–—]/.test(out.reply || ''), out.reply || '');
    return checks;
  }
  for (const words of e.mentions || []) {
    add('warn', `Reply covers ${words}`, String(out.reply || '').toLowerCase().includes(words), out.reply || '');
  }
  for (const like of e.notSaidLike || []) {
    add('fail', `Reply says nothing like /${like}/`, !new RegExp(like, 'i').test(String(out.reply || '')), out.reply || '');
  }
  for (const words of e.notSaid || []) {
    add('fail', `Reply does not name ${words}`, !String(out.reply || '').toLowerCase().includes(words), out.reply || '');
  }
  // the plan is for the rest of today: no plan time is before now
  const planTimed = changes.filter((c) => ['plan_add', 'plan_move'].includes(c.kind) && c.start != null);
  if (s.at) {
    const early = planTimed.filter((c) => c.start < toMin(s.at));
    add('fail', `No plan time before ${s.at}`, !early.length, desc);
  }
  if (e.planAddsUntimed) {
    // they named no time, so the app finds the free time
    const timed = changes.filter((c) => c.kind === 'plan_add' && c.start != null);
    add('fail', 'Plan adds carry no time of their own', !timed.length, desc);
  }
  if (e.planFrom) {
    const early = planTimed.filter((c) => c.start < toMin(e.planFrom));
    add('fail', `No plan time before ${e.planFrom}`, !early.length, desc);
  }
  if (e.planAddsFrom) {
    // they named the part of the day, so what is added starts there
    const adds = changes.filter((c) => c.kind === 'plan_add');
    const from = (c) => c.start ?? c.after;
    add('warn', `Plan adds start at ${e.planAddsFrom} or later`, adds.length && adds.every((c) => from(c) != null && from(c) >= toMin(e.planAddsFrom)), desc);
  }
  const reply = out.reply || '';
  // the worker replaces a reply that claims a change; the model is judged on its own words
  add(
    'fail',
    'Reply claims nothing as done',
    !out.reply_claimed && !claimsDone(reply),
    reply,
  );
  add('fail', 'Reply is short', reply.split(/(?<=[.!?])\s+/).filter(Boolean).length <= 3, reply);
  add('warn', 'No dashes', !/[–—]/.test(reply), reply);
  const proposed = (out.checklist || []).filter((a) => a.status === 'proposed').length;
  add('warn', 'Every proposed ask has a change', !proposed || changes.length > 0, JSON.stringify(out.checklist));
  return checks;
}
