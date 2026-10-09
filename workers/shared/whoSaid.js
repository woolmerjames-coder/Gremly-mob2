/**
 * Who someone is to the person, as a prompt line says it (18 Oct): as they
 * said it, or, when the records made it plain and no one said it, as Gremly
 * understood it (life_people.relationship_by understood, inngest-jobs
 * context/unsure.js). Every writer uses either as known; the words say whose
 * it is, so none of them presents Gremly's understanding as their words.
 */

/** The line for who someone is, or the fallback when it is not known. Pure. */
export function whoSaid(p, none = '') {
  if (!p?.relationship) return none;
  return p.relationship_by === 'understood'
    ? `${p.relationship}, as Gremly understood it from the records`
    : `${p.relationship}, as they said`;
}
