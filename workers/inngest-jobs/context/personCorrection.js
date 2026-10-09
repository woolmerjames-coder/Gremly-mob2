/**
 * What someone types on the page Gremly keeps about someone in their life
 * when it is not right (Worlds rebuild, stage 5). Their name and who they are
 * to the person are read from their words here and kept as the person's own;
 * everything else they said is put right in the ledger like any correction
 * (corrections.js), which reads the facts about that someone first and ties
 * any new fact to them.
 *
 * The model reads the words; code keeps what it read, as theirs, so no later
 * read writes over it (a field the person wrote is never written over).
 */

import { personBlock } from '../careRules';
import { jsonCall, modelFor } from './llm';
import { whoSaid } from '../../shared/whoSaid.js';

export const PERSON_CORRECTION_VERSION = 'person-correction-2026-10-20a';

const RULES = `WHAT THEY SAID ON SOMEONE'S PAGE
- The person opened the page Gremly keeps about someone in their life and said what is not right about it. Read only two things from their words: the someone's name, and who the someone is to them.
- name: the name the someone goes by, only when their words give it as the someone's own name, in their spelling. Null when their words give no name for the someone, or a name only for someone else.
- who: who the someone is to them now, only as their words state it, in words that name only that relationship from their side and never name anyone. Null when their words do not say who the someone is to them, or say it only of someone else.
- Never infer anything their words do not say. Everything else they said is read elsewhere.`;

export const PERSON_CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', nullable: true },
    who: { type: 'string', nullable: true },
  },
  required: ['name', 'who'],
};

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** The reader's request. Pure. */
export function personCorrectionRequest({ someone, names = [], said, marked = null, person }) {
  const others = names.filter(
    (n) => n && n.toLowerCase() !== String(someone.name || '').toLowerCase(),
  );
  return {
    system: {
      fixed: `You read what a person said about someone in their life, on the page Gremly keeps about that someone.\n\n${RULES}`,
      varying: personBlock(person),
    },
    user: `THE SOMEONE THE PAGE IS ABOUT: ${trim(someone.name, 60) || '(no name given yet)'}${others.length ? `, also called ${others.map((n) => trim(n, 40)).join(', ')}` : ''}${someone.relationship ? `, their ${whoSaid({ ...someone, relationship: trim(someone.relationship, 60) })}` : ', who they are to them is not recorded'}
${marked ? `WHAT THEY MARKED ON THE PAGE: "${trim(marked, 400)}"\n` : ''}WHAT THEY SAID: "${trim(said, 800)}"`,
  };
}

/** Read their words with the model. Writes nothing; the replay calls it too. */
export async function readPersonCorrection(
  env,
  { someone, names = [], said, marked = null, person },
) {
  return jsonCall(env, {
    primary: modelFor(env, 'personCorrection'),
    fallback: modelFor(env, 'personCorrectionFallback'),
    ...personCorrectionRequest({ someone, names, said, marked, person }),
    schema: PERSON_CORRECTION_SCHEMA,
    maxTokens: 600,
    effort: 'low',
    thinking: 'low',
  });
}

/**
 * What the read does to the record, as a patch, or null. Their words are
 * theirs from now on, over anything written before, and a name that is the
 * one already kept changes nothing. Pure.
 */
export function personCorrectionPatch(someone, output, nowIso) {
  const name = trim(output?.name, 80);
  const who = trim(output?.who, 60);
  const patch = {};
  if (name && name !== someone.name) Object.assign(patch, { name, name_by: 'person' });
  if (who && who.toLowerCase() !== String(someone.relationship || '').toLowerCase())
    Object.assign(patch, {
      relationship: who,
      relationship_by: 'person',
      relationship_fact_id: null,
    });
  return Object.keys(patch).length ? { ...patch, updated_at: nowIso } : null;
}

/**
 * Read and keep their name and who they are, from what they said on the
 * someone's page. Returns what changed.
 */
export async function applyPersonCorrection(
  env,
  d,
  { userId, someone, names = [], said, marked = null, person, nowIso },
) {
  const { output, model } = await readPersonCorrection(env, {
    someone,
    names,
    said,
    marked,
    person,
  });
  const patch = personCorrectionPatch(someone, output, nowIso);
  if (!patch) return { changed: false, model, version: PERSON_CORRECTION_VERSION };
  await d.update(`life_people?id=eq.${someone.id}&user_id=eq.${userId}`, patch);
  if (patch.name)
    await d.insertIgnore(
      'life_person_names',
      [{ person_id: someone.id, user_id: userId, name: patch.name, by: 'person' }],
      'person_id,name',
    );
  return {
    changed: true,
    name: patch.name || null,
    who: patch.relationship || null,
    model,
    version: PERSON_CORRECTION_VERSION,
  };
}
