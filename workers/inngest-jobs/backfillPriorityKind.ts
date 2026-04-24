/**
 * Priority Kind Backfill (one-shot)
 *
 * Trigger: app/backfill.priority-kind
 * Optional event data: { user_id?: string }  -- omit to run for all users
 *
 * Enriches existing open, non-archived todos where priority_kind IS NULL by
 * calling the Cortex worker's enrich-phase2 endpoint (bucket: 'todo').
 *
 * Batches of 10, parallel within a batch via Promise.allSettled.
 * Writes priority_kind_source = 'dco' to distinguish from weekly classifier runs.
 *
 * Env vars required (in addition to existing SUPABASE_* vars):
 *   CORTEX_WORKER_URL — base URL of the Cortex Cloudflare Worker
 *                       e.g. https://gentle-thunder-5854.woolmerjames.workers.dev
 */

import { Inngest } from 'inngest';

// ── Types ────────────────────────────────────────────────────────────────────

interface TodoRow {
  id: string;
  owner_id: string;
  name: string | null;
  body: string | null;
  notes: string | null;
}

type Outcome = 'filled' | 'skipped_no_value' | 'skipped_invalid_value' | 'errored';

interface BatchResult {
  todo_id: string;
  outcome: Outcome;
  priority_kind?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_PRIORITY_KINDS = ['action', 'blocker', 'waiting', 'decision', 'momentum'] as const;
type PriorityKind = (typeof VALID_PRIORITY_KINDS)[number];

const BATCH_SIZE = 10;
const INTER_BATCH_DELAY_MS = 500;

// ── Factory export ───────────────────────────────────────────────────────────

export function createBackfillPriorityKind(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    {
      id: 'backfill-priority-kind',
      name: 'Backfill priority_kind on open todos',
    },
    { event: 'app/backfill.priority-kind' },
    async ({ event, step, env }: { event: any; step: any; env: any }) => {
      const supabaseHeaders = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };

      const userFilter = event.data?.user_id
        ? `&owner_id=eq.${encodeURIComponent(event.data.user_id)}`
        : '';

      // ── 1. Fetch eligible todos ─────────────────────────────────────────
      const todos: TodoRow[] = await step.run('fetch-eligible-todos', async () => {
        const url =
          `${env.SUPABASE_URL}/rest/v1/todos` +
          `?priority_kind=is.null` +
          `&archived=eq.false` +
          `&completed_at=is.null` +
          userFilter +
          `&select=id,owner_id,name,body,notes` +
          `&order=created_at.desc`;

        const res = await fetch(url, { headers: supabaseHeaders });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(
            `[BackfillPriorityKind] todos fetch failed: ${res.status} ${text.substring(0, 200)}`,
          );
        }
        const data = await res.json();
        return Array.isArray(data) ? (data as TodoRow[]) : [];
      });

      console.log(`[BackfillPriorityKind] ${todos.length} eligible todos`);

      if (todos.length === 0) {
        return {
          total_eligible: 0,
          filled: 0,
          skipped_no_value: 0,
          skipped_invalid_value: 0,
          errored: 0,
        };
      }

      // ── 2. Slice into batches ───────────────────────────────────────────
      const batches: TodoRow[][] = [];
      for (let i = 0; i < todos.length; i += BATCH_SIZE) {
        batches.push(todos.slice(i, i + BATCH_SIZE));
      }

      let filled = 0;
      let skipped_no_value = 0;
      let skipped_invalid_value = 0;
      let errored = 0;

      const cortexUrl = env.CORTEX_WORKER_URL;
      const today = new Date().toISOString().slice(0, 10);
      const dayOfWeek = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

      // ── 3. Process batches ──────────────────────────────────────────────
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const stepLabel = `batch-${batchIdx + 1}-of-${batches.length}`;

        const batchResults: BatchResult[] = await step.run(stepLabel, async () => {
          const settled = await Promise.allSettled(
            batch.map(async (todo): Promise<BatchResult> => {
              const text = (todo.body ?? todo.notes ?? todo.name ?? '').trim();
              if (!text) {
                console.log(`[BackfillPriorityKind] ${todo.id}: skipped — no text`);
                return { todo_id: todo.id, outcome: 'skipped_no_value' };
              }

              // Call Cortex enrich-phase2 (unauthenticated, stateless route)
              let priorityKind: string | undefined;
              try {
                const cortexRes = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'enrich-phase2',
                    text: text.substring(0, 1500),
                    bucket: 'todo',
                    subtype: null,
                    currentDate: today,
                    timezone: 'UTC',
                    dayOfWeek,
                  }),
                });

                if (!cortexRes.ok) {
                  console.warn(
                    `[BackfillPriorityKind] cortex ${cortexRes.status} for todo ${todo.id}`,
                  );
                  return { todo_id: todo.id, outcome: 'errored' };
                }

                const json = (await cortexRes.json()) as any;
                priorityKind = json.priority_kind;
              } catch (err) {
                console.warn(
                  `[BackfillPriorityKind] cortex network error for ${todo.id}`,
                  String(err),
                );
                return { todo_id: todo.id, outcome: 'errored' };
              }

              if (!priorityKind) {
                console.log(`[BackfillPriorityKind] ${todo.id}: cortex returned no priority_kind`);
                return { todo_id: todo.id, outcome: 'skipped_no_value' };
              }

              if (!VALID_PRIORITY_KINDS.includes(priorityKind as PriorityKind)) {
                console.log(
                  `[BackfillPriorityKind] ${todo.id}: invalid priority_kind value "${priorityKind}"`,
                );
                return { todo_id: todo.id, outcome: 'skipped_invalid_value' };
              }

              // PATCH the todo row
              try {
                const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/todos?id=eq.${todo.id}`, {
                  method: 'PATCH',
                  headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
                  body: JSON.stringify({
                    priority_kind: priorityKind,
                    priority_kind_source: 'dco',
                    priority_kind_updated_at: new Date().toISOString(),
                  }),
                });
                if (!patchRes.ok) {
                  const errText = await patchRes.text().catch(() => '');
                  console.warn(
                    `[BackfillPriorityKind] patch failed for ${todo.id}: ${patchRes.status} ${errText.substring(0, 200)}`,
                  );
                  return { todo_id: todo.id, outcome: 'errored' };
                }
                return { todo_id: todo.id, outcome: 'filled', priority_kind: priorityKind };
              } catch (err) {
                console.warn(
                  `[BackfillPriorityKind] patch network error for ${todo.id}`,
                  String(err),
                );
                return { todo_id: todo.id, outcome: 'errored' };
              }
            }),
          );

          return settled.map(
            (r): BatchResult =>
              r.status === 'fulfilled' ? r.value : { todo_id: 'unknown', outcome: 'errored' },
          );
        });

        // Accumulate counters
        for (const r of batchResults) {
          if (r.outcome === 'filled') filled++;
          else if (r.outcome === 'skipped_no_value') skipped_no_value++;
          else if (r.outcome === 'skipped_invalid_value') skipped_invalid_value++;
          else errored++;
        }

        console.log(
          `[BackfillPriorityKind] batch ${batchIdx + 1}/${batches.length}: ` +
            `filled=${filled} skipped_nv=${skipped_no_value} ` +
            `skipped_iv=${skipped_invalid_value} errored=${errored}`,
        );

        // Rate-limit sleep between batches (skip after last batch)
        if (batchIdx < batches.length - 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
        }
      }

      return {
        total_eligible: todos.length,
        filled,
        skipped_no_value,
        skipped_invalid_value,
        errored,
      };
    },
  );
}
