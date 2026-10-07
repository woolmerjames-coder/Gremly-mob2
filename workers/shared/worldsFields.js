/**
 * The stop switch for the old Worlds fields (data fabric stage 4a).
 *
 * Section A of docs/worlds/FOR_THE_PIPELINE.md lists the fields the old Worlds
 * screens were written for and the new design shows nowhere. They stop being
 * written when the Worlds build says the old screens are gone, at its stage 4.
 * Until then the old screens still read them, so the switch stays at keep.
 *
 * One setting, WORLDS_OLD_FIELDS, read by every writer of those fields: the
 * weekly pass (context/weekly.js), the Sunday classifier's writer
 * (worldsWriter.ts) and filing (context/filing.js). Only the word stop stops
 * them; anything else, or nothing, keeps them. No column is dropped.
 */

/** The fields that stop, as each writer names them. */
export const OLD_WORLDS_FIELDS = Object.freeze({
  chapters: Object.freeze([
    'chapter_type',
    'arc_shape',
    'phase_labels',
    'current_phase_key',
    'key_moments',
    'slip_events',
    'key_priorities',
    'target_description',
    'target_summary',
  ]),
  worlds: Object.freeze([
    'archetypes',
    'module_layout',
    'signal_velocity',
    'signal_velocity_delta',
    'world_type',
    'key_priorities',
  ]),
});

/**
 * The World phases the old design wrote and the new one does not: in the new
 * design a World is there, or the person has hidden it.
 */
export const OLD_WORLD_PHASES = Object.freeze(['candidate', 'evolving', 'dormant']);

/** True once the old fields have stopped. */
export function oldWorldsFieldsStopped(env) {
  return String(env?.WORLDS_OLD_FIELDS ?? '').trim() === 'stop';
}

/** A patch without the old fields of one table, once they have stopped. */
export function withoutOldFields(table, patch, env) {
  if (!oldWorldsFieldsStopped(env) || !patch) return patch;
  const stop = new Set(OLD_WORLDS_FIELDS[table] || []);
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const field = k.replace(/_(source|updated_at)$/, '');
    if (!stop.has(field)) out[k] = v;
  }
  return out;
}
