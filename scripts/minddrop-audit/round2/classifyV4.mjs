// classify v4: the v3.5 prompt plus
//   - ordered decision steps,
//   - three rules the labellers had but the prompt lacked,
//   - a short reason and a checklist of plain facts written before the outcome,
// and code gates that enforce the product owner's rules from those facts.
// Semantic rules only: no examples, no word lists.
import {
  buildClassifyV3Prompt,
  normalizeClassifyV3,
  parseModelJson,
  formatDropMessage,
} from './prompts/v3.5b.js';

export const V4_VERSION = 'v4.0-checklist-gates-v2';

const STEPS = `HOW TO DECIDE (work through these in order)
1. Count the separate items. If two or more would each become their own entry, the drop is multi: classify each item on its own and stop.
2. Work out what the user is doing with the drop: committing to an action, repeating a behaviour, processing a feeling, floating a possibility, noting an occasion, or keeping a fact. The overall frame decides.
3. If it looks like a repeated behaviour, apply the habit test in principle 3. If it fails, the drop is a todo when it names a concrete action, a journal when the user is processing it, and otherwise ambiguous.
4. If it is tied to a date or time, apply the date test in principle 6.
5. Only if two readings are still about equally natural, choose ambiguous with the ambiguity type whose question would settle it.

`;

const EXTRA_PRINCIPLES = `11. A note to self about fixing, building or changing something the user is responsible for is a todo, even when it is worded as an observation of a problem.
12. A missing time, place, person or other detail never makes a drop ambiguous on its own.
13. Test drops, gibberish and questions to the app are still drops; give them the most natural outcome.
`;

const FACTS = `FACTS (fill these in about the drop before deciding; true or false unless stated)
concrete_action: the drop names a specific thing the user could do.
user_does_it: the user is the one who would do or repeat it.
repetition_stated: the drop itself says how often, or ties the behaviour to a recurring part of the user's routine.
one_occasion: the drop points to a single occasion or a bounded period.
processing_feeling: the drop expresses or works through a feeling or a reflection.
has_date_or_time: the drop names a specific date or time.
unsure_whether_to_act: the user is unsure whether to act at all, or is floating a possibility.
separate_items: the number of separate items that would each become their own entry (a number).

`;

// v4.1: the same ordered steps and extra rules, without the reason and
// checklist fields (shorter output, so faster).
export function buildV41Prompt() {
  let p = buildClassifyV3Prompt();
  const insertAt = p.indexOf('PRINCIPLES\n');
  p = p.slice(0, insertAt) + STEPS + p.slice(insertAt);
  const afterPrinciples = p.indexOf('\nAMBIGUITY TYPES');
  return p.slice(0, afterPrinciples) + EXTRA_PRINCIPLES + p.slice(afterPrinciples);
}

export function buildV4Prompt() {
  let p = buildClassifyV3Prompt();
  const insertAt = p.indexOf('PRINCIPLES\n');
  p = p.slice(0, insertAt) + STEPS + p.slice(insertAt);
  const afterPrinciples = p.indexOf('\nAMBIGUITY TYPES');
  p = p.slice(0, afterPrinciples) + EXTRA_PRINCIPLES + p.slice(afterPrinciples);
  const out = p.indexOf('OUTPUT\n');
  p = p.slice(0, out) + FACTS + p.slice(out);
  p = p.replace(
    'Return one JSON object and nothing else, with these fields:\n',
    'Return one JSON object and nothing else, with these fields in this order:\nreason (one short sentence on what the user wants, written first); facts (an object with the fields listed under FACTS); ',
  );
  return p;
}

// Product owner's rules, enforced from the model's own facts.
// v2 (after the first design-set run): break habits are ongoing by nature, so
// they need a concrete behaviour and no single occasion, not a stated
// frequency; and the "ask to todo" gate is gone (a bare noun is rightly a
// question even when a concrete action is imaginable).
export function gateLabel(label, f = {}) {
  if (label !== 'habit/start_habit' && label !== 'habit/break_habit') return { label, gate: null };
  const ongoing = f.concrete_action !== false && f.one_occasion !== true;
  const passes = label === 'habit/break_habit' ? ongoing : ongoing && f.repetition_stated === true;
  if (passes) return { label, gate: null };
  if (f.processing_feeling === true) return { label: 'log/journal', gate: 'habit_to_journal' };
  if (f.concrete_action === true) return f.unsure_whether_to_act === true ? { label: 'ambiguous', type: 'habit_or_todo', gate: 'habit_to_ask' } : { label: 'todo', gate: 'habit_to_todo' };
  return { label: 'ambiguous', type: 'vague_aspiration', gate: 'habit_to_ask' };
}

export function applyGates(parsed, text) {
  const base = normalizeClassifyV3(parsed, text);
  if (!base) return null;
  const f = parsed && typeof parsed.facts === 'object' && parsed.facts ? parsed.facts : {};
  if (base.is_multi || base.bucket !== 'habit') return { ...base, gate: null, pre_gate: base, facts: f };
  const g = gateLabel(`habit/${base.habitSubtype || 'start_habit'}`, f);
  if (!g.gate) return { ...base, gate: null, pre_gate: base, facts: f };
  const outcome = g.label === 'todo' ? 'todo' : g.label === 'ambiguous' ? 'ambiguous' : g.label.split('/')[1];
  const res = normalizeClassifyV3({ ...parsed, outcome, bucket: undefined, subtype: undefined, habit_subtype: undefined, is_multi: false, segments: [], ambiguity_type: g.type || null, question: null, option_labels: [] }, text);
  return { ...res, gate: g.gate, pre_gate: base, facts: f };
}

export { parseModelJson, formatDropMessage, normalizeClassifyV3 };
