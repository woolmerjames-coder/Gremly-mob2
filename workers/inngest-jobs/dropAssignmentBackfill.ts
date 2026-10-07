/**
 * Drop filing backfill: files what someone already has, by the same rules as
 * a new drop (context/filing.js, data fabric stage 4a).
 *
 * Trigger: app/drops.assignment-backfill
 * Event data: { user_id: string, refile?: boolean, batch_size?: number }
 *
 * Without refile it files only the drops that are filed nowhere yet: that is
 * what first Worlds will send for a new person (stage 4b). With refile it files
 * every drop again, replacing Gremly's own earlier filing of each one. What the
 * person placed themselves is never touched, and no call is made for it.
 *
 * Each batch is its own Inngest step, so a run that stops can be sent again;
 * the writes replace rather than add, so a second run changes nothing it has
 * already settled. One call a drop, on the filing model (Luna).
 */

import { Inngest } from 'inngest';
import {
  fileDrop,
  listDropsToFile,
  loadGraph,
  loadPlaced,
  personToday,
  type FilingDrop,
} from './context/filing.js';

const DEFAULT_BATCH_SIZE = 20;
/** Calls at once inside a batch. */
const AT_ONCE = 4;

interface BatchSummary {
  batch: number;
  drops: number;
  filed_world: number;
  filed_chapter: number;
  filed_nowhere: number;
  person_placed: number;
  starts_something: number;
  skipped: Record<string, number>;
}

async function inTurn<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function createDropAssignmentBackfill(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    {
      id: 'drop-assignment-backfill',
      name: 'Drop Assignment Backfill (one-shot)',
      retries: 0,
      concurrency: [{ key: 'event.data.user_id', limit: 1 }],
    },
    { event: 'app/drops.assignment-backfill' },
    async ({ event, step, env }: { event: any; step: any; env: any }) => {
      const userId: string = event.data?.user_id;
      if (!userId) throw new Error('user_id is required in event.data');
      const refile = event.data?.refile === true;
      const batchSize: number = Math.max(1, Math.min(50, event.data?.batch_size ?? DEFAULT_BATCH_SIZE));

      const before: string = await step.run('resolve-start', async () => new Date().toISOString());

      const drops: FilingDrop[] = await step.run('list-drops', () =>
        listDropsToFile(env, userId, { before, refile }),
      );

      if (!drops.length) return { refile, drops: 0, batches: [] };

      const { graph, placed, today } = await step.run('load-graph', async () => {
        const g = await loadGraph(env, userId);
        const p = await loadPlaced(env, userId);
        // Maps do not survive a step's result, so they travel as entries
        return {
          graph: g,
          placed: { worlds: [...p.worlds.entries()], chapters: [...p.chapters.entries()] },
          today: await personToday(env, userId),
        };
      });
      if (!graph.worlds.length && !graph.chapters.length && !graph.contexts.length) {
        return { refile, drops: drops.length, batches: [], skipped: 'empty_graph' };
      }
      const placedMaps = {
        worlds: new Map<string, string[]>(placed.worlds),
        chapters: new Map<string, string[]>(placed.chapters),
      };

      const batches: BatchSummary[] = [];
      const total = Math.ceil(drops.length / batchSize);
      for (let i = 0; i < total; i++) {
        const batch = drops.slice(i * batchSize, (i + 1) * batchSize);
        const summary: BatchSummary = await step.run(`batch-${i + 1}-of-${total}`, async () => {
          const filed = await inTurn(batch, (drop) =>
            fileDrop(env, { userId, drop, today, graph, placed: placedMaps }),
          );
          const s: BatchSummary = {
            batch: i + 1,
            drops: batch.length,
            filed_world: 0,
            filed_chapter: 0,
            filed_nowhere: 0,
            person_placed: 0,
            starts_something: 0,
            skipped: {},
          };
          for (const f of filed) {
            if (f.skipped) {
              const why = f.skipped_reason || 'unknown';
              s.skipped[why] = (s.skipped[why] || 0) + 1;
              continue;
            }
            if (f.by === 'person') s.person_placed++;
            else if (f.chapter) s.filed_chapter++;
            else if (f.world) s.filed_world++;
            else s.filed_nowhere++;
            if (f.starts_something) s.starts_something++;
          }
          return s;
        });
        batches.push(summary);
      }
      return { refile, drops: drops.length, batches };
    },
  );
}
