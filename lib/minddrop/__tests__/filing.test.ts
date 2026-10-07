/**
 * Where a new drop was filed, read from filing's reply (lib/minddrop/filing.ts,
 * data fabric stage 4a).
 */
import { filingFromReply } from '../filing';

const AT = '2026-10-07T15:00:00.000Z';

test('reads where the drop went', () => {
  expect(
    filingFromReply(
      {
        world_links: 1,
        chapter_links: 1,
        filed: {
          by: 'gremly',
          world: { id: 'w', name: 'Home' },
          chapter: { id: 'c', title: 'Porto in November' },
          starts_something: false,
        },
      },
      AT,
    ),
  ).toEqual({
    by: 'gremly',
    world: { id: 'w', name: 'Home' },
    chapter: { id: 'c', title: 'Porto in November' },
    startsSomething: false,
    at: AT,
  });
});

test('filed nowhere, and the start of something', () => {
  expect(
    filingFromReply({ filed: { by: null, world: null, chapter: null, starts_something: true } }, AT),
  ).toEqual({ by: null, world: null, chapter: null, startsSomething: true, at: AT });
});

test('an older cortex sends no filing, and a broken one is not read as a place', () => {
  expect(filingFromReply({ world_links: 2, chapter_links: 0 }, AT)).toBeNull();
  expect(filingFromReply(null, AT)).toBeNull();
  expect(
    filingFromReply({ filed: { by: 'someone', world: { id: 1, name: 'x' }, chapter: 'c' } }, AT),
  ).toEqual({ by: null, world: null, chapter: null, startsSomething: false, at: AT });
});

test('a filing that could not run is no decision, so nothing is kept', () => {
  expect(
    filingFromReply(
      {
        skipped: true,
        skipped_reason: 'model_failed',
        filed: { by: null, world: null, chapter: null, starts_something: false },
      },
      AT,
    ),
  ).toBeNull();
});
