/**
 * The stop switch for the old Worlds fields (workers/shared/worldsFields.js,
 * data fabric stage 4a).
 */
import { oldWorldsFieldsStopped, withoutOldFields } from '../worldsFields.js';

test('only the word stop stops them', () => {
  expect(oldWorldsFieldsStopped({ WORLDS_OLD_FIELDS: 'stop' })).toBe(true);
  expect(oldWorldsFieldsStopped({ WORLDS_OLD_FIELDS: ' stop ' })).toBe(true);
  for (const v of ['keep', '', 'STOP', 'on', undefined]) {
    expect(oldWorldsFieldsStopped({ WORLDS_OLD_FIELDS: v })).toBe(false);
  }
  expect(oldWorldsFieldsStopped(null)).toBe(false);
});

test('kept, a patch is untouched', () => {
  const patch = { key_priorities: [], arc_shape: 'rise', summary: 'x' };
  expect(withoutOldFields('chapters', patch, { WORLDS_OLD_FIELDS: 'keep' })).toBe(patch);
});

test('stopped, the old fields go with their source and time, and the rest stays', () => {
  const env = { WORLDS_OLD_FIELDS: 'stop' };
  expect(
    withoutOldFields(
      'chapters',
      {
        updated_at: 't',
        summary: 's',
        card_subtitle: 'c',
        card_subtitle_source: 'synthesis',
        key_priorities: [],
        key_priorities_source: 'synthesis',
        key_priorities_updated_at: 't',
        current_phase_key: 'k',
        phase_labels: [],
        arc_shape: 'a',
        arc_shape_source: 'classifier',
        key_moments: [],
        slip_events: [],
        target_description: 'd',
        target_summary: 'ts',
        chapter_type: 'trip',
      },
      env,
    ),
  ).toEqual({ updated_at: 't', summary: 's', card_subtitle: 'c', card_subtitle_source: 'synthesis' });
  expect(
    withoutOldFields(
      'worlds',
      {
        summary: 's',
        signal_velocity: 1,
        signal_velocity_delta: 'growing',
        world_type: 'w',
        world_type_source: 'classifier',
        world_type_updated_at: 't',
        key_priorities: [],
        archetypes: [],
        module_layout: {},
        mascot_slug: 'm',
      },
      env,
    ),
  ).toEqual({ summary: 's', mascot_slug: 'm' });
});
