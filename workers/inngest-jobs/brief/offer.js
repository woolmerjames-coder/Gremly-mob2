/**
 * What the brief offers at its end: a data rule, never the model's choice.
 * The writer only words the offer for the kind decided here.
 *
 * The counts are the quick sweep's (what still needs a decision; anything
 * already given a day, a Lock In or a resurface date is left out), so nothing
 * to decide means no Sweep offer.
 *
 * - A return day (back after three or more days away) with anything waiting:
 *   Sweep first, worded kindly, beside Catch me up and Just today.
 * - Things to decide (anything past its date, or more than five other cards
 *   in the quick sweep): Sweep first, beside Plan anyway and Not today.
 * - Otherwise, when there is at least one thing to plan and a clear stretch of
 *   45 minutes or more still ahead today: Plan, beside What can wait? and
 *   Not today.
 * - Otherwise no offer: Gremly signs off.
 */

export const MESSY_UNSORTED = 5;
export const MIN_GAP_MINUTES = 45;

/** "Plan my day" before noon, "Plan my afternoon" until 5pm, then "Plan my evening". */
export function planLabel(gapStartMinutes) {
  if (gapStartMinutes < 12 * 60) return 'Plan my day';
  if (gapStartMinutes < 17 * 60) return 'Plan my afternoon';
  return 'Plan my evening';
}

/** Clear stretches still ahead today: [{from, to}] in minutes, at least MIN_GAP_MINUTES long. */
export function gapsAhead(freeWindows, now) {
  return (freeWindows || [])
    .map((w) => ({ from: Math.max(w.from, now), to: w.to }))
    .filter((w) => w.to - w.from >= MIN_GAP_MINUTES);
}

/**
 * @param {object} p
 * @param {boolean} p.returnDay
 * @param {number} p.overdue  todos past their date (the quick sweep's)
 * @param {number} p.unsorted the quick sweep's other cards: no day yet, skipped, notes
 * @param {number} p.candidates things that could go in a plan
 * @param {{from:number,to:number}[]} p.freeWindows clear stretches today, in minutes
 * @param {number} p.now minutes from local midnight
 * @param {number} [p.planned] items already placed on today by a locked plan
 */
export function decideOffer({
  returnDay,
  overdue,
  unsorted,
  candidates,
  freeWindows,
  now,
  planned = 0,
}) {
  const gaps = gapsAhead(freeWindows, now);
  // a plan already locked in for today (made the evening before) is not offered again
  const canPlan = candidates > 0 && gaps.length > 0 && !(planned > 0);
  const plan = canPlan ? { label: planLabel(gaps[0].from), gapFrom: gaps[0].from } : null;
  const waiting = (overdue || 0) + (unsorted || 0);

  if (returnDay && waiting > 0) {
    return {
      kind: 'return',
      buttons: [
        { id: 'sweep', label: 'Sweep first', action: 'sweep', primary: true },
        { id: 'catch_up', label: 'Catch me up', action: 'catch_up' },
        { id: 'just_today', label: 'Just today', action: 'just_today' },
      ],
      plan,
    };
  }
  if ((overdue || 0) > 0 || (unsorted || 0) > MESSY_UNSORTED) {
    return {
      kind: 'sweep',
      buttons: [
        { id: 'sweep', label: 'Sweep first', action: 'sweep', primary: true },
        ...(plan ? [{ id: 'plan', label: 'Plan anyway', action: 'plan' }] : []),
        { id: 'not_today', label: 'Not today', action: 'not_today' },
      ],
      plan,
    };
  }
  if (plan) {
    return {
      kind: 'plan',
      buttons: [
        { id: 'plan', label: plan.label, action: 'plan', primary: true },
        { id: 'what_can_wait', label: 'What can wait?', action: 'what_can_wait' },
        { id: 'not_today', label: 'Not today', action: 'not_today' },
      ],
      plan,
    };
  }
  return { kind: 'none', buttons: [], plan: null };
}

/** The question beat's buttons: its choices, then Something else and Skip. */
export function questionButtons(choices) {
  const clean = [];
  for (const c of choices || []) {
    const s = String(c || '').trim();
    if (s && s.length <= 40 && !clean.some((x) => x.toLowerCase() === s.toLowerCase()))
      clean.push(s);
  }
  return [
    ...clean
      .slice(0, 4)
      .map((c, i) => ({ id: `answer_${i}`, label: c, action: 'answer', value: c })),
    { id: 'answer_other', label: 'Something else', action: 'answer_other' },
    { id: 'skip', label: 'Skip', action: 'skip' },
  ];
}
