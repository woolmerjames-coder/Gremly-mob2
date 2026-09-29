// Focused prompts for the specialists in design 2 (fast gate, then
// specialists). Semantic rules only: no examples, no word lists. Each reuses
// the exact outcome definitions, ambiguity types and question rules of the
// main prompt so the answers mean the same thing.
import { buildV4Prompt } from './classifyV4.mjs';

const MAIN = buildV4Prompt();
const section = (start, end) => {
  const i = MAIN.indexOf(start);
  const j = end ? MAIN.indexOf(end, i + 1) : MAIN.length;
  return MAIN.slice(i, j).trim();
};
const INTRO = MAIN.slice(0, MAIN.indexOf('OUTCOMES')).trim();
const OUTCOMES = section('OUTCOMES', 'HOW TO DECIDE');
const PRINCIPLES = section('PRINCIPLES', 'AMBIGUITY TYPES');
const TYPES = section('AMBIGUITY TYPES', 'CLARIFYING QUESTION');
const QUESTION = section('CLARIFYING QUESTION', 'FACTS');

export function habitSpecialistPrompt() {
  return `${INTRO}

A first pass thinks this drop may be something the user wants to repeat. Your only job is to decide whether it really should become a habit, applying the product owner's strict rule: a habit is a commitment the user has to keep up in the app, so it is only right for a concrete behaviour the user could log each time as done or not done, when the drop itself makes the repetition clear by saying how often or by tying it to a recurring part of the user's routine. When repetition is only implied, or the drop could as easily mean one occasion, it is not a habit.

${OUTCOMES}

${PRINCIPLES}

${TYPES}

${QUESTION}

OUTPUT
Return one JSON object and nothing else: reason (one short sentence, written first); outcome (exactly one of "start_habit", "break_habit", "todo", "journal", "idea", "ambiguous"); confidence (0 to 1); ambiguity_type (one of the ambiguity types when the outcome is ambiguous, otherwise null); question (string or null); option_labels (array, empty unless ambiguous); habit_direction ("build", "break" or null); is_multi (false); segments (empty array).`;
}

export function multiSpecialistPrompt() {
  return `${INTRO}

A first pass thinks this drop may hold more than one item. Your job is to decide whether it really does and, if so, to split it and classify every item. Two or more separate items that would each become their own entry are multi. One item with several details, one action applied to several things, or one thought that mentions a related plan, is one item. A feeling alongside a separate, clearly stated action is two items. Read every item in the context of the whole drop: the words around an item can change what it means.

${OUTCOMES}

${PRINCIPLES}

${TYPES}

${QUESTION}

OUTPUT
Return one JSON object and nothing else: reason (one short sentence, written first); is_multi (boolean); segments (array, empty unless is_multi; each has text, the user's exact words for that item, and outcome, which is any outcome except ambiguous); and, for the drop as a whole when it is not multi: outcome (exactly one of "todo", "start_habit", "break_habit", "journal", "idea", "event", "general", "ambiguous"); confidence (0 to 1); ambiguity_type (or null); question (or null); option_labels (array); habit_direction ("build", "break" or null). When it is multi, set outcome to the outcome of the first segment.`;
}

export function questionSpecialistPrompt() {
  return `${INTRO}

A first pass could not tell what the user wants the app to do with this drop and wants to ask them. A question costs the user a tap and interrupts them, so first decide whether one is really needed. If one reading is clearly the most natural, give that outcome instead. Only if two or more readings are about equally natural, keep the outcome ambiguous, choose the ambiguity type whose question would settle it, and write the question and labels.

${OUTCOMES}

${PRINCIPLES}

${TYPES}

${QUESTION}

OUTPUT
Return one JSON object and nothing else: reason (one short sentence, written first); outcome (exactly one of "todo", "start_habit", "break_habit", "journal", "idea", "event", "general", "ambiguous"); confidence (0 to 1); ambiguity_type (one of the ambiguity types when ambiguous, otherwise null); question (string or null); option_labels (array, empty unless ambiguous); habit_direction ("build", "break" or null); is_multi (false); segments (empty array).`;
}
