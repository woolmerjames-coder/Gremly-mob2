/**
 * The kinds of a fact (data fabric stage 2). Each kind answers one question:
 * what sort of statement is this? The area of life a fact belongs to comes
 * from the World it is filed under, not from its kind, and health is a flag of
 * its own, so one fact never needs two kinds.
 *
 * The reader gives each new fact a kind and a health flag, and the kind pass
 * (workers/inngest-jobs/context/kinds.js) gives one to every fact that has
 * none. scripts/sql/fact_kinds_check.sql holds
 * life_facts.kind to this list once every fact has one.
 */

export const FACT_KINDS = [
  'event',
  'routine',
  'goal',
  'preference',
  'relationship',
  'situation',
  'self',
];

const KIND_SET = new Set(FACT_KINDS);

/** The kind as given, when it is one of the list; otherwise none. */
export function validKind(kind) {
  return typeof kind === 'string' && KIND_SET.has(kind) ? kind : null;
}

/** The rule every prompt that gives a fact its kind carries. */
export const KIND_RULES = `KINDS
- Give each fact one kind, by what sort of statement it is:
  event: something that happens at a time, ahead or past.
  routine: something done regularly.
  goal: something being worked towards.
  preference: something liked, disliked, wanted or avoided.
  relationship: who someone is to the person, or how things stand between them.
  situation: how something in their life stands for a stretch of time.
  self: who the person is and how they see themselves.
- The kind is the sort of statement, never the area of life it is about. When more than one could fit, choose the one the statement is mainly saying.
- Mark health when the fact concerns anyone's body or mind, their health or their care. It decides how Gremly writes about the fact, never whether it is kept.`;
